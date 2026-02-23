import { z } from "zod";

const envSchema = z.object({
  API_PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),
  SIGNED_UPLOAD_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  SIGNED_DOWNLOAD_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  TEMP_OBJECT_TTL_MINUTES: z.coerce.number().int().positive().default(30),
  CLEANUP_IDEMPOTENCY_TTL_SECONDS: z.coerce.number().int().positive().default(24 * 60 * 60),
  JOB_QUEUE_NAME: z.string().default("image-ops-jobs"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().min(1, "S3_BUCKET is required"),
  S3_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY: z.string().min(1, "S3_ACCESS_KEY is required"),
  S3_SECRET_KEY: z.string().min(1, "S3_SECRET_KEY is required"),
  S3_FORCE_PATH_STYLE: z
    .string()
    .default("true")
    .transform((value) => value.toLowerCase() === "true")
});

export type ApiConfig = {
  port: number;
  webOrigin: string;
  maxUploadBytes: number;
  signedUploadTtlSeconds: number;
  signedDownloadTtlSeconds: number;
  tempObjectTtlMinutes: number;
  cleanupIdempotencyTtlSeconds: number;
  queueName: string;
  redisUrl: string;
  s3Region: string;
  s3Bucket: string;
  s3Endpoint?: string;
  s3AccessKey: string;
  s3SecretKey: string;
  s3ForcePathStyle: boolean;
};

/**
 * Load and validate environment variables and return a normalized API configuration.
 *
 * @param env - Environment mapping to read values from; defaults to `process.env`.
 * @returns The validated and normalized `ApiConfig` object.
 * @throws ZodError If environment validation fails (missing or invalid variables).
 */
export function loadApiConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const parsed = envSchema.parse(env);
  return {
    port: parsed.API_PORT,
    webOrigin: parsed.WEB_ORIGIN,
    maxUploadBytes: parsed.MAX_UPLOAD_BYTES,
    signedUploadTtlSeconds: parsed.SIGNED_UPLOAD_TTL_SECONDS,
    signedDownloadTtlSeconds: parsed.SIGNED_DOWNLOAD_TTL_SECONDS,
    tempObjectTtlMinutes: parsed.TEMP_OBJECT_TTL_MINUTES,
    cleanupIdempotencyTtlSeconds: parsed.CLEANUP_IDEMPOTENCY_TTL_SECONDS,
    queueName: parsed.JOB_QUEUE_NAME,
    redisUrl: parsed.REDIS_URL,
    s3Region: parsed.S3_REGION,
    s3Bucket: parsed.S3_BUCKET,
    s3Endpoint: parsed.S3_ENDPOINT,
    s3AccessKey: parsed.S3_ACCESS_KEY,
    s3SecretKey: parsed.S3_SECRET_KEY,
    s3ForcePathStyle: parsed.S3_FORCE_PATH_STYLE
  };
}
