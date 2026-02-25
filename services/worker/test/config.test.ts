import { describe, expect, it } from 'vitest';
import { loadWorkerConfig } from '../src/config';

function baseEnv(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    S3_BUCKET: 'image-ops-temp',
    S3_ACCESS_KEY: 'test-key',
    S3_SECRET_KEY: 'test-secret',
    BG_REMOVE_API_URL: 'https://provider.example.com/remove',
  };
}

describe('loadWorkerConfig production safeguards', () => {
  it('rejects redis metadata driver in production', () => {
    expect(() =>
      loadWorkerConfig({ ...baseEnv(), NODE_ENV: 'production', JOB_REPO_DRIVER: 'redis' })
    ).toThrow();
  });

  it('rejects minioadmin credentials in production', () => {
    expect(() =>
      loadWorkerConfig({
        ...baseEnv(),
        NODE_ENV: 'production',
        JOB_REPO_DRIVER: 'postgres',
        POSTGRES_URL: 'postgres://user:pass@localhost:5432/image_ops',
        S3_ACCESS_KEY: 'minioadmin',
        S3_SECRET_KEY: 'minioadmin',
      })
    ).toThrow();
  });

  it('accepts postgres metadata driver in production', () => {
    const config = loadWorkerConfig({
      ...baseEnv(),
      NODE_ENV: 'production',
      JOB_REPO_DRIVER: 'postgres',
      POSTGRES_URL: 'postgres://user:pass@localhost:5432/image_ops',
    });

    expect(config.jobRepoDriver).toBe('postgres');
    expect(config.postgresUrl).toContain('postgres://');
  });

  it('accepts non-default S3 credentials in production', () => {
    const config = loadWorkerConfig({
      ...baseEnv(),
      NODE_ENV: 'production',
      JOB_REPO_DRIVER: 'postgres',
      POSTGRES_URL: 'postgres://user:pass@localhost:5432/image_ops',
      S3_ACCESS_KEY: 'prod-access-key',
      S3_SECRET_KEY: 'prod-secret-key',
    });

    expect(config.s3AccessKey).toBe('prod-access-key');
  });

  it('rejects background remove backoff base greater than max', () => {
    expect(() =>
      loadWorkerConfig({
        ...baseEnv(),
        BG_REMOVE_BACKOFF_BASE_MS: '2000',
        BG_REMOVE_BACKOFF_MAX_MS: '1000',
      })
    ).toThrow();
  });

  it('rejects invalid worker concurrency ordering', () => {
    expect(() =>
      loadWorkerConfig({
        ...baseEnv(),
        WORKER_FAST_CONCURRENCY: '2',
        WORKER_SLOW_CONCURRENCY: '4',
        WORKER_BULK_CONCURRENCY: '1',
      })
    ).toThrow();
  });

  it('rejects worker concurrency ordering when slow is less than bulk', () => {
    expect(() =>
      loadWorkerConfig({
        ...baseEnv(),
        WORKER_FAST_CONCURRENCY: '4',
        WORKER_SLOW_CONCURRENCY: '1',
        WORKER_BULK_CONCURRENCY: '2',
      })
    ).toThrow();
  });
});
