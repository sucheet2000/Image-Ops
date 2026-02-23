import type { DeletionAuditRecord, ImageJobRecord, JobStatus } from "@image-ops/core";
import IORedis from "ioredis";

const JOB_KEY_PREFIX = "imageops:job:";
const DELETION_AUDIT_LIST_KEY = "imageops:deletion-audit";

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
}

export class RedisWorkerJobRepository implements WorkerJobRepository {
  private readonly redis: IORedis;

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
}
