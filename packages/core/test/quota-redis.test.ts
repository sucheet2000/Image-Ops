import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import IORedis from 'ioredis';
import { checkAndIncrementQuota, loadQuotaScript } from '../src';

const shouldRun = process.env.RUN_INTEGRATION_TESTS === '1' || process.env.CORE_REDIS_TESTS === '1';
const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

describe.skipIf(!shouldRun)('redis quota script', () => {
  let redis: IORedis;

  beforeAll(async () => {
    redis = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    await redis.ping();
    await loadQuotaScript(redis);
  });

  afterAll(async () => {
    if (redis) {
      await redis.quit();
    }
  });

  it('allows exactly 6 of 8 concurrent quota increments', async () => {
    const userId = `core_quota_concurrency_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const nowMs = Date.now();

    const attempts = await Promise.all(
      Array.from({ length: 8 }, () => checkAndIncrementQuota(redis, userId, 6, 10 * 60 * 60, nowMs))
    );

    const allowedCount = attempts.filter(Boolean).length;
    const deniedCount = attempts.filter((allowed) => !allowed).length;

    expect(allowedCount).toBe(6);
    expect(deniedCount).toBe(2);
  });
});
