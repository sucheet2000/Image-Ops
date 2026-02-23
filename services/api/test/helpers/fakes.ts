import type { ApiConfig } from "../../src/config";
import { InMemoryJobRepository } from "../../src/services/job-repo";
import { InMemoryJobQueueService } from "../../src/services/queue";
import { InMemoryObjectStorageService } from "../../src/services/storage";

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

export function createFakeServices() {
  return {
    storage: new InMemoryObjectStorageService(),
    queue: new InMemoryJobQueueService(),
    jobRepo: new InMemoryJobRepository()
  };
}
