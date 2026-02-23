import type {
  CleanupIdempotencyRecord,
  DeletionAuditRecord,
  ImageJobRecord,
  JobStatus,
  QuotaWindow
} from "@image-ops/core";
import type { ApiConfig } from "../config";
import IORedis from "ioredis";
import { Pool } from "pg";

const JOB_KEY_PREFIX = "imageops:job:";
const QUOTA_KEY_PREFIX = "imageops:quota:";
const CLEANUP_IDEMPOTENCY_PREFIX = "imageops:cleanup-idempotency:";
const DELETION_AUDIT_LIST_KEY = "imageops:deletion-audit";
const POSTGRES_KV_TABLE = "imageops_metadata_kv";
const POSTGRES_AUDIT_TABLE = "imageops_deletion_audit";

export interface JobRepository {
  getQuotaWindow(subjectId: string): Promise<QuotaWindow | null>;
  setQuotaWindow(subjectId: string, window: QuotaWindow): Promise<void>;
  createJob(job: ImageJobRecord): Promise<void>;
  getJob(id: string): Promise<ImageJobRecord | null>;
  updateJobStatus(input: {
    id: string;
    status: JobStatus;
    outputObjectKey?: string;
    outputMime?: string;
    errorCode?: string;
    errorMessage?: string;
    updatedAt: string;
  }): Promise<void>;
  getCleanupIdempotency(key: string): Promise<CleanupIdempotencyRecord | null>;
  setCleanupIdempotency(key: string, record: CleanupIdempotencyRecord, ttlSeconds: number): Promise<void>;
  appendDeletionAudit(record: DeletionAuditRecord): Promise<void>;
  listDeletionAudit(limit: number): Promise<DeletionAuditRecord[]>;
  close(): Promise<void>;
}

/**
 * Builds the namespaced Redis key for a job record.
 *
 * @param id - The job's unique identifier
 * @returns The Redis key for the job (JOB_KEY_PREFIX + `id`)
 */
function jobKey(id: string): string {
  return `${JOB_KEY_PREFIX}${id}`;
}

/**
 * Builds the Redis key used to store a subject's quota window.
 *
 * @param subjectId - The subject identifier to include in the key
 * @returns The namespaced Redis key for the subject's quota (e.g. `imageops:quota:<subjectId>`)
 */
function quotaKey(subjectId: string): string {
  return `${QUOTA_KEY_PREFIX}${subjectId}`;
}

/**
 * Build the Redis key used to store a cleanup idempotency record for the given identifier.
 *
 * @param key - The idempotency identifier to namespace
 * @returns The Redis key string (prefixed for cleanup idempotency)
 */
function idempotencyKey(key: string): string {
  return `${CLEANUP_IDEMPOTENCY_PREFIX}${key}`;
}

export class RedisJobRepository implements JobRepository {
  private readonly redis: IORedis;
  private closePromise: Promise<void> | null = null;

  constructor(input: { redisUrl: string }) {
    this.redis = new IORedis(input.redisUrl, { maxRetriesPerRequest: null });
  }

  async getQuotaWindow(subjectId: string): Promise<QuotaWindow | null> {
    const value = await this.redis.get(quotaKey(subjectId));
    if (!value) {
      return null;
    }
    return JSON.parse(value) as QuotaWindow;
  }

  async setQuotaWindow(subjectId: string, window: QuotaWindow): Promise<void> {
    await this.redis.set(quotaKey(subjectId), JSON.stringify(window));
  }

  async createJob(job: ImageJobRecord): Promise<void> {
    await this.redis.set(jobKey(job.id), JSON.stringify(job));
  }

  async getJob(id: string): Promise<ImageJobRecord | null> {
    const raw = await this.redis.get(jobKey(id));
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as ImageJobRecord;
  }

  async updateJobStatus(input: {
    id: string;
    status: JobStatus;
    outputObjectKey?: string;
    outputMime?: string;
    errorCode?: string;
    errorMessage?: string;
    updatedAt: string;
  }): Promise<void> {
    const existing = await this.getJob(input.id);
    if (!existing) {
      return;
    }

    const updated: ImageJobRecord = {
      ...existing,
      status: input.status,
      outputObjectKey: input.outputObjectKey,
      outputMime: input.outputMime,
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
      updatedAt: input.updatedAt
    };

    await this.redis.set(jobKey(input.id), JSON.stringify(updated));
  }

  async getCleanupIdempotency(key: string): Promise<CleanupIdempotencyRecord | null> {
    const raw = await this.redis.get(idempotencyKey(key));
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as CleanupIdempotencyRecord;
  }

  async setCleanupIdempotency(key: string, record: CleanupIdempotencyRecord, ttlSeconds: number): Promise<void> {
    await this.redis.set(idempotencyKey(key), JSON.stringify(record), "EX", ttlSeconds);
  }

  async appendDeletionAudit(record: DeletionAuditRecord): Promise<void> {
    await this.redis.rpush(DELETION_AUDIT_LIST_KEY, JSON.stringify(record));
  }

  async listDeletionAudit(limit: number): Promise<DeletionAuditRecord[]> {
    const rows = await this.redis.lrange(DELETION_AUDIT_LIST_KEY, Math.max(-limit, -1000), -1);
    return rows.map((value) => JSON.parse(value) as DeletionAuditRecord);
  }

  async close(): Promise<void> {
    if (this.closePromise) {
      return this.closePromise;
    }
    this.closePromise = (async () => {
      try {
        await this.redis.quit();
      } catch {
        this.redis.disconnect(false);
      }
    })();
    return this.closePromise;
  }
}

export class PostgresJobRepository implements JobRepository {
  private readonly pool: Pool;
  private initPromise: Promise<void> | null = null;

  constructor(input: { connectionString: string }) {
    this.pool = new Pool({ connectionString: input.connectionString });
  }

  private async initialize(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.ensureSchema();
    }
    await this.initPromise;
  }

  private async ensureSchema(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ${POSTGRES_KV_TABLE} (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL,
        expires_at TIMESTAMPTZ NULL
      );
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ${POSTGRES_AUDIT_TABLE} (
        id TEXT PRIMARY KEY,
        payload JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS imageops_deletion_audit_created_idx
      ON ${POSTGRES_AUDIT_TABLE} (created_at DESC);
    `);
  }

  private async getStoredValue<T>(key: string): Promise<T | null> {
    await this.initialize();
    const result = await this.pool.query<{ value: T; expires_at: Date | null }>(
      `SELECT value, expires_at FROM ${POSTGRES_KV_TABLE} WHERE key = $1`,
      [key]
    );
    if (result.rowCount === 0) {
      return null;
    }

    const row = result.rows[0];
    if (row.expires_at && row.expires_at.getTime() <= Date.now()) {
      await this.pool.query(`DELETE FROM ${POSTGRES_KV_TABLE} WHERE key = $1`, [key]);
      return null;
    }

    return row.value;
  }

  private async setStoredValue(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    await this.initialize();
    const expiresAt = ttlSeconds ? new Date(Date.now() + ttlSeconds * 1000).toISOString() : null;
    await this.pool.query(
      `
        INSERT INTO ${POSTGRES_KV_TABLE} (key, value, expires_at)
        VALUES ($1, $2::jsonb, $3::timestamptz)
        ON CONFLICT (key)
        DO UPDATE SET value = EXCLUDED.value, expires_at = EXCLUDED.expires_at
      `,
      [key, JSON.stringify(value), expiresAt]
    );
  }

  async getQuotaWindow(subjectId: string): Promise<QuotaWindow | null> {
    return this.getStoredValue<QuotaWindow>(quotaKey(subjectId));
  }

  async setQuotaWindow(subjectId: string, window: QuotaWindow): Promise<void> {
    await this.setStoredValue(quotaKey(subjectId), window);
  }

  async createJob(job: ImageJobRecord): Promise<void> {
    await this.setStoredValue(jobKey(job.id), job);
  }

  async getJob(id: string): Promise<ImageJobRecord | null> {
    return this.getStoredValue<ImageJobRecord>(jobKey(id));
  }

  async updateJobStatus(input: {
    id: string;
    status: JobStatus;
    outputObjectKey?: string;
    outputMime?: string;
    errorCode?: string;
    errorMessage?: string;
    updatedAt: string;
  }): Promise<void> {
    const existing = await this.getJob(input.id);
    if (!existing) {
      return;
    }

    const updated: ImageJobRecord = {
      ...existing,
      status: input.status,
      outputObjectKey: input.outputObjectKey,
      outputMime: input.outputMime,
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
      updatedAt: input.updatedAt
    };
    await this.setStoredValue(jobKey(input.id), updated);
  }

  async getCleanupIdempotency(key: string): Promise<CleanupIdempotencyRecord | null> {
    return this.getStoredValue<CleanupIdempotencyRecord>(idempotencyKey(key));
  }

  async setCleanupIdempotency(key: string, record: CleanupIdempotencyRecord, ttlSeconds: number): Promise<void> {
    await this.setStoredValue(idempotencyKey(key), record, ttlSeconds);
  }

  async appendDeletionAudit(record: DeletionAuditRecord): Promise<void> {
    await this.initialize();
    await this.pool.query(
      `
        INSERT INTO ${POSTGRES_AUDIT_TABLE} (id, payload)
        VALUES ($1, $2::jsonb)
        ON CONFLICT (id) DO NOTHING
      `,
      [record.id, JSON.stringify(record)]
    );
  }

  async listDeletionAudit(limit: number): Promise<DeletionAuditRecord[]> {
    await this.initialize();
    const result = await this.pool.query<{ payload: DeletionAuditRecord }>(
      `
        SELECT payload
        FROM ${POSTGRES_AUDIT_TABLE}
        ORDER BY created_at DESC
        LIMIT $1
      `,
      [Math.max(limit, 0)]
    );
    return result.rows.map((row) => row.payload).reverse();
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export class InMemoryJobRepository implements JobRepository {
  private readonly quotas = new Map<string, QuotaWindow>();
  private readonly jobs = new Map<string, ImageJobRecord>();
  private readonly idempotency = new Map<string, CleanupIdempotencyRecord>();
  private readonly deletionAudit: DeletionAuditRecord[] = [];

  async getQuotaWindow(subjectId: string): Promise<QuotaWindow | null> {
    return this.quotas.get(subjectId) || null;
  }

  async setQuotaWindow(subjectId: string, window: QuotaWindow): Promise<void> {
    this.quotas.set(subjectId, window);
  }

  async createJob(job: ImageJobRecord): Promise<void> {
    this.jobs.set(job.id, job);
  }

  async getJob(id: string): Promise<ImageJobRecord | null> {
    return this.jobs.get(id) || null;
  }

  async updateJobStatus(input: {
    id: string;
    status: JobStatus;
    outputObjectKey?: string;
    outputMime?: string;
    errorCode?: string;
    errorMessage?: string;
    updatedAt: string;
  }): Promise<void> {
    const existing = this.jobs.get(input.id);
    if (!existing) {
      return;
    }

    this.jobs.set(input.id, {
      ...existing,
      status: input.status,
      outputObjectKey: input.outputObjectKey,
      outputMime: input.outputMime,
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
      updatedAt: input.updatedAt
    });
  }

  async getCleanupIdempotency(key: string): Promise<CleanupIdempotencyRecord | null> {
    return this.idempotency.get(key) || null;
  }

  async setCleanupIdempotency(key: string, record: CleanupIdempotencyRecord): Promise<void> {
    this.idempotency.set(key, record);
  }

  async appendDeletionAudit(record: DeletionAuditRecord): Promise<void> {
    this.deletionAudit.push(record);
  }

  async listDeletionAudit(limit: number): Promise<DeletionAuditRecord[]> {
    return this.deletionAudit.slice(-limit);
  }

  async close(): Promise<void> {}
}

export function createJobRepository(config: ApiConfig): JobRepository {
  if (config.jobRepoDriver === "postgres") {
    if (!config.postgresUrl) {
      throw new Error("POSTGRES_URL is required when JOB_REPO_DRIVER=postgres");
    }
    return new PostgresJobRepository({ connectionString: config.postgresUrl });
  }

  return new RedisJobRepository({ redisUrl: config.redisUrl });
}
