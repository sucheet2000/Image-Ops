import cors from 'cors';
import express from 'express';
import type { Express, NextFunction, Request, Response } from 'express';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { AppError, ValidationError } from '@imageops/core';
import IORedis from 'ioredis';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { RedisStore, type RedisReply } from 'rate-limit-redis';
import { loadApiConfig, type ApiConfig } from './config';
import { requireApiAuth, type RequestWithAuth } from './lib/auth-middleware';
import { logError, logInfo } from './lib/log';
import { createRateLimitMiddleware } from './lib/rate-limit';
import { registerAuthRoutes } from './routes/auth';
import { registerAdminRoutes } from './routes/admin';
import { registerBillingRoutes } from './routes/billing';
import { registerCleanupRoutes } from './routes/cleanup';
import { registerJobsRoutes } from './routes/jobs';
import { registerObservabilityRoutes } from './routes/observability';
import { registerQuotaRoutes } from './routes/quota';
import { registerUploadsRoutes } from './routes/uploads';
import { HmacBillingService, StripeBillingService, type BillingService } from './services/billing';
import { GoogleTokenAuthService, type AuthService } from './services/auth';
import { createJobRepository, type JobRepository } from './services/job-repo';
import {
  HttpMalwareScanService,
  NoopMalwareScanService,
  type MalwareScanService,
} from './services/malware-scan';
import { BullMqJobQueueService, type JobQueueService } from './services/queue';
import { S3ObjectStorageService, TMP_PREFIX, type ObjectStorageService } from './services/storage';

export type ApiDependencies = {
  config: ApiConfig;
  storage: ObjectStorageService;
  queue: JobQueueService;
  jobRepo: JobRepository;
  billing: BillingService;
  auth: AuthService;
  malwareScan: MalwareScanService;
  now: () => Date;
};

export type ApiRuntime = {
  app: Express;
  deps: ApiDependencies;
};

const INTERNAL_ERROR_MESSAGE = 'An unexpected error occurred.';
const METRICS_CONTENT_TYPE = 'text/plain; version=0.0.4; charset=utf-8';
const REQUEST_ID_MAX_LENGTH = 128;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;

type ReadyCheck = {
  status: 'ok' | 'error';
  message?: string;
};

function formatReadinessCheck(result: PromiseSettledResult<unknown>): ReadyCheck {
  if (result.status === 'fulfilled') {
    return { status: 'ok' };
  }

  const reason = result.reason;
  if (reason instanceof Error) {
    return { status: 'error', message: reason.message };
  }

  return { status: 'error', message: String(reason) };
}

function escapeMetricLabelValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function formatErrorForLog(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return { value: error };
}

type CleanupCallback = () => void | Promise<void>;

async function ensureLiveWorkerHeartbeat(redis: Pick<IORedis, 'scan'>): Promise<void> {
  let cursor = '0';
  do {
    const [nextCursor, keys] = await redis.scan(
      cursor,
      'MATCH',
      'worker:heartbeat:*',
      'COUNT',
      '100'
    );
    if (keys.length > 0) {
      return;
    }
    cursor = nextCursor;
  } while (cursor !== '0');

  throw new Error('no live workers detected');
}

async function runAppCleanup(app: Express): Promise<void> {
  const cleanupCallbacks = app.locals.__runtimeCleanup as CleanupCallback[] | undefined;
  if (!cleanupCallbacks) {
    return;
  }

  for (const cleanup of cleanupCallbacks) {
    try {
      await cleanup();
    } catch (error) {
      logError('api.cleanup.failed', { error: formatErrorForLog(error) });
    }
  }
}

function createBillingService(config: ApiConfig): BillingService {
  if (config.billingProvider === 'stripe') {
    if (!config.stripeSecretKey || !config.stripeSecretKey.trim()) {
      throw new Error('STRIPE_SECRET_KEY is required when BILLING_PROVIDER=stripe');
    }
    if (!config.stripeWebhookSecret || !config.stripeWebhookSecret.trim()) {
      throw new Error('STRIPE_WEBHOOK_SECRET is required when BILLING_PROVIDER=stripe');
    }
    if (!config.stripePriceIdPro || !config.stripePriceIdPro.trim()) {
      throw new Error('STRIPE_PRICE_ID_PRO is required when BILLING_PROVIDER=stripe');
    }
    if (!config.stripePriceIdTeam || !config.stripePriceIdTeam.trim()) {
      throw new Error('STRIPE_PRICE_ID_TEAM is required when BILLING_PROVIDER=stripe');
    }

    return new StripeBillingService({
      secretKey: config.stripeSecretKey,
      webhookSecret: config.stripeWebhookSecret,
      webhookToleranceSeconds: config.stripeWebhookToleranceSeconds,
      priceIdByPlan: {
        pro: config.stripePriceIdPro,
        team: config.stripePriceIdTeam,
      },
    });
  }

  return new HmacBillingService({
    publicBaseUrl: config.billingPublicBaseUrl,
    providerSecret: config.billingProviderSecret,
    webhookSecret: config.billingWebhookSecret,
  });
}

function createMalwareScanService(config: ApiConfig): MalwareScanService {
  if (!config.malwareScanApiUrl) {
    return new NoopMalwareScanService();
  }

  return new HttpMalwareScanService({
    endpointUrl: config.malwareScanApiUrl,
    timeoutMs: config.malwareScanTimeoutMs,
  });
}

function validateEnv(): void {
  const secret = process.env.AUTH_TOKEN_SECRET;
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
    // eslint-disable-next-line no-console
    console.error(
      'FATAL: AUTH_TOKEN_SECRET must be at least 32 bytes. Generate one with: openssl rand -base64 32'
    );
    process.exit(1);
  }

  if (process.env.NODE_ENV === 'production') {
    if (process.env.AUTH_REFRESH_COOKIE_SECURE !== 'true') {
      // eslint-disable-next-line no-console
      console.error('FATAL: AUTH_REFRESH_COOKIE_SECURE must be "true" in production');
      process.exit(1);
    }
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      // eslint-disable-next-line no-console
      console.error('FATAL: STRIPE_WEBHOOK_SECRET is required in production');
      process.exit(1);
    }
    if (!process.env.METRICS_TOKEN) {
      // eslint-disable-next-line no-console
      console.error('FATAL: METRICS_TOKEN is required in production');
      process.exit(1);
    }
  }

  const billingProvider = process.env.BILLING_PROVIDER || 'hmac';
  if (billingProvider === 'stripe') {
    if (!process.env.STRIPE_SECRET_KEY) {
      // eslint-disable-next-line no-console
      console.error('FATAL: STRIPE_SECRET_KEY is required when BILLING_PROVIDER=stripe');
      process.exit(1);
    }
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      // eslint-disable-next-line no-console
      console.error('FATAL: STRIPE_WEBHOOK_SECRET is required when BILLING_PROVIDER=stripe');
      process.exit(1);
    }
  }
}

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof AppError) {
    res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
      },
    });
    return;
  }

  logError('api.error', { error: formatErrorForLog(error) });
  res.status(500).json({
    error: {
      code: 'INTERNAL',
      message: INTERNAL_ERROR_MESSAGE,
    },
  });
}

export function createApiRuntime(incomingDeps?: Partial<ApiDependencies>): ApiRuntime {
  const config = incomingDeps?.config || loadApiConfig();
  if (config.nodeEnv !== 'test') {
    validateEnv();
  }

  const deps: ApiDependencies = {
    config,
    storage: incomingDeps?.storage || new S3ObjectStorageService(config),
    queue: incomingDeps?.queue || new BullMqJobQueueService({ redisUrl: config.redisUrl }),
    jobRepo: incomingDeps?.jobRepo || createJobRepository(config),
    billing: incomingDeps?.billing || createBillingService(config),
    auth:
      incomingDeps?.auth ||
      new GoogleTokenAuthService({
        googleClientId: config.googleClientId,
        authTokenSecret: config.authTokenSecret,
        authTokenTtlSeconds: config.authTokenTtlSeconds,
      }),
    malwareScan: incomingDeps?.malwareScan || createMalwareScanService(config),
    now: incomingDeps?.now || (() => new Date()),
  };

  if (deps.config.webOrigin === '*' && process.env.NODE_ENV !== 'development') {
    throw new ValidationError("WEB_ORIGIN cannot be '*' outside development.");
  }

  const app = express();
  app.locals.__runtimeCleanup = [];
  const rateLimitRedis =
    deps.config.nodeEnv === 'test'
      ? null
      : new IORedis(deps.config.redisUrl, { maxRetriesPerRequest: null });
  const readinessRedis =
    deps.config.nodeEnv === 'test'
      ? null
      : new IORedis(deps.config.redisUrl, { maxRetriesPerRequest: null });
  if (rateLimitRedis) {
    (app.locals.__runtimeCleanup as CleanupCallback[]).push(async () => {
      await rateLimitRedis.quit();
    });
  }
  if (readinessRedis) {
    (app.locals.__runtimeCleanup as CleanupCallback[]).push(async () => {
      await readinessRedis.quit();
    });
  }
  const requestMetrics = new Map<string, { count: number; durationSecondsTotal: number }>();
  const metricsStartMs = Date.now();
  let inflightRequests = 0;

  const observeRequest = (
    method: string,
    path: string,
    statusCode: number,
    durationSeconds: number
  ): void => {
    const key = `${method}|${path}|${statusCode}`;
    const existing = requestMetrics.get(key) || { count: 0, durationSecondsTotal: 0 };
    existing.count += 1;
    existing.durationSecondsTotal += durationSeconds;
    requestMetrics.set(key, existing);
  };

  const renderMetrics = (queueMetrics: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }): string => {
    const lines: string[] = [];
    lines.push('# HELP image_ops_up Service liveness state.');
    lines.push('# TYPE image_ops_up gauge');
    lines.push('image_ops_up 1');
    lines.push('# HELP image_ops_uptime_seconds Service uptime in seconds.');
    lines.push('# TYPE image_ops_uptime_seconds gauge');
    lines.push(`image_ops_uptime_seconds ${((Date.now() - metricsStartMs) / 1000).toFixed(3)}`);
    lines.push('# HELP image_ops_http_in_flight_requests Current in-flight HTTP requests.');
    lines.push('# TYPE image_ops_http_in_flight_requests gauge');
    lines.push(`image_ops_http_in_flight_requests ${inflightRequests}`);
    lines.push('# HELP image_ops_http_requests_total Total HTTP requests handled.');
    lines.push('# TYPE image_ops_http_requests_total counter');
    lines.push(
      '# HELP image_ops_http_request_duration_seconds_total Total request duration in seconds.'
    );
    lines.push('# TYPE image_ops_http_request_duration_seconds_total counter');
    lines.push('# HELP image_ops_queue_jobs Number of jobs in each queue state.');
    lines.push('# TYPE image_ops_queue_jobs gauge');
    lines.push(`image_ops_queue_jobs{state="waiting"} ${queueMetrics.waiting}`);
    lines.push(`image_ops_queue_jobs{state="active"} ${queueMetrics.active}`);
    lines.push(`image_ops_queue_jobs{state="completed"} ${queueMetrics.completed}`);
    lines.push(`image_ops_queue_jobs{state="failed"} ${queueMetrics.failed}`);
    lines.push(`image_ops_queue_jobs{state="delayed"} ${queueMetrics.delayed}`);

    const sorted = [...requestMetrics.entries()].sort((left, right) =>
      left[0].localeCompare(right[0])
    );
    for (const [key, value] of sorted) {
      const [method, path, statusCode] = key.split('|');
      const labels = `method="${escapeMetricLabelValue(method)}",path="${escapeMetricLabelValue(path)}",status_code="${escapeMetricLabelValue(statusCode)}"`;
      lines.push(`image_ops_http_requests_total{${labels}} ${value.count}`);
      lines.push(
        `image_ops_http_request_duration_seconds_total{${labels}} ${value.durationSecondsTotal.toFixed(6)}`
      );
    }

    return `${lines.join('\n')}\n`;
  };

  app.use((req, res, next) => {
    const incomingRequestId = req.header('x-request-id')?.trim();
    const requestId =
      incomingRequestId &&
      incomingRequestId.length <= REQUEST_ID_MAX_LENGTH &&
      REQUEST_ID_PATTERN.test(incomingRequestId)
        ? incomingRequestId
        : randomUUID();
    res.setHeader('X-Request-ID', requestId);
    next();
  });

  app.use(
    cors({
      origin: deps.config.webOrigin,
      credentials: true,
      exposedHeaders: ['X-Request-ID'],
    })
  );
  app.use('/api/webhooks/billing', express.raw({ type: 'application/json', limit: '1mb' }));
  app.use(express.json({ limit: '1mb' }));

  const createRedisRateLimitStore = (prefix: string): RedisStore | undefined => {
    if (!rateLimitRedis) {
      return undefined;
    }

    return new RedisStore({
      prefix,
      sendCommand: (...command: string[]) =>
        rateLimitRedis.call(command[0], ...command.slice(1)) as Promise<RedisReply>,
    });
  };
  const authRateLimitStore = createRedisRateLimitStore('rl:auth:');
  const uploadRateLimitStore = createRedisRateLimitStore('rl:upload:');

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    ...(authRateLimitStore ? { store: authRateLimitStore } : {}),
    handler: (_req, res) => {
      res.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many attempts. Please wait 15 minutes.',
        },
      });
    },
    standardHeaders: true,
    legacyHeaders: false,
  });

  const uploadLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: 30,
    keyGenerator: (req) => {
      const subjectId = (req as RequestWithAuth).auth?.sub;
      return subjectId || ipKeyGenerator(req.ip || 'unknown');
    },
    ...(uploadRateLimitStore ? { store: uploadRateLimitStore } : {}),
    handler: (_req, res) => {
      res.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: 'Upload rate limit exceeded. Please wait.',
        },
      });
    },
    standardHeaders: true,
    legacyHeaders: false,
  });

  const writeRateLimit = createRateLimitMiddleware({
    limit: deps.config.apiWriteRateLimitMax,
    windowMs: deps.config.apiWriteRateLimitWindowMs,
    keyPrefix: 'api-write',
  });
  (app.locals.__runtimeCleanup as CleanupCallback[]).push(() => writeRateLimit.close());
  app.use('/api/uploads/init', writeRateLimit);
  app.use('/api/uploads/complete', writeRateLimit);
  app.use('/api/jobs', writeRateLimit);
  app.use('/api/cleanup', writeRateLimit);
  app.use('/api/billing/checkout', writeRateLimit);
  app.use('/api/billing/subscription', writeRateLimit);
  app.use('/api/auth/google', authLimiter);
  app.use('/api/auth/refresh', authLimiter);

  app.use((req, res, next) => {
    const startedAtNs = process.hrtime.bigint();
    inflightRequests += 1;

    res.on('finish', () => {
      inflightRequests = Math.max(0, inflightRequests - 1);
      if (req.path === '/metrics') {
        return;
      }

      const routePath =
        typeof (req.route as { path?: string } | undefined)?.path === 'string'
          ? String((req.route as { path?: string }).path)
          : 'unmatched';
      const durationSeconds = Number(process.hrtime.bigint() - startedAtNs) / 1_000_000_000;
      observeRequest(req.method, routePath, res.statusCode, durationSeconds);
    });

    next();
  });

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/ready', async (_req, res) => {
    const [storageResult, jobRepoResult, workerHeartbeatResult] = await Promise.allSettled([
      deps.storage.headObject(`${TMP_PREFIX}__ready_probe__`),
      deps.jobRepo.getQuotaWindow('__ready_probe_subject__'),
      readinessRedis ? ensureLiveWorkerHeartbeat(readinessRedis) : Promise.resolve(),
    ]);

    const checks = {
      storage: formatReadinessCheck(storageResult),
      jobRepo: formatReadinessCheck(jobRepoResult),
      workers: formatReadinessCheck(workerHeartbeatResult),
    };
    const isReady =
      checks.storage.status === 'ok' &&
      checks.jobRepo.status === 'ok' &&
      checks.workers.status === 'ok';

    res.status(isReady ? 200 : 503).json({
      status: isReady ? 'ready' : 'degraded',
      checks,
      timestamp: deps.now().toISOString(),
    });
  });

  app.get('/metrics', async (req, res) => {
    const metricsToken = process.env.METRICS_TOKEN;
    const authorization = req.header('authorization');
    const providedToken = authorization?.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length).trim()
      : undefined;

    const providedTokenBuffer = providedToken ? Buffer.from(providedToken, 'utf8') : null;
    const metricsTokenBuffer = metricsToken ? Buffer.from(metricsToken, 'utf8') : null;
    const isAuthorized = Boolean(
      providedTokenBuffer &&
      metricsTokenBuffer &&
      providedTokenBuffer.length === metricsTokenBuffer.length &&
      timingSafeEqual(providedTokenBuffer, metricsTokenBuffer)
    );
    if (!isAuthorized) {
      res.set('WWW-Authenticate', 'Bearer realm="metrics", error="invalid_token"');
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid metrics token',
        },
      });
      return;
    }

    let queueMetrics = {
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
    };
    try {
      queueMetrics = await deps.queue.getMetrics();
    } catch (error) {
      logError('metrics.queue.read_failed', { error: formatErrorForLog(error) });
    }

    res.setHeader('Content-Type', METRICS_CONTENT_TYPE);
    res.send(renderMetrics(queueMetrics));
  });

  app.use('/api/uploads', requireApiAuth(deps.auth));
  app.use('/api/jobs', requireApiAuth(deps.auth));
  app.use('/api/cleanup', requireApiAuth(deps.auth));
  app.use('/api/quota', requireApiAuth(deps.auth));
  app.use('/api/observability', requireApiAuth(deps.auth));
  app.use('/api/billing/checkout', requireApiAuth(deps.auth));
  app.use('/api/billing/reconcile', requireApiAuth(deps.auth));
  app.use('/api/billing/summary', requireApiAuth(deps.auth));
  app.use('/api/billing/subscription', requireApiAuth(deps.auth));

  app.use('/api/uploads/init', uploadLimiter);
  app.use('/api/jobs', (req, res, next) => {
    if (req.method === 'POST') {
      uploadLimiter(req, res, next);
      return;
    }
    next();
  });

  registerUploadsRoutes(app, {
    config: deps.config,
    storage: deps.storage,
    jobRepo: deps.jobRepo,
    malwareScan: deps.malwareScan,
    now: deps.now,
  });
  registerAuthRoutes(app, {
    config: deps.config,
    jobRepo: deps.jobRepo,
    auth: deps.auth,
    now: deps.now,
  });
  registerBillingRoutes(app, {
    config: deps.config,
    jobRepo: deps.jobRepo,
    billing: deps.billing,
    now: deps.now,
  });
  registerJobsRoutes(app, {
    config: deps.config,
    storage: deps.storage,
    queue: deps.queue,
    jobRepo: deps.jobRepo,
    now: deps.now,
  });
  registerCleanupRoutes(app, {
    config: deps.config,
    storage: deps.storage,
    jobRepo: deps.jobRepo,
    now: deps.now,
  });
  registerObservabilityRoutes(app);
  registerQuotaRoutes(app, { config: deps.config, jobRepo: deps.jobRepo, now: deps.now });
  registerAdminRoutes(app, { config: deps.config });

  app.use(errorHandler);
  return { app, deps };
}

export function createApiApp(incomingDeps?: Partial<ApiDependencies>): Express {
  return createApiRuntime(incomingDeps).app;
}

if (require.main === module) {
  const config = loadApiConfig();
  const runtime = createApiRuntime({ config });
  const server = runtime.app.listen(config.port, () => {
    logInfo('api.started', { port: config.port });
  });

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logInfo('api.stopping', { signal });

    let exitCode = 0;
    try {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    } catch (error) {
      exitCode = 1;
      logError('api.shutdown.server_close_failed', { error: formatErrorForLog(error) });
    }

    const dependencyResults = await Promise.allSettled([
      runtime.deps.queue.close(),
      runtime.deps.jobRepo.close(),
      runtime.deps.storage.close(),
      runtime.deps.malwareScan.close(),
      Promise.resolve().then(() => runAppCleanup(runtime.app)),
    ]);
    for (const result of dependencyResults) {
      if (result.status === 'rejected') {
        exitCode = 1;
        logError('api.shutdown.dependency_close_failed', {
          error: formatErrorForLog(result.reason),
        });
      }
    }

    process.exit(exitCode);
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
}
