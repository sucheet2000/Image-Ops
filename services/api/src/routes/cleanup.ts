import {
  cleanupRequestSignature,
  isCleanupReplayAllowed,
  normalizeObjectKeys,
  type CleanupIdempotencyRecord,
} from '@imageops/core';
import { ulid } from 'ulid';
import { z } from 'zod';
import type { Router } from 'express';
import type { ApiConfig } from '../config';
import { asyncHandler } from '../lib/async-handler';
import { logInfo } from '../lib/log';
import type { JobRepository } from '../services/job-repo';
import type { ObjectStorageService } from '../services/storage';

const cleanupSchema = z.object({
  objectKeys: z.array(z.string().min(1)).min(1).max(100),
  reason: z.enum(['delivered', 'page_exit', 'ttl_expiry', 'manual']).default('page_exit'),
});
const CLEANUP_IN_PROGRESS_STATUS = 102;
const VALID_CLEANUP_KEY = /^tmp\/[a-zA-Z0-9_.\-/]+$/;

/**
 * Register the POST /api/cleanup route that performs idempotent deletion of object keys with auditing.
 *
 * The route requires an `idempotency-key` header and validates the request body against the cleanup schema.
 * If the key was seen before, the handler either rejects with 409 when the payload differs or replays the stored response
 * (setting `x-idempotent-replay: true`). On a new request, the handler deletes the normalized object keys from storage,
 * appends deletion audit records for each deleted or not-found key, persists an idempotency record with a TTL, logs the
 * execution, and responds with HTTP 202 including counts and the idempotency key. Validation failures return 400.
 *
 * @param router - Express router on which to register the cleanup route.
 * @param deps - Dependency bag used by the route:
 *   - config.cleanupIdempotencyTtlSeconds: TTL for persisted idempotency records.
 *   - storage: object storage service (used to delete objects).
 *   - jobRepo: job repository (used to read/set idempotency records and append audits).
 *   - now: function returning the current Date for timestamping audit and idempotency records.
 */
export function registerCleanupRoutes(
  router: Router,
  deps: {
    config: ApiConfig;
    storage: ObjectStorageService;
    jobRepo: JobRepository;
    now: () => Date;
  }
): void {
  router.post(
    '/api/cleanup',
    asyncHandler(async (req, res) => {
      const idempotencyKey = String(req.header('idempotency-key') || '').trim();
      if (!idempotencyKey) {
        res.status(400).json({
          error: 'IDEMPOTENCY_KEY_REQUIRED',
          message: 'idempotency-key header is required.',
        });
        return;
      }

      const parsed = cleanupSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'INVALID_CLEANUP_REQUEST', details: parsed.error.flatten() });
        return;
      }

      const objectKeys = normalizeObjectKeys(parsed.data.objectKeys);
      if (objectKeys.length === 0) {
        res.status(400).json({
          error: 'INVALID_CLEANUP_REQUEST',
          message: 'Cleanup keys must be under tmp/ prefix.',
        });
        return;
      }
      const hasInvalidKey = objectKeys.some(
        (value) => !VALID_CLEANUP_KEY.test(value) || value.includes('..') || value.includes('//')
      );
      if (hasInvalidKey) {
        res.status(400).json({
          error: 'invalid_key',
          message:
            'Key must start with tmp/ and contain only alphanumeric characters, dots, hyphens, underscores, and forward slashes.',
        });
        return;
      }
      const signature = cleanupRequestSignature(objectKeys);

      const existing = await deps.jobRepo.getCleanupIdempotency(idempotencyKey);
      if (existing) {
        if (!isCleanupReplayAllowed(existing.signature, signature)) {
          res.status(409).json({
            error: 'IDEMPOTENCY_KEY_CONFLICT',
            message: 'idempotency-key already used with a different cleanup payload.',
          });
          return;
        }

        if (existing.status !== CLEANUP_IN_PROGRESS_STATUS) {
          res.setHeader('x-idempotent-replay', 'true');
          res.status(existing.status).json(existing.response);
          return;
        }
      }

      const nowIso = deps.now().toISOString();
      const inProgressRecord: CleanupIdempotencyRecord = {
        signature,
        response: {
          accepted: true,
          cleaned: 0,
          notFound: 0,
          idempotencyKey,
        },
        status: CLEANUP_IN_PROGRESS_STATUS,
        createdAt: nowIso,
      };
      await deps.jobRepo.setCleanupIdempotency(
        idempotencyKey,
        inProgressRecord,
        deps.config.cleanupIdempotencyTtlSeconds
      );

      const result = await deps.storage.deleteObjects(objectKeys);

      for (const objectKey of result.deleted) {
        await deps.jobRepo.appendDeletionAudit({
          id: ulid(),
          objectKey,
          reason: parsed.data.reason,
          result: 'success',
          createdAt: nowIso,
        });
      }

      for (const objectKey of result.notFound) {
        await deps.jobRepo.appendDeletionAudit({
          id: ulid(),
          objectKey,
          reason: parsed.data.reason,
          result: 'not_found',
          createdAt: nowIso,
        });
      }

      const response = {
        accepted: true as const,
        cleaned: result.deleted.length,
        notFound: result.notFound.length,
        idempotencyKey,
      };

      const idempotencyRecord: CleanupIdempotencyRecord = {
        signature,
        response,
        status: 202,
        createdAt: nowIso,
      };

      await deps.jobRepo.setCleanupIdempotency(
        idempotencyKey,
        idempotencyRecord,
        deps.config.cleanupIdempotencyTtlSeconds
      );

      logInfo('cleanup.executed', {
        idempotencyKey,
        cleaned: result.deleted.length,
        notFound: result.notFound.length,
      });

      res.status(202).json(response);
    })
  );
}
