import { z } from 'zod';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    REDIS_URL: z.string().default('redis://localhost:6379'),
    JOB_REPO_DRIVER: z.enum(['redis', 'postgres']).default('redis'),
    POSTGRES_URL: z.string().optional(),
    WORKER_FAST_CONCURRENCY: z.coerce.number().int().positive().default(8),
    WORKER_SLOW_CONCURRENCY: z.coerce.number().int().positive().default(3),
    WORKER_BULK_CONCURRENCY: z.coerce.number().int().positive().default(2),
    S3_REGION: z.string().default('us-east-1'),
    S3_BUCKET: z.string().min(1),
    S3_ENDPOINT: z.string().optional(),
    S3_ACCESS_KEY: z.string().min(1),
    S3_SECRET_KEY: z.string().min(1),
    S3_FORCE_PATH_STYLE: z
      .string()
      .default('true')
      .transform((value) => value.toLowerCase() === 'true'),
    BG_REMOVE_PROVIDER: z.enum(['http']).default('http'),
    BG_REMOVE_API_URL: z.string().min(1),
    BG_REMOVE_API_KEY: z.string().optional(),
    BG_REMOVE_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
    BG_REMOVE_MAX_RETRIES: z.coerce.number().int().nonnegative().default(2),
    BG_REMOVE_BACKOFF_BASE_MS: z.coerce.number().int().positive().default(250),
    BG_REMOVE_BACKOFF_MAX_MS: z.coerce.number().int().positive().default(1000),
    WORKER_HEARTBEAT_INTERVAL_MS: z.coerce.number().int().positive().default(30000),
  })
  .superRefine((value, ctx) => {
    if (value.JOB_REPO_DRIVER === 'postgres' && !value.POSTGRES_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['POSTGRES_URL'],
        message: 'POSTGRES_URL is required when JOB_REPO_DRIVER=postgres',
      });
    }

    if (value.NODE_ENV === 'production') {
      if (value.JOB_REPO_DRIVER !== 'postgres') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JOB_REPO_DRIVER'],
          message: 'JOB_REPO_DRIVER must be postgres in production',
        });
      }

      if (value.S3_ACCESS_KEY === 'minioadmin') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['S3_ACCESS_KEY'],
          message: 'S3_ACCESS_KEY must not use minioadmin in production',
        });
      }

      if (value.S3_SECRET_KEY === 'minioadmin') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['S3_SECRET_KEY'],
          message: 'S3_SECRET_KEY must not use minioadmin in production',
        });
      }
    }

    if (value.BG_REMOVE_BACKOFF_BASE_MS > value.BG_REMOVE_BACKOFF_MAX_MS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['BG_REMOVE_BACKOFF_BASE_MS'],
        message: 'BG_REMOVE_BACKOFF_BASE_MS must be less than or equal to BG_REMOVE_BACKOFF_MAX_MS',
      });
    }

    if (value.WORKER_FAST_CONCURRENCY < value.WORKER_SLOW_CONCURRENCY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['WORKER_FAST_CONCURRENCY'],
        message:
          'WORKER_FAST_CONCURRENCY >= WORKER_SLOW_CONCURRENCY >= WORKER_BULK_CONCURRENCY is required',
      });
    } else if (value.WORKER_SLOW_CONCURRENCY < value.WORKER_BULK_CONCURRENCY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['WORKER_SLOW_CONCURRENCY'],
        message:
          'WORKER_FAST_CONCURRENCY >= WORKER_SLOW_CONCURRENCY >= WORKER_BULK_CONCURRENCY is required',
      });
    }
  });

export type WorkerConfig = {
  redisUrl: string;
  jobRepoDriver: 'redis' | 'postgres';
  postgresUrl?: string;
  fastConcurrency: number;
  slowConcurrency: number;
  bulkConcurrency: number;
  s3Region: string;
  s3Bucket: string;
  s3Endpoint?: string;
  s3AccessKey: string;
  s3SecretKey: string;
  s3ForcePathStyle: boolean;
  bgRemoveProvider: 'http';
  bgRemoveApiUrl: string;
  bgRemoveApiKey?: string;
  bgRemoveTimeoutMs: number;
  bgRemoveMaxRetries: number;
  bgRemoveBackoffBaseMs: number;
  bgRemoveBackoffMaxMs: number;
  workerHeartbeatIntervalMs: number;
};

/**
 * Load and validate environment variables into a typed WorkerConfig.
 *
 * @param env - The environment object to read variables from (defaults to `process.env`)
 * @returns The validated WorkerConfig with normalized and typed fields
 * @throws Throws a validation error if required environment variables are missing or invalid
 */
export function loadWorkerConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const parsed = envSchema.parse(env);
  return {
    redisUrl: parsed.REDIS_URL,
    jobRepoDriver: parsed.JOB_REPO_DRIVER,
    postgresUrl: parsed.POSTGRES_URL,
    fastConcurrency: parsed.WORKER_FAST_CONCURRENCY,
    slowConcurrency: parsed.WORKER_SLOW_CONCURRENCY,
    bulkConcurrency: parsed.WORKER_BULK_CONCURRENCY,
    s3Region: parsed.S3_REGION,
    s3Bucket: parsed.S3_BUCKET,
    s3Endpoint: parsed.S3_ENDPOINT,
    s3AccessKey: parsed.S3_ACCESS_KEY,
    s3SecretKey: parsed.S3_SECRET_KEY,
    s3ForcePathStyle: parsed.S3_FORCE_PATH_STYLE,
    bgRemoveProvider: parsed.BG_REMOVE_PROVIDER,
    bgRemoveApiUrl: parsed.BG_REMOVE_API_URL,
    bgRemoveApiKey: parsed.BG_REMOVE_API_KEY,
    bgRemoveTimeoutMs: parsed.BG_REMOVE_TIMEOUT_MS,
    bgRemoveMaxRetries: parsed.BG_REMOVE_MAX_RETRIES,
    bgRemoveBackoffBaseMs: parsed.BG_REMOVE_BACKOFF_BASE_MS,
    bgRemoveBackoffMaxMs: parsed.BG_REMOVE_BACKOFF_MAX_MS,
    workerHeartbeatIntervalMs: parsed.WORKER_HEARTBEAT_INTERVAL_MS,
  };
}
