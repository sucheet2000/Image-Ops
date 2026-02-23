import { describe, expect, it, vi } from "vitest";
import { createApiApp, createApiRuntime } from "../src/server";
import type { JobRepository } from "../src/services/job-repo";
import type { JobQueueService } from "../src/services/queue";
import type { ObjectStorageService } from "../src/services/storage";
import { createTestConfig } from "./helpers/fakes";

describe("API runtime wiring", () => {
  it("returns resolved dependencies for lifecycle management", async () => {
    const queueClose = vi.fn().mockResolvedValue(undefined);
    const repoClose = vi.fn().mockResolvedValue(undefined);
    const storageClose = vi.fn().mockResolvedValue(undefined);

    const queue: JobQueueService = {
      enqueue: vi.fn().mockResolvedValue(undefined),
      close: queueClose
    };
    const jobRepo: JobRepository = {
      getQuotaWindow: vi.fn().mockResolvedValue(null),
      setQuotaWindow: vi.fn().mockResolvedValue(undefined),
      getSubjectProfile: vi.fn().mockResolvedValue(null),
      upsertSubjectProfile: vi.fn().mockResolvedValue(undefined),
      createJob: vi.fn().mockResolvedValue(undefined),
      getJob: vi.fn().mockResolvedValue(null),
      updateJobStatus: vi.fn().mockResolvedValue(undefined),
      createBillingCheckoutSession: vi.fn().mockResolvedValue(undefined),
      getBillingCheckoutSession: vi.fn().mockResolvedValue(null),
      updateBillingCheckoutStatus: vi.fn().mockResolvedValue(undefined),
      getBillingWebhookEvent: vi.fn().mockResolvedValue(null),
      appendBillingWebhookEvent: vi.fn().mockResolvedValue(undefined),
      listBillingWebhookEvents: vi.fn().mockResolvedValue([]),
      getCleanupIdempotency: vi.fn().mockResolvedValue(null),
      setCleanupIdempotency: vi.fn().mockResolvedValue(undefined),
      appendDeletionAudit: vi.fn().mockResolvedValue(undefined),
      listDeletionAudit: vi.fn().mockResolvedValue([]),
      close: repoClose
    };
    const storage: ObjectStorageService = {
      createPresignedUploadUrl: vi.fn().mockResolvedValue("https://upload.example"),
      createPresignedDownloadUrl: vi.fn().mockResolvedValue("https://download.example"),
      headObject: vi.fn().mockResolvedValue({ exists: false }),
      deleteObjects: vi.fn().mockResolvedValue({ deleted: [], notFound: [] }),
      close: storageClose
    };
    const now = () => new Date("2026-02-23T00:00:00.000Z");

    const runtime = createApiRuntime({ config: createTestConfig(), queue, jobRepo, storage, now });

    expect(runtime.deps.queue).toBe(queue);
    expect(runtime.deps.jobRepo).toBe(jobRepo);
    expect(runtime.deps.storage).toBe(storage);
    expect(runtime.deps.now).toBe(now);

    await runtime.deps.queue.close();
    await runtime.deps.jobRepo.close();
    await runtime.deps.storage.close();

    expect(queueClose).toHaveBeenCalledTimes(1);
    expect(repoClose).toHaveBeenCalledTimes(1);
    expect(storageClose).toHaveBeenCalledTimes(1);
  });

  it("keeps createApiApp compatibility by returning only the express app", () => {
    const app = createApiApp({
      config: createTestConfig(),
      queue: {
        enqueue: async () => undefined,
        close: async () => undefined
      },
      jobRepo: {
        getQuotaWindow: async () => null,
        setQuotaWindow: async () => undefined,
        getSubjectProfile: async () => null,
        upsertSubjectProfile: async () => undefined,
        createJob: async () => undefined,
        getJob: async () => null,
        updateJobStatus: async () => undefined,
        createBillingCheckoutSession: async () => undefined,
        getBillingCheckoutSession: async () => null,
        updateBillingCheckoutStatus: async () => undefined,
        getBillingWebhookEvent: async () => null,
        appendBillingWebhookEvent: async () => undefined,
        listBillingWebhookEvents: async () => [],
        getCleanupIdempotency: async () => null,
        setCleanupIdempotency: async () => undefined,
        appendDeletionAudit: async () => undefined,
        listDeletionAudit: async () => [],
        close: async () => undefined
      },
      storage: {
        createPresignedUploadUrl: async () => "https://upload.example",
        createPresignedDownloadUrl: async () => "https://download.example",
        headObject: async () => ({ exists: false }),
        deleteObjects: async () => ({ deleted: [], notFound: [] }),
        close: async () => undefined
      }
    });

    expect(typeof app.listen).toBe("function");
  });
});
