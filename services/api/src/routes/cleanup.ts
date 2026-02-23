import { cleanupRequestSignature, isCleanupReplayAllowed, normalizeObjectKeys, type CleanupIdempotencyRecord } from "@image-ops/core";
import { ulid } from "ulid";
import { z } from "zod";
import type { Router } from "express";
import type { ApiConfig } from "../config";
import { asyncHandler } from "../lib/async-handler";
import { logInfo } from "../lib/log";
import type { JobRepository } from "../services/job-repo";
import type { ObjectStorageService } from "../services/storage";

const cleanupSchema = z.object({
  objectKeys: z.array(z.string().min(1)).min(1).max(100),
  reason: z.enum(["delivered", "page_exit", "ttl_expiry", "manual"]).default("page_exit")
});

export function registerCleanupRoutes(
  router: Router,
  deps: {
    config: ApiConfig;
    storage: ObjectStorageService;
    jobRepo: JobRepository;
    now: () => Date;
  }
): void {
  router.post("/api/cleanup", asyncHandler(async (req, res) => {
    const idempotencyKey = String(req.header("idempotency-key") || "").trim();
    if (!idempotencyKey) {
      res.status(400).json({ error: "IDEMPOTENCY_KEY_REQUIRED", message: "idempotency-key header is required." });
      return;
    }

    const parsed = cleanupSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "INVALID_CLEANUP_REQUEST", details: parsed.error.flatten() });
      return;
    }

    const objectKeys = normalizeObjectKeys(parsed.data.objectKeys);
    const signature = cleanupRequestSignature(objectKeys);

    const existing = await deps.jobRepo.getCleanupIdempotency(idempotencyKey);
    if (existing) {
      if (!isCleanupReplayAllowed(existing.signature, signature)) {
        res.status(409).json({
          error: "IDEMPOTENCY_KEY_CONFLICT",
          message: "idempotency-key already used with a different cleanup payload."
        });
        return;
      }

      res.setHeader("x-idempotent-replay", "true");
      res.status(existing.status).json(existing.response);
      return;
    }

    const result = await deps.storage.deleteObjects(objectKeys);
    const nowIso = deps.now().toISOString();

    for (const objectKey of result.deleted) {
      await deps.jobRepo.appendDeletionAudit({
        id: ulid(),
        objectKey,
        reason: parsed.data.reason,
        result: "success",
        createdAt: nowIso
      });
    }

    for (const objectKey of result.notFound) {
      await deps.jobRepo.appendDeletionAudit({
        id: ulid(),
        objectKey,
        reason: parsed.data.reason,
        result: "not_found",
        createdAt: nowIso
      });
    }

    const response = {
      accepted: true as const,
      cleaned: result.deleted.length,
      notFound: result.notFound.length,
      idempotencyKey
    };

    const idempotencyRecord: CleanupIdempotencyRecord = {
      signature,
      response,
      status: 202,
      createdAt: nowIso
    };

    await deps.jobRepo.setCleanupIdempotency(idempotencyKey, idempotencyRecord, deps.config.cleanupIdempotencyTtlSeconds);

    logInfo("cleanup.executed", {
      idempotencyKey,
      cleaned: result.deleted.length,
      notFound: result.notFound.length
    });

    res.status(202).json(response);
  }));
}
