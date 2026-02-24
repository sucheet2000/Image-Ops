import type { ApiConfig } from "../../src/config";
import { InMemoryJobRepository } from "../../src/services/job-repo";
import { InMemoryJobQueueService } from "../../src/services/queue";
import { InMemoryObjectStorageService } from "../../src/services/storage";

/**
 * Create an ApiConfig populated with defaults suitable for local/in-memory tests.
 *
 * The returned config targets localhost services and test credentials: port 4000, webOrigin http://localhost:3000,
 * a 10 MB upload limit, short signed URL TTLs (300s), temporary object TTL (30m), an image-ops-jobs queue,
 * Redis at redis://localhost:6379, and S3 settings using bucket `image-ops-temp` and endpoint http://localhost:9000.
 *
 * @returns An ApiConfig object configured for local testing (port, webOrigin, upload limits, TTLs, queue, Redis, and S3 settings).
 */
export function createTestConfig(): ApiConfig {
  return {
    nodeEnv: "test",
    port: 4000,
    webOrigin: "http://localhost:3000",
    googleClientId: "test-google-client",
    authTokenSecret: "test-auth-token-secret",
    authTokenTtlSeconds: 3600,
    authRefreshTtlSeconds: 7 * 24 * 3600,
    authRefreshCookieName: "image_ops_refresh_token",
    authRefreshCookieSecure: false,
    authRefreshCookieSameSite: "lax",
    authRefreshCookieDomain: undefined,
    authRefreshCookiePath: "/api/auth",
    maxUploadBytes: 10 * 1024 * 1024,
    apiWriteRateLimitWindowMs: 60 * 1000,
    apiWriteRateLimitMax: 1000,
    signedUploadTtlSeconds: 300,
    signedDownloadTtlSeconds: 300,
    tempObjectTtlMinutes: 30,
    cleanupIdempotencyTtlSeconds: 3600,
    billingCheckoutTtlSeconds: 900,
    freePlanLimit: 6,
    freePlanWindowHours: 10,
    proPlanLimit: 250,
    proPlanWindowHours: 24,
    teamPlanLimit: 1000,
    teamPlanWindowHours: 24,
    queueName: "image-ops-jobs",
    jobRepoDriver: "redis",
    postgresUrl: undefined,
    redisUrl: "redis://localhost:6379",
    billingProvider: "hmac",
    billingPublicBaseUrl: "http://localhost:3000",
    billingPortalBaseUrl: "http://localhost:3000/billing/manage",
    billingProviderSecret: "test-provider-secret",
    billingWebhookSecret: "test-webhook-secret",
    stripeSecretKey: "sk_test_example",
    stripeWebhookSecret: "whsec_example",
    stripeWebhookToleranceSeconds: 300,
    stripePriceIdPro: "price_pro",
    stripePriceIdTeam: "price_team",
    malwareScanApiUrl: undefined,
    malwareScanTimeoutMs: 5000,
    malwareScanFailClosed: true,
    s3Region: "us-east-1",
    s3Bucket: "image-ops-temp",
    s3Endpoint: "http://localhost:9000",
    s3PublicEndpoint: "http://localhost:9000",
    s3AccessKey: "test",
    s3SecretKey: "test",
    s3ForcePathStyle: true
  };
}

/**
 * Create in-memory service instances used for tests.
 *
 * @returns An object containing `storage` (InMemoryObjectStorageService), `queue` (InMemoryJobQueueService), and `jobRepo` (InMemoryJobRepository)
 */
export function createFakeServices() {
  return {
    storage: new InMemoryObjectStorageService(),
    queue: new InMemoryJobQueueService(),
    jobRepo: new InMemoryJobRepository()
  };
}
