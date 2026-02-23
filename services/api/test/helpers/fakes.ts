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
    port: 4000,
    webOrigin: "http://localhost:3000",
    maxUploadBytes: 10 * 1024 * 1024,
    signedUploadTtlSeconds: 300,
    signedDownloadTtlSeconds: 300,
    tempObjectTtlMinutes: 30,
    cleanupIdempotencyTtlSeconds: 3600,
    queueName: "image-ops-jobs",
    redisUrl: "redis://localhost:6379",
    s3Region: "us-east-1",
    s3Bucket: "image-ops-temp",
    s3Endpoint: "http://localhost:9000",
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
