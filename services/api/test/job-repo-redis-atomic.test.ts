import type { ImageJobRecord } from '@imageops/core';
import type IORedis from 'ioredis';
import { describe, expect, it } from 'vitest';
import { RedisJobRepository } from '../src/services/job-repo';

class FakeRedisMulti {
  private readonly operations: Array<{ key: string; value: string }> = [];

  constructor(private readonly redis: FakeRedisClient) {}

  set(key: string, value: string): FakeRedisMulti {
    this.operations.push({ key, value });
    return this;
  }

  async exec(): Promise<['OK'][] | null> {
    if (this.redis.execConflictCount > 0) {
      this.redis.execConflictCount -= 1;
      return null;
    }

    for (const operation of this.operations) {
      this.redis.store.set(operation.key, operation.value);
    }
    return this.operations.map(() => ['OK']);
  }
}

class FakeRedisClient {
  public readonly store = new Map<string, string>();
  public execConflictCount = 0;
  public luaUnavailable = false;
  public evalReplyOverride: unknown = undefined;

  async watch(..._keys: string[]): Promise<'OK'> {
    return 'OK';
  }

  async unwatch(): Promise<'OK'> {
    return 'OK';
  }

  async get(key: string): Promise<string | null> {
    return this.store.get(key) || null;
  }

  async set(key: string, value: string): Promise<'OK'> {
    this.store.set(key, value);
    return 'OK';
  }

  async eval(
    _script: string,
    _numKeys: number,
    quotaKey: string,
    jobKey: string,
    nowIso: string,
    nowMsRaw: string,
    requestedRaw: string,
    quotaLimitRaw: string,
    quotaWindowHoursRaw: string,
    jobJson: string
  ): Promise<[number, string, string, string] | unknown> {
    if (this.luaUnavailable) {
      throw new Error('NOSCRIPT No matching script. Please use EVAL.');
    }

    if (this.evalReplyOverride !== undefined) {
      return this.evalReplyOverride;
    }

    const nowMs = Number.parseInt(nowMsRaw, 10);
    const requested = Number.parseInt(requestedRaw, 10);
    const quotaLimit = Number.parseInt(quotaLimitRaw, 10);
    const quotaWindowHours = Number.parseInt(quotaWindowHoursRaw, 10);
    const quotaWindowMs = quotaWindowHours * 60 * 60 * 1000;

    const existingRaw = this.store.get(quotaKey);
    const existing = existingRaw
      ? (JSON.parse(existingRaw) as {
          windowStartAt?: string;
          windowStartAtEpochMs?: number;
          usedCount?: number;
        })
      : undefined;

    let windowStartAt = existing?.windowStartAt || nowIso;
    let windowStartAtEpochMs = existing?.windowStartAtEpochMs || nowMs;
    let usedCount = existing?.usedCount || 0;

    if (nowMs - windowStartAtEpochMs >= quotaWindowMs) {
      windowStartAt = nowIso;
      windowStartAtEpochMs = nowMs;
      usedCount = 0;
    }

    const nextUsedCount = usedCount + requested;
    if (nextUsedCount > quotaLimit) {
      return [0, windowStartAt, String(usedCount), String(windowStartAtEpochMs + quotaWindowMs)];
    }

    this.store.set(
      quotaKey,
      JSON.stringify({
        windowStartAt,
        windowStartAtEpochMs,
        usedCount: nextUsedCount,
      })
    );
    this.store.set(jobKey, jobJson);
    return [1, windowStartAt, String(nextUsedCount), ''];
  }

  multi(): FakeRedisMulti {
    return new FakeRedisMulti(this);
  }

  async quit(): Promise<'OK'> {
    return 'OK';
  }

  disconnect(): void {}
}

function buildJob(id: string, subjectId: string): ImageJobRecord {
  return {
    id,
    subjectId,
    tool: 'compress',
    plan: 'free',
    isAdvanced: false,
    watermarkRequired: false,
    inputObjectKey: `tmp/${subjectId}/input/2026/02/24/compress/${id}.jpg`,
    outputObjectKey: `tmp/${subjectId}/output/2026/02/24/compress/${id}.jpg`,
    inputMime: 'image/jpeg',
    outputMime: 'image/jpeg',
    options: { quality: 80 },
    status: 'queued',
    createdAt: '2026-02-24T00:00:00.000Z',
    updatedAt: '2026-02-24T00:00:00.000Z',
  };
}

describe('RedisJobRepository optimistic atomic operations', () => {
  it('retries quota+job reservation when transaction conflicts', async () => {
    const redis = new FakeRedisClient();
    redis.execConflictCount = 1;
    redis.luaUnavailable = true;
    const repo = new RedisJobRepository({
      redisClient: redis as unknown as IORedis,
      clock: () => new Date('2026-02-24T00:00:00.000Z'),
    });

    const result = await repo.reserveQuotaAndCreateJob({
      subjectId: 'seller_retry',
      requestedImages: 1,
      now: new Date('2026-02-24T00:00:00.000Z'),
      job: buildJob('job_retry', 'seller_retry'),
    });

    expect(result.allowed).toBe(true);
    expect(result.window.usedCount).toBe(1);

    const stored = await repo.getJob('job_retry');
    expect(stored?.id).toBe('job_retry');
  });

  it('throws when lua script returns an unexpected reply shape', async () => {
    const redis = new FakeRedisClient();
    redis.evalReplyOverride = 'unexpected-reply';
    const repo = new RedisJobRepository({
      redisClient: redis as unknown as IORedis,
      clock: () => new Date('2026-02-24T00:00:00.000Z'),
    });

    await expect(
      repo.reserveQuotaAndCreateJob({
        subjectId: 'seller_bad_reply',
        requestedImages: 1,
        now: new Date('2026-02-24T00:00:00.000Z'),
        job: buildJob('job_bad_reply', 'seller_bad_reply'),
      })
    ).rejects.toThrow(/Unexpected Lua quota response/i);
  });

  it('retries dedup completion writes when transaction conflicts', async () => {
    const redis = new FakeRedisClient();
    redis.execConflictCount = 1;
    const repo = new RedisJobRepository({
      redisClient: redis as unknown as IORedis,
      clock: () => new Date('2026-02-24T00:00:00.000Z'),
    });

    await repo.finalizeUploadCompletion({
      completion: {
        objectKey: 'tmp/seller_dedup/input/2026/02/24/compress/upload_a.jpg',
        canonicalObjectKey: 'tmp/seller_dedup/input/2026/02/24/compress/upload_a.jpg',
        subjectId: 'seller_dedup',
        sha256: '8c501ad4f25799dbf4d93e6ef6f0a147f6f9e3db7f4f4e4af6a1a4d8d2f662f1',
        sizeBytes: 123,
        contentType: 'image/jpeg',
        deduplicated: false,
        createdAt: '2026-02-24T00:00:00.000Z',
      },
      dedupRecord: {
        sha256: '8c501ad4f25799dbf4d93e6ef6f0a147f6f9e3db7f4f4e4af6a1a4d8d2f662f1',
        objectKey: 'tmp/seller_dedup/input/2026/02/24/compress/upload_a.jpg',
        sizeBytes: 123,
        contentType: 'image/jpeg',
        createdAt: '2026-02-24T00:00:00.000Z',
      },
    });

    const completion = await repo.getUploadCompletion(
      'tmp/seller_dedup/input/2026/02/24/compress/upload_a.jpg'
    );
    expect(completion?.subjectId).toBe('seller_dedup');

    const dedup = await repo.listDedupByHash(
      '8c501ad4f25799dbf4d93e6ef6f0a147f6f9e3db7f4f4e4af6a1a4d8d2f662f1'
    );
    expect(dedup).toHaveLength(1);
    expect(dedup[0].objectKey).toBe('tmp/seller_dedup/input/2026/02/24/compress/upload_a.jpg');
  });
});
