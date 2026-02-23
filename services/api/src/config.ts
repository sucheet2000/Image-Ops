import { z } from "zod";

export const JOB_REPO_DRIVERS = ["redis", "postgres"] as const;
export type JobRepoDriver = (typeof JOB_REPO_DRIVERS)[number];

export const BILLING_PROVIDERS = ["hmac", "stripe"] as const;
export type BillingProvider = (typeof BILLING_PROVIDERS)[number];

const envSchema = z.object({
  API_PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),
  SIGNED_UPLOAD_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  SIGNED_DOWNLOAD_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  TEMP_OBJECT_TTL_MINUTES: z.coerce.number().int().positive().default(30),
  CLEANUP_IDEMPOTENCY_TTL_SECONDS: z.coerce.number().int().positive().default(24 * 60 * 60),
  BILLING_CHECKOUT_TTL_SECONDS: z.coerce.number().int().positive().default(15 * 60),
  JOB_QUEUE_NAME: z.string().default("image-ops-jobs"),
  JOB_REPO_DRIVER: z.enum(JOB_REPO_DRIVERS).default("redis"),
  POSTGRES_URL: z.string().optional(),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  BILLING_PROVIDER: z.enum(BILLING_PROVIDERS).default("hmac"),
  BILLING_PUBLIC_BASE_URL: z.string().url().default("http://localhost:3000"),
  BILLING_PROVIDER_SECRET: z.string().min(1, "BILLING_PROVIDER_SECRET is required").default("dev-provider-secret"),
  BILLING_WEBHOOK_SECRET: z.string().min(1, "BILLING_WEBHOOK_SECRET is required").default("dev-webhook-secret"),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_ID_PRO: z.string().default("price_pro"),
  STRIPE_PRICE_ID_TEAM: z.string().default("price_team"),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().min(1, "S3_BUCKET is required"),
  S3_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY: z.string().min(1, "S3_ACCESS_KEY is required"),
  S3_SECRET_KEY: z.string().min(1, "S3_SECRET_KEY is required"),
  S3_FORCE_PATH_STYLE: z
    .string()
    .default("true")
    .transform((value) => value.toLowerCase() === "true")
}).superRefine((value, ctx) => {
  if (value.JOB_REPO_DRIVER === "postgres" && !value.POSTGRES_URL) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["POSTGRES_URL"],
      message: "POSTGRES_URL is required when JOB_REPO_DRIVER=postgres"
    });
  }

  if (value.BILLING_PROVIDER === "stripe") {
    if (!value.STRIPE_SECRET_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["STRIPE_SECRET_KEY"],
        message: "STRIPE_SECRET_KEY is required when BILLING_PROVIDER=stripe"
      });
    }
    if (!value.STRIPE_WEBHOOK_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["STRIPE_WEBHOOK_SECRET"],
        message: "STRIPE_WEBHOOK_SECRET is required when BILLING_PROVIDER=stripe"
      });
    }
  }
});

export type ApiConfig = {
  port: number;
  webOrigin: string;
  maxUploadBytes: number;
  signedUploadTtlSeconds: number;
  signedDownloadTtlSeconds: number;
  tempObjectTtlMinutes: number;
  cleanupIdempotencyTtlSeconds: number;
  billingCheckoutTtlSeconds: number;
  queueName: string;
  jobRepoDriver: JobRepoDriver;
  postgresUrl?: string;
  redisUrl: string;
  billingProvider: BillingProvider;
  billingPublicBaseUrl: string;
  billingProviderSecret: string;
  billingWebhookSecret: string;
  stripeSecretKey?: string;
  stripeWebhookSecret?: string;
  stripePriceIdPro: string;
  stripePriceIdTeam: string;
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
    billingCheckoutTtlSeconds: parsed.BILLING_CHECKOUT_TTL_SECONDS,
    queueName: parsed.JOB_QUEUE_NAME,
    jobRepoDriver: parsed.JOB_REPO_DRIVER,
    postgresUrl: parsed.POSTGRES_URL,
    redisUrl: parsed.REDIS_URL,
    billingProvider: parsed.BILLING_PROVIDER,
    billingPublicBaseUrl: parsed.BILLING_PUBLIC_BASE_URL,
    billingProviderSecret: parsed.BILLING_PROVIDER_SECRET,
    billingWebhookSecret: parsed.BILLING_WEBHOOK_SECRET,
    stripeSecretKey: parsed.STRIPE_SECRET_KEY,
    stripeWebhookSecret: parsed.STRIPE_WEBHOOK_SECRET,
    stripePriceIdPro: parsed.STRIPE_PRICE_ID_PRO,
    stripePriceIdTeam: parsed.STRIPE_PRICE_ID_TEAM,
    s3Region: parsed.S3_REGION,
    s3Bucket: parsed.S3_BUCKET,
    s3Endpoint: parsed.S3_ENDPOINT,
    s3AccessKey: parsed.S3_ACCESS_KEY,
    s3SecretKey: parsed.S3_SECRET_KEY,
    s3ForcePathStyle: parsed.S3_FORCE_PATH_STYLE
  };
}
