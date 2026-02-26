import { timingSafeEqual } from 'node:crypto';
import { type ImageJobQueuePayload } from '@imageops/core';
import { Queue } from 'bullmq';
import type { NextFunction, Request, Response, Router } from 'express';
import IORedis from 'ioredis';
import type { ApiConfig } from '../config';
import { asyncHandler } from '../lib/async-handler';

type DeadLetterPayload = {
  originalJobId?: string;
  originalJobName?: string;
  originalQueue: string;
  jobData: ImageJobQueuePayload;
  failedReason?: string;
  failedAt?: string;
  attemptsMade?: number;
};

function isAuthorizedByMetricsToken(req: Request): boolean {
  const metricsToken = process.env.METRICS_TOKEN;
  const authorization = req.header('authorization');
  const providedToken = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length).trim()
    : undefined;
  const providedTokenBuffer = providedToken ? Buffer.from(providedToken, 'utf8') : null;
  const metricsTokenBuffer = metricsToken ? Buffer.from(metricsToken, 'utf8') : null;
  return Boolean(
    providedTokenBuffer &&
    metricsTokenBuffer &&
    providedTokenBuffer.length === metricsTokenBuffer.length &&
    timingSafeEqual(providedTokenBuffer, metricsTokenBuffer)
  );
}

function requireMetricsToken(req: Request, res: Response, next: NextFunction): void {
  if (isAuthorizedByMetricsToken(req)) {
    next();
    return;
  }

  res.set('WWW-Authenticate', 'Bearer realm="metrics", error="invalid_token"');
  res.status(401).json({
    error: {
      code: 'UNAUTHORIZED',
      message: 'Invalid metrics token',
    },
  });
}

export function registerAdminRoutes(
  router: Router,
  deps: {
    config: ApiConfig;
  }
): void {
  router.get(
    '/api/admin/dlq',
    requireMetricsToken,
    asyncHandler(async (_req, res) => {
      const redis = new IORedis(deps.config.redisUrl, { maxRetriesPerRequest: null });
      const dlq = new Queue<DeadLetterPayload>('image-ops-dlq', { connection: redis });
      try {
        const jobs = await dlq.getJobs(['waiting', 'active', 'delayed', 'failed'], 0, 99, true);
        res.json({
          count: jobs.length,
          jobs: jobs.map((job) => ({
            id: job.id,
            name: job.name,
            state: job.finishedOn ? 'processed' : 'pending',
            queue: job.data?.originalQueue || null,
            originalJobId: job.data?.originalJobId || null,
            failedReason: job.data?.failedReason || job.failedReason || null,
            failedAt: job.data?.failedAt || null,
            attemptsMade: job.data?.attemptsMade ?? job.attemptsMade,
          })),
        });
      } finally {
        await dlq.close();
        await redis.quit();
      }
    })
  );

  router.post(
    '/api/admin/dlq/:jobId/retry',
    requireMetricsToken,
    asyncHandler(async (req, res) => {
      const rawJobId = req.params.jobId;
      const jobId = Array.isArray(rawJobId) ? rawJobId[0] : rawJobId;
      if (!jobId) {
        res.status(400).json({ error: 'INVALID_JOB_ID', message: 'DLQ jobId is required.' });
        return;
      }

      const redis = new IORedis(deps.config.redisUrl, { maxRetriesPerRequest: null });
      const dlq = new Queue<DeadLetterPayload>('image-ops-dlq', { connection: redis });
      let sourceQueue: Queue<ImageJobQueuePayload> | null = null;
      try {
        const dlqJob = await dlq.getJob(jobId);
        if (!dlqJob) {
          res.status(404).json({ error: 'DLQ_JOB_NOT_FOUND', message: 'DLQ job does not exist.' });
          return;
        }

        const payload = dlqJob.data;
        if (!payload?.originalQueue || !payload?.jobData) {
          res.status(422).json({
            error: 'INVALID_DLQ_PAYLOAD',
            message: 'DLQ entry is missing original queue or job payload.',
          });
          return;
        }

        sourceQueue = new Queue<ImageJobQueuePayload>(payload.originalQueue, {
          connection: redis,
        });
        await sourceQueue.add(payload.originalJobName || payload.jobData.id, payload.jobData, {
          jobId: payload.jobData.id,
          removeOnComplete: { count: 100, age: 86400 },
          removeOnFail: false,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
        });
        await dlqJob.remove();

        res.status(202).json({
          status: 'requeued',
          queue: payload.originalQueue,
          jobId: payload.jobData.id,
        });
      } finally {
        if (sourceQueue) {
          await sourceQueue.close();
        }
        await dlq.close();
        await redis.quit();
      }
    })
  );
}
