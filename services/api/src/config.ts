import { z } from "zod";

export const JOB_REPO_DRIVERS = ["redis", "postgres"] as const;
export type JobRepoDriver = (typeof JOB_REPO_DRIVERS)[number];

export const BILLING_PROVIDERS = ["hmac", "stripe"] as const;
export type BillingProvider = (typeof BILLING_PROVIDERS)[number];

function emptyStringToUndefined(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z
    .string()
    .url("WEB_ORIGIN must be a valid URL")
    .refine((value) => value !== "*", "WEB_ORIGIN cannot be '*'")
    .default("http://localhost:3000"),
  API_AUTH_REQUIRED: z
    .string()
    .default("false")
    .transform((value) => value === "1" || value.toLowerCase() === "true"),
  GOOGLE_CLIENT_ID: z.string().default("google-client-id"),
  AUTH_TOKEN_SECRET: z.string().min(1).default("dev-auth-token-secret"),
  AUTH_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60),
  AUTH_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(14 * 24 * 60 * 60),
  AUTH_REFRESH_COOKIE_NAME: z.string().min(1).default("image_ops_refresh_token"),
  AUTH_REFRESH_COOKIE_SECURE: z
    .string()
    .default("false")
    .transform((value) => value.toLowerCase() === "true"),
  AUTH_REFRESH_COOKIE_SAMESITE: z.enum(["lax", "strict", "none"]).default("lax"),
  AUTH_REFRESH_COOKIE_DOMAIN: z.string().optional(),
  AUTH_REFRESH_COOKIE_PATH: z.string().min(1).default("/api/auth"),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),
  API_WRITE_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60 * 1000),
  API_WRITE_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
  SIGNED_UPLOAD_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  SIGNED_DOWNLOAD_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  TEMP_OBJECT_TTL_MINUTES: z.coerce.number().int().positive().default(30),
  CLEANUP_IDEMPOTENCY_TTL_SECONDS: z.coerce.number().int().positive().default(24 * 60 * 60),
  BILLING_CHECKOUT_TTL_SECONDS: z.coerce.number().int().positive().default(15 * 60),
  FREE_PLAN_LIMIT: z.coerce.number().int().positive().default(6),
  FREE_PLAN_WINDOW_HOURS: z.coerce.number().int().positive().default(10),
  PRO_PLAN_LIMIT: z.coerce.number().int().positive().default(250),
  PRO_PLAN_WINDOW_HOURS: z.coerce.number().int().positive().default(24),
  TEAM_PLAN_LIMIT: z.coerce.number().int().positive().default(1000),
  TEAM_PLAN_WINDOW_HOURS: z.coerce.number().int().positive().default(24),
  JOB_QUEUE_NAME: z.string().default("image-ops-jobs"),
  JOB_REPO_DRIVER: z.enum(JOB_REPO_DRIVERS).default("redis"),
  POSTGRES_URL: z.string().optional(),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  BILLING_PROVIDER: z.enum(BILLING_PROVIDERS).default("hmac"),
  BILLING_PUBLIC_BASE_URL: z.string().url().default("http://localhost:3000"),
  BILLING_PORTAL_BASE_URL: z.preprocess(emptyStringToUndefined, z.string().url().optional()),
  BILLING_PROVIDER_SECRET: z.string().min(1, "BILLING_PROVIDER_SECRET is required").default("dev-provider-secret"),
  BILLING_WEBHOOK_SECRET: z.string().min(1, "BILLING_WEBHOOK_SECRET is required").default("dev-webhook-secret"),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_WEBHOOK_TOLERANCE_SECONDS: z.coerce.number().int().positive().default(300),
  STRIPE_PRICE_ID_PRO: z.string().default("price_pro"),
  STRIPE_PRICE_ID_TEAM: z.string().default("price_team"),
  MALWARE_SCAN_API_URL: z.string().url().optional(),
  MALWARE_SCAN_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  MALWARE_SCAN_FAIL_CLOSED: z
    .string()
    .default("true")
    .transform((value) => value.toLowerCase() === "true"),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().min(1, "S3_BUCKET is required"),
  S3_ENDPOINT: z.string().optional(),
  S3_PUBLIC_ENDPOINT: z.preprocess(emptyStringToUndefined, z.string().url().optional()),
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

  if (value.AUTH_REFRESH_COOKIE_SAMESITE === "none" && !value.AUTH_REFRESH_COOKIE_SECURE) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["AUTH_REFRESH_COOKIE_SECURE"],
      message: "AUTH_REFRESH_COOKIE_SECURE must be true when AUTH_REFRESH_COOKIE_SAMESITE=none"
    });
  }

  if (value.API_AUTH_REQUIRED) {
    if (value.AUTH_TOKEN_SECRET === "dev-auth-token-secret") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["AUTH_TOKEN_SECRET"],
        message: "AUTH_TOKEN_SECRET must not use the development default when API_AUTH_REQUIRED=true"
      });
    }

    if (value.GOOGLE_CLIENT_ID === "google-client-id") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["GOOGLE_CLIENT_ID"],
        message: "GOOGLE_CLIENT_ID must not use the development default when API_AUTH_REQUIRED=true"
      });
    }
  }

  if (value.NODE_ENV === "production") {
    if (value.JOB_REPO_DRIVER !== "postgres") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["JOB_REPO_DRIVER"],
        message: "JOB_REPO_DRIVER must be postgres in production"
      });
    }

    if (value.AUTH_TOKEN_SECRET === "dev-auth-token-secret") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["AUTH_TOKEN_SECRET"],
        message: "AUTH_TOKEN_SECRET must not use the development default in production"
      });
    }

    if (value.BILLING_PROVIDER_SECRET === "dev-provider-secret") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["BILLING_PROVIDER_SECRET"],
        message: "BILLING_PROVIDER_SECRET must not use the development default in production"
      });
    }

    if (value.BILLING_WEBHOOK_SECRET === "dev-webhook-secret") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["BILLING_WEBHOOK_SECRET"],
        message: "BILLING_WEBHOOK_SECRET must not use the development default in production"
      });
    }

    if (value.S3_ACCESS_KEY === "minioadmin") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["S3_ACCESS_KEY"],
        message: "S3_ACCESS_KEY/S3_SECRET_KEY must not use minioadmin defaults in production"
      });
    }

    if (value.S3_SECRET_KEY === "minioadmin") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["S3_SECRET_KEY"],
        message: "S3_ACCESS_KEY/S3_SECRET_KEY must not use minioadmin defaults in production"
      });
    }
  }
});

export type ApiConfig = {
  nodeEnv: "development" | "test" | "production";
  port: number;
  webOrigin: string;
  apiAuthRequired: boolean;
  googleClientId: string;
  authTokenSecret: string;
  authTokenTtlSeconds: number;
  authRefreshTtlSeconds: number;
  authRefreshCookieName: string;
  authRefreshCookieSecure: boolean;
  authRefreshCookieSameSite: "lax" | "strict" | "none";
  authRefreshCookieDomain?: string;
  authRefreshCookiePath: string;
  maxUploadBytes: number;
  apiWriteRateLimitWindowMs: number;
  apiWriteRateLimitMax: number;
  signedUploadTtlSeconds: number;
  signedDownloadTtlSeconds: number;
  tempObjectTtlMinutes: number;
  cleanupIdempotencyTtlSeconds: number;
  billingCheckoutTtlSeconds: number;
  freePlanLimit: number;
  freePlanWindowHours: number;
  proPlanLimit: number;
  proPlanWindowHours: number;
  teamPlanLimit: number;
  teamPlanWindowHours: number;
  queueName: string;
  jobRepoDriver: JobRepoDriver;
  postgresUrl?: string;
  redisUrl: string;
  billingProvider: BillingProvider;
  billingPublicBaseUrl: string;
  billingPortalBaseUrl?: string;
  billingProviderSecret: string;
  billingWebhookSecret: string;
  stripeSecretKey?: string;
  stripeWebhookSecret?: string;
  stripeWebhookToleranceSeconds: number;
  stripePriceIdPro: string;
  stripePriceIdTeam: string;
  malwareScanApiUrl?: string;
  malwareScanTimeoutMs: number;
  malwareScanFailClosed: boolean;
  s3Region: string;
  s3Bucket: string;
  s3Endpoint?: string;
  s3PublicEndpoint?: string;
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
    nodeEnv: parsed.NODE_ENV,
    port: parsed.API_PORT,
    webOrigin: parsed.WEB_ORIGIN,
    apiAuthRequired: parsed.API_AUTH_REQUIRED,
    googleClientId: parsed.GOOGLE_CLIENT_ID,
    authTokenSecret: parsed.AUTH_TOKEN_SECRET,
    authTokenTtlSeconds: parsed.AUTH_TOKEN_TTL_SECONDS,
    authRefreshTtlSeconds: parsed.AUTH_REFRESH_TTL_SECONDS,
    authRefreshCookieName: parsed.AUTH_REFRESH_COOKIE_NAME,
    authRefreshCookieSecure: parsed.AUTH_REFRESH_COOKIE_SECURE,
    authRefreshCookieSameSite: parsed.AUTH_REFRESH_COOKIE_SAMESITE,
    authRefreshCookieDomain: parsed.AUTH_REFRESH_COOKIE_DOMAIN,
    authRefreshCookiePath: parsed.AUTH_REFRESH_COOKIE_PATH,
    maxUploadBytes: parsed.MAX_UPLOAD_BYTES,
    apiWriteRateLimitWindowMs: parsed.API_WRITE_RATE_LIMIT_WINDOW_MS,
    apiWriteRateLimitMax: parsed.API_WRITE_RATE_LIMIT_MAX,
    signedUploadTtlSeconds: parsed.SIGNED_UPLOAD_TTL_SECONDS,
    signedDownloadTtlSeconds: parsed.SIGNED_DOWNLOAD_TTL_SECONDS,
    tempObjectTtlMinutes: parsed.TEMP_OBJECT_TTL_MINUTES,
    cleanupIdempotencyTtlSeconds: parsed.CLEANUP_IDEMPOTENCY_TTL_SECONDS,
    billingCheckoutTtlSeconds: parsed.BILLING_CHECKOUT_TTL_SECONDS,
    freePlanLimit: parsed.FREE_PLAN_LIMIT,
    freePlanWindowHours: parsed.FREE_PLAN_WINDOW_HOURS,
    proPlanLimit: parsed.PRO_PLAN_LIMIT,
    proPlanWindowHours: parsed.PRO_PLAN_WINDOW_HOURS,
    teamPlanLimit: parsed.TEAM_PLAN_LIMIT,
    teamPlanWindowHours: parsed.TEAM_PLAN_WINDOW_HOURS,
    queueName: parsed.JOB_QUEUE_NAME,
    jobRepoDriver: parsed.JOB_REPO_DRIVER,
    postgresUrl: parsed.POSTGRES_URL,
    redisUrl: parsed.REDIS_URL,
    billingProvider: parsed.BILLING_PROVIDER,
    billingPublicBaseUrl: parsed.BILLING_PUBLIC_BASE_URL,
    billingPortalBaseUrl: parsed.BILLING_PORTAL_BASE_URL,
    billingProviderSecret: parsed.BILLING_PROVIDER_SECRET,
    billingWebhookSecret: parsed.BILLING_WEBHOOK_SECRET,
    stripeSecretKey: parsed.STRIPE_SECRET_KEY,
    stripeWebhookSecret: parsed.STRIPE_WEBHOOK_SECRET,
    stripeWebhookToleranceSeconds: parsed.STRIPE_WEBHOOK_TOLERANCE_SECONDS,
    stripePriceIdPro: parsed.STRIPE_PRICE_ID_PRO,
    stripePriceIdTeam: parsed.STRIPE_PRICE_ID_TEAM,
    malwareScanApiUrl: parsed.MALWARE_SCAN_API_URL,
    malwareScanTimeoutMs: parsed.MALWARE_SCAN_TIMEOUT_MS,
    malwareScanFailClosed: parsed.MALWARE_SCAN_FAIL_CLOSED,
    s3Region: parsed.S3_REGION,
    s3Bucket: parsed.S3_BUCKET,
    s3Endpoint: parsed.S3_ENDPOINT,
    s3PublicEndpoint: parsed.S3_PUBLIC_ENDPOINT,
    s3AccessKey: parsed.S3_ACCESS_KEY,
    s3SecretKey: parsed.S3_SECRET_KEY,
    s3ForcePathStyle: parsed.S3_FORCE_PATH_STYLE
  };
}
