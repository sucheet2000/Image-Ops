import type { ImageJobRecord } from "@imageops/core";
import type IORedis from "ioredis";
import { describe, expect, it } from "vitest";
import { RedisJobRepository } from "../src/services/job-repo";

class FakeRedisMulti {
  private readonly operations: Array<{ key: string; value: string }> = [];

  constructor(private readonly redis: FakeRedisClient) {}

  set(key: string, value: string): FakeRedisMulti {
    this.operations.push({ key, value });
    return this;
  }

  async exec(): Promise<["OK"][] | null> {
    if (this.redis.execConflictCount > 0) {
      this.redis.execConflictCount -= 1;
      return null;
    }

    for (const operation of this.operations) {
      this.redis.store.set(operation.key, operation.value);
    }
    return this.operations.map(() => ["OK"]);
  }
}

class FakeRedisClient {
  public readonly store = new Map<string, string>();
  public execConflictCount = 0;

  async watch(..._keys: string[]): Promise<"OK"> {
    return "OK";
  }

  async unwatch(): Promise<"OK"> {
    return "OK";
  }

  async get(key: string): Promise<string | null> {
    return this.store.get(key) || null;
  }

  async set(key: string, value: string): Promise<"OK"> {
    this.store.set(key, value);
    return "OK";
  }

  multi(): FakeRedisMulti {
    return new FakeRedisMulti(this);
  }

  async quit(): Promise<"OK"> {
    return "OK";
  }

  disconnect(): void {}
}

function buildJob(id: string, subjectId: string): ImageJobRecord {
  return {
    id,
    subjectId,
    tool: "compress",
    plan: "free",
    isAdvanced: false,
    watermarkRequired: false,
    inputObjectKey: `tmp/${subjectId}/input/2026/02/24/compress/${id}.jpg`,
    outputObjectKey: `tmp/${subjectId}/output/2026/02/24/compress/${id}.jpg`,
    inputMime: "image/jpeg",
    outputMime: "image/jpeg",
    options: { quality: 80 },
    status: "queued",
    createdAt: "2026-02-24T00:00:00.000Z",
    updatedAt: "2026-02-24T00:00:00.000Z"
  };
}

describe("RedisJobRepository optimistic atomic operations", () => {
  it("retries quota+job reservation when transaction conflicts", async () => {
    const redis = new FakeRedisClient();
    redis.execConflictCount = 1;
    const repo = new RedisJobRepository({
      redisClient: redis as unknown as IORedis,
      clock: () => new Date("2026-02-24T00:00:00.000Z")
    });

    const result = await repo.reserveQuotaAndCreateJob({
      subjectId: "seller_retry",
      requestedImages: 1,
      now: new Date("2026-02-24T00:00:00.000Z"),
      job: buildJob("job_retry", "seller_retry")
    });

    expect(result.allowed).toBe(true);
    expect(result.window.usedCount).toBe(1);

    const stored = await repo.getJob("job_retry");
    expect(stored?.id).toBe("job_retry");
  });

  it("retries dedup completion writes when transaction conflicts", async () => {
    const redis = new FakeRedisClient();
    redis.execConflictCount = 1;
    const repo = new RedisJobRepository({
      redisClient: redis as unknown as IORedis,
      clock: () => new Date("2026-02-24T00:00:00.000Z")
    });

    await repo.finalizeUploadCompletion({
      completion: {
        objectKey: "tmp/seller_dedup/input/2026/02/24/compress/upload_a.jpg",
        canonicalObjectKey: "tmp/seller_dedup/input/2026/02/24/compress/upload_a.jpg",
        subjectId: "seller_dedup",
        sha256: "8c501ad4f25799dbf4d93e6ef6f0a147f6f9e3db7f4f4e4af6a1a4d8d2f662f1",
        sizeBytes: 123,
        contentType: "image/jpeg",
        deduplicated: false,
        createdAt: "2026-02-24T00:00:00.000Z"
      },
      dedupRecord: {
        sha256: "8c501ad4f25799dbf4d93e6ef6f0a147f6f9e3db7f4f4e4af6a1a4d8d2f662f1",
        objectKey: "tmp/seller_dedup/input/2026/02/24/compress/upload_a.jpg",
        sizeBytes: 123,
        contentType: "image/jpeg",
        createdAt: "2026-02-24T00:00:00.000Z"
      }
    });

    const completion = await repo.getUploadCompletion("tmp/seller_dedup/input/2026/02/24/compress/upload_a.jpg");
    expect(completion?.subjectId).toBe("seller_dedup");

    const dedup = await repo.listDedupByHash("8c501ad4f25799dbf4d93e6ef6f0a147f6f9e3db7f4f4e4af6a1a4d8d2f662f1");
    expect(dedup).toHaveLength(1);
    expect(dedup[0].objectKey).toBe("tmp/seller_dedup/input/2026/02/24/compress/upload_a.jpg");
  });
});
