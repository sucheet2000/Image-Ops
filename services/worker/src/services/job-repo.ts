import type { DeletionAuditRecord, ImageJobRecord, JobStatus } from "@image-ops/core";
import IORedis from "ioredis";
import { Pool } from "pg";

const JOB_KEY_PREFIX = "imageops:job:";
const DELETION_AUDIT_LIST_KEY = "imageops:deletion-audit";
const POSTGRES_KV_TABLE = "imageops_metadata_kv";
const POSTGRES_AUDIT_TABLE = "imageops_deletion_audit";

/**
 * Builds the Redis key for a job identifier.
 *
 * @param id - The job's identifier
 * @returns The Redis key used to store the job (prefix + id)
 */
function jobKey(id: string): string {
  return `${JOB_KEY_PREFIX}${id}`;
}

export interface WorkerJobRepository {
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
  appendDeletionAudit(record: DeletionAuditRecord): Promise<void>;
  close(): Promise<void>;
}

export class RedisWorkerJobRepository implements WorkerJobRepository {
  private readonly redis: IORedis;
  private closePromise: Promise<void> | null = null;

  constructor(input: { redisUrl: string }) {
    this.redis = new IORedis(input.redisUrl, { maxRetriesPerRequest: null });
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

  async appendDeletionAudit(record: DeletionAuditRecord): Promise<void> {
    await this.redis.rpush(DELETION_AUDIT_LIST_KEY, JSON.stringify(record));
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

export class InMemoryWorkerJobRepository implements WorkerJobRepository {
  private readonly jobs = new Map<string, ImageJobRecord>();
  public readonly deletionAudit: DeletionAuditRecord[] = [];

  seedJob(job: ImageJobRecord): void {
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

  async appendDeletionAudit(record: DeletionAuditRecord): Promise<void> {
    this.deletionAudit.push(record);
  }

  async close(): Promise<void> {
    return Promise.resolve();
  }
}

export class PostgresWorkerJobRepository implements WorkerJobRepository {
  private readonly pool: Pool;
  private initPromise: Promise<void> | null = null;
  private closePromise: Promise<void> | null = null;

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
  }

  private async getStoredValue<T>(key: string): Promise<T | null> {
    await this.initialize();
    const result = await this.pool.query<{ value: T }>(
      `SELECT value FROM ${POSTGRES_KV_TABLE} WHERE key = $1`,
      [key]
    );
    if (result.rowCount === 0) {
      return null;
    }

    return result.rows[0].value;
  }

  private async setStoredValue(key: string, value: unknown): Promise<void> {
    await this.initialize();
    await this.pool.query(
      `
        INSERT INTO ${POSTGRES_KV_TABLE} (key, value, expires_at)
        VALUES ($1, $2::jsonb, NULL)
        ON CONFLICT (key)
        DO UPDATE SET value = EXCLUDED.value, expires_at = EXCLUDED.expires_at
      `,
      [key, JSON.stringify(value)]
    );
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
      updatedAt: input.updatedAt
    };

    if (input.outputObjectKey !== undefined) {
      updated.outputObjectKey = input.outputObjectKey;
    }
    if (input.outputMime !== undefined) {
      updated.outputMime = input.outputMime;
    }
    if (input.errorCode !== undefined) {
      updated.errorCode = input.errorCode;
    }
    if (input.errorMessage !== undefined) {
      updated.errorMessage = input.errorMessage;
    }

    await this.setStoredValue(jobKey(input.id), updated);
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

  async close(): Promise<void> {
    if (this.closePromise) {
      return this.closePromise;
    }

    this.closePromise = this.pool.end();
    return this.closePromise;
  }
}
