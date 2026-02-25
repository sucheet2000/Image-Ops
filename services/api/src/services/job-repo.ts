import {
  applyQuota,
  ConflictError,
  FREE_PLAN_LIMIT,
  FREE_PLAN_WINDOW_HOURS,
  ValidationError,
  type AuthRefreshSession,
  type DedupObjectRecord,
  BillingCheckoutSession,
  BillingCheckoutStatus,
  BillingWebhookEvent,
  CleanupIdempotencyRecord,
  DeletionAuditRecord,
  ImageJobRecord,
  JobStatus,
  QuotaWindow,
  SubjectProfile,
  type UploadCompletionRecord,
  type QuotaResult
} from "@imageops/core";
import type { ApiConfig } from "../config";
import IORedis from "ioredis";
import { Pool } from "pg";
import { logError } from "../lib/log";

const JOB_KEY_PREFIX = "imageops:job:";
const QUOTA_KEY_PREFIX = "imageops:quota:";
const SUBJECT_PROFILE_KEY_PREFIX = "imageops:subject-profile:";
const BILLING_CHECKOUT_KEY_PREFIX = "imageops:billing-checkout:";
const BILLING_CHECKOUT_SUBJECT_INDEX_PREFIX = "imageops:billing-checkout-subject:";
const BILLING_EVENT_KEY_PREFIX = "imageops:billing-event:";
const CLEANUP_IDEMPOTENCY_PREFIX = "imageops:cleanup-idempotency:";
const UPLOAD_COMPLETION_PREFIX = "imageops:upload-completion:";
const DEDUP_HASH_PREFIX = "imageops:dedup-hash:";
const AUTH_REFRESH_SESSION_PREFIX = "imageops:auth-refresh:";
const DELETION_AUDIT_LIST_KEY = "imageops:deletion-audit";
const BILLING_EVENT_LIST_KEY = "imageops:billing-events";

const POSTGRES_KV_TABLE = "imageops_metadata_kv";
const POSTGRES_AUDIT_TABLE = "imageops_deletion_audit";
const POSTGRES_BILLING_EVENT_TABLE = "imageops_billing_events";

export interface JobRepository {
  getQuotaWindow(subjectId: string): Promise<QuotaWindow | null>;
  setQuotaWindow(subjectId: string, window: QuotaWindow): Promise<void>;
  reserveQuotaAndCreateJob(input: {
    subjectId: string;
    requestedImages: number;
    now: Date;
    job: ImageJobRecord;
    quotaLimit?: number;
    quotaWindowHours?: number;
  }): Promise<QuotaResult>;

  getUploadCompletion(objectKey: string): Promise<UploadCompletionRecord | null>;
  finalizeUploadCompletion(input: {
    completion: UploadCompletionRecord;
    dedupRecord: DedupObjectRecord;
  }): Promise<void>;
  listDedupByHash(sha256: string): Promise<DedupObjectRecord[]>;

  getSubjectProfile(subjectId: string): Promise<SubjectProfile | null>;
  upsertSubjectProfile(profile: SubjectProfile): Promise<void>;

  putAuthRefreshSession(session: AuthRefreshSession, ttlSeconds: number): Promise<void>;
  getAuthRefreshSession(id: string): Promise<AuthRefreshSession | null>;
  revokeAuthRefreshSession(id: string, revokedAt: string): Promise<void>;

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

  createBillingCheckoutSession(session: BillingCheckoutSession, ttlSeconds: number): Promise<void>;
  getBillingCheckoutSession(id: string): Promise<BillingCheckoutSession | null>;
  listBillingCheckoutSessions(limit: number): Promise<BillingCheckoutSession[]>;
  listBillingCheckoutSessionsForSubject(subjectId: string, limit: number): Promise<BillingCheckoutSession[]>;
  updateBillingCheckoutStatus(id: string, status: BillingCheckoutStatus, updatedAt: string): Promise<void>;

  getBillingWebhookEvent(providerEventId: string): Promise<BillingWebhookEvent | null>;
  appendBillingWebhookEvent(event: BillingWebhookEvent): Promise<void>;
  listBillingWebhookEvents(limit: number): Promise<BillingWebhookEvent[]>;

  getCleanupIdempotency(key: string): Promise<CleanupIdempotencyRecord | null>;
  setCleanupIdempotency(key: string, record: CleanupIdempotencyRecord, ttlSeconds: number): Promise<void>;

  appendDeletionAudit(record: DeletionAuditRecord): Promise<void>;
  listDeletionAudit(limit: number): Promise<DeletionAuditRecord[]>;

  close(): Promise<void>;
}

function jobKey(id: string): string {
  return `${JOB_KEY_PREFIX}${id}`;
}

function quotaKey(subjectId: string): string {
  return `${QUOTA_KEY_PREFIX}${subjectId}`;
}

function subjectProfileKey(subjectId: string): string {
  return `${SUBJECT_PROFILE_KEY_PREFIX}${subjectId}`;
}

function billingCheckoutKey(id: string): string {
  return `${BILLING_CHECKOUT_KEY_PREFIX}${id}`;
}

function billingCheckoutSubjectIndexKey(subjectId: string): string {
  return `${BILLING_CHECKOUT_SUBJECT_INDEX_PREFIX}${subjectId}`;
}

function billingEventKey(providerEventId: string): string {
  return `${BILLING_EVENT_KEY_PREFIX}${providerEventId}`;
}

function idempotencyKey(key: string): string {
  return `${CLEANUP_IDEMPOTENCY_PREFIX}${key}`;
}

function uploadCompletionKey(objectKey: string): string {
  return `${UPLOAD_COMPLETION_PREFIX}${objectKey}`;
}

function dedupHashKey(sha256: string): string {
  return `${DEDUP_HASH_PREFIX}${sha256}`;
}

function authRefreshSessionKey(id: string): string {
  return `${AUTH_REFRESH_SESSION_PREFIX}${id}`;
}

function timestampMsOrNow(input: string): number {
  const parsed = Date.parse(input);
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  return Date.now();
}

function formatRepoErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function isLuaUnavailableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return /(NOSCRIPT|BUSY|BUSYKEY|LOADING|READONLY|EVALSHA)/i.test(error.message);
}

export class RedisJobRepository implements JobRepository {
  private static readonly MAX_OPTIMISTIC_RETRIES = 5;
  private static readonly RESERVE_QUOTA_AND_CREATE_JOB_LUA = `
local quotaKey = KEYS[1]
local jobKey = KEYS[2]
local nowIso = ARGV[1]
local nowMs = tonumber(ARGV[2])
local requested = tonumber(ARGV[3])
local quotaLimit = tonumber(ARGV[4])
local quotaWindowHours = tonumber(ARGV[5])
local jobJson = ARGV[6]

if requested < 0 then
  return {err="REQUESTED_IMAGES_NEGATIVE"}
end

local existingRaw = redis.call("GET", quotaKey)
local windowStartAt = nowIso
local windowStartAtEpochMs = nowMs
local usedCount = 0

if existingRaw then
  local ok, existing = pcall(cjson.decode, existingRaw)
  if ok and existing then
    if type(existing.windowStartAt) == "string" and string.len(existing.windowStartAt) > 0 then
      windowStartAt = existing.windowStartAt
    end

    if existing.windowStartAtEpochMs ~= nil then
      local parsedWindowStartAtEpochMs = tonumber(existing.windowStartAtEpochMs)
      if parsedWindowStartAtEpochMs ~= nil then
        windowStartAtEpochMs = parsedWindowStartAtEpochMs
      end
    end

    local parsedUsedCount = tonumber(existing.usedCount)
    if parsedUsedCount ~= nil then
      usedCount = parsedUsedCount
    end
  end
end

local quotaWindowMs = quotaWindowHours * 3600000
if (nowMs - windowStartAtEpochMs) >= quotaWindowMs then
  windowStartAt = nowIso
  windowStartAtEpochMs = nowMs
  usedCount = 0
end

local nextUsedCount = usedCount + requested
if nextUsedCount > quotaLimit then
  return {0, windowStartAt, tostring(usedCount), tostring(windowStartAtEpochMs + quotaWindowMs)}
end

redis.call("SET", quotaKey, cjson.encode({
  windowStartAt = windowStartAt,
  windowStartAtEpochMs = windowStartAtEpochMs,
  usedCount = nextUsedCount
}))
redis.call("SET", jobKey, jobJson)

return {1, windowStartAt, tostring(nextUsedCount), ""}
`;
  private readonly redis: IORedis;
  private readonly now: () => Date;
  private closePromise: Promise<void> | null = null;

  constructor(input: { redisUrl?: string; clock?: () => Date; redisClient?: IORedis }) {
    if (!input.redisClient && !input.redisUrl) {
      throw new ValidationError("redisUrl is required when redisClient is not provided");
    }

    this.redis = input.redisClient || new IORedis(input.redisUrl!, { maxRetriesPerRequest: null });
    this.now = input.clock || (() => new Date());
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

  async reserveQuotaAndCreateJob(input: {
    subjectId: string;
    requestedImages: number;
    now: Date;
    job: ImageJobRecord;
    quotaLimit?: number;
    quotaWindowHours?: number;
  }): Promise<QuotaResult> {
    const subjectQuotaKey = quotaKey(input.subjectId);
    const jobStorageKey = jobKey(input.job.id);

    try {
      const quotaLimit = input.quotaLimit ?? FREE_PLAN_LIMIT;
      const quotaWindowHours = input.quotaWindowHours ?? FREE_PLAN_WINDOW_HOURS;
      const evalResult = await this.redis.eval(
        RedisJobRepository.RESERVE_QUOTA_AND_CREATE_JOB_LUA,
        2,
        subjectQuotaKey,
        jobStorageKey,
        input.now.toISOString(),
        String(input.now.getTime()),
        String(input.requestedImages),
        String(quotaLimit),
        String(quotaWindowHours),
        JSON.stringify(input.job)
      ) as [number | string, string, string, string] | null;

      if (Array.isArray(evalResult)) {
        const allowedFlag = Number(evalResult[0]);
        const windowStartAt = String(evalResult[1] || input.now.toISOString());
        const usedCount = Number.parseInt(String(evalResult[2] || "0"), 10);
        const nextWindowStartMs = Number.parseInt(String(evalResult[3] || "0"), 10);
        const normalizedUsedCount = Number.isFinite(usedCount) ? usedCount : 0;

        if (allowedFlag === 1) {
          return {
            allowed: true,
            window: {
              windowStartAt,
              usedCount: normalizedUsedCount
            }
          };
        }

        return {
          allowed: false,
          window: {
            windowStartAt,
            usedCount: normalizedUsedCount
          },
          nextWindowStartAt: Number.isFinite(nextWindowStartMs) && nextWindowStartMs > 0
            ? new Date(nextWindowStartMs).toISOString()
            : undefined
        };
      }

      if (evalResult !== null) {
        let serialized = String(evalResult);
        try {
          serialized = JSON.stringify(evalResult);
        } catch {
          // Keep string fallback when serialization fails.
        }

        throw new Error(
          `Unexpected Lua quota response for ${subjectQuotaKey} at ${input.now.toISOString()}: ${serialized}`
        );
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("REQUESTED_IMAGES_NEGATIVE")) {
        throw new ValidationError("requestedImages must be non-negative");
      }

      if (isLuaUnavailableError(error)) {
        logError("job_repo.reserve_quota.lua_unavailable", {
          subjectId: input.subjectId,
          jobId: input.job.id,
          quotaKey: subjectQuotaKey,
          error: formatRepoErrorMessage(error)
        });
        return this.reserveQuotaAndCreateJobOptimistic(input);
      }

      logError("job_repo.reserve_quota.lua_failed", {
        subjectId: input.subjectId,
        jobId: input.job.id,
        quotaKey: subjectQuotaKey,
        error: formatRepoErrorMessage(error)
      });
      throw error;
    }

    return this.reserveQuotaAndCreateJobOptimistic(input);
  }

  private async reserveQuotaAndCreateJobOptimistic(input: {
    subjectId: string;
    requestedImages: number;
    now: Date;
    job: ImageJobRecord;
    quotaLimit?: number;
    quotaWindowHours?: number;
  }): Promise<QuotaResult> {
    const subjectQuotaKey = quotaKey(input.subjectId);

    for (let attempt = 0; attempt < RedisJobRepository.MAX_OPTIMISTIC_RETRIES; attempt += 1) {
      await this.redis.watch(subjectQuotaKey);

      try {
        const existingRaw = await this.redis.get(subjectQuotaKey);
        const existing = existingRaw
          ? (JSON.parse(existingRaw) as QuotaWindow)
          : {
              windowStartAt: input.now.toISOString(),
              usedCount: 0
            };
        const quotaResult = applyQuota(
          existing,
          input.requestedImages,
          input.now,
          input.quotaLimit,
          input.quotaWindowHours
        );
        if (!quotaResult.allowed) {
          await this.redis.unwatch();
          return quotaResult;
        }

        const committed = await this.redis.multi()
          .set(subjectQuotaKey, JSON.stringify(quotaResult.window))
          .set(jobKey(input.job.id), JSON.stringify(input.job))
          .exec();

        if (committed) {
          return quotaResult;
        }
      } finally {
        await this.redis.unwatch();
      }
    }

    throw new ConflictError("Failed to reserve quota and create job due to concurrent updates.");
  }

  async getUploadCompletion(objectKey: string): Promise<UploadCompletionRecord | null> {
    const raw = await this.redis.get(uploadCompletionKey(objectKey));
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as UploadCompletionRecord;
  }

  async finalizeUploadCompletion(input: {
    completion: UploadCompletionRecord;
    dedupRecord: DedupObjectRecord;
  }): Promise<void> {
    const completionKey = uploadCompletionKey(input.completion.objectKey);
    const dedupKey = dedupHashKey(input.dedupRecord.sha256);

    for (let attempt = 0; attempt < RedisJobRepository.MAX_OPTIMISTIC_RETRIES; attempt += 1) {
      await this.redis.watch(completionKey, dedupKey);

      try {
        const existingRaw = await this.redis.get(dedupKey);
        const existing = existingRaw ? (JSON.parse(existingRaw) as DedupObjectRecord[]) : [];

        if (!existing.some((record) => record.objectKey === input.dedupRecord.objectKey)) {
          existing.push(input.dedupRecord);
        }

        const committed = await this.redis.multi()
          .set(completionKey, JSON.stringify(input.completion))
          .set(dedupKey, JSON.stringify(existing))
          .exec();
        if (committed) {
          return;
        }
      } finally {
        await this.redis.unwatch();
      }
    }

    throw new ConflictError("Failed to finalize upload completion due to concurrent updates.");
  }

  async listDedupByHash(sha256: string): Promise<DedupObjectRecord[]> {
    const raw = await this.redis.get(dedupHashKey(sha256));
    if (!raw) {
      return [];
    }
    return JSON.parse(raw) as DedupObjectRecord[];
  }

  async getSubjectProfile(subjectId: string): Promise<SubjectProfile | null> {
    const raw = await this.redis.get(subjectProfileKey(subjectId));
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as SubjectProfile;
  }

  async upsertSubjectProfile(profile: SubjectProfile): Promise<void> {
    await this.redis.set(subjectProfileKey(profile.subjectId), JSON.stringify(profile));
  }

  async putAuthRefreshSession(session: AuthRefreshSession, ttlSeconds: number): Promise<void> {
    await this.redis.set(authRefreshSessionKey(session.id), JSON.stringify(session), "EX", ttlSeconds);
  }

  async getAuthRefreshSession(id: string): Promise<AuthRefreshSession | null> {
    const key = authRefreshSessionKey(id);
    const raw = await this.redis.eval(
      `
local key = KEYS[1]
local ttl = redis.call("TTL", key)
if ttl == -2 then
  return nil
end
if ttl == -1 then
  local value = redis.call("GET", key)
  redis.call("DEL", key)
  return value
end
return redis.call("GET", key)
`,
      1,
      key
    ) as string | null;
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as AuthRefreshSession;
  }

  async revokeAuthRefreshSession(id: string, revokedAt: string): Promise<void> {
    const existing = await this.getAuthRefreshSession(id);
    if (!existing) {
      return;
    }

    const ttlSeconds = Math.floor((new Date(existing.expiresAt).getTime() - this.now().getTime()) / 1000);
    if (ttlSeconds <= 0) {
      await this.redis.del(authRefreshSessionKey(id));
      return;
    }

    await this.redis.set(
      authRefreshSessionKey(id),
      JSON.stringify({
        ...existing,
        revokedAt,
        updatedAt: revokedAt
      }),
      "EX",
      ttlSeconds
    );
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

    await this.redis.set(jobKey(input.id), JSON.stringify(updated));
  }

  async createBillingCheckoutSession(session: BillingCheckoutSession, ttlSeconds: number): Promise<void> {
    await this.redis.multi()
      .set(billingCheckoutKey(session.id), JSON.stringify(session), "EX", ttlSeconds)
      .zadd(billingCheckoutSubjectIndexKey(session.subjectId), timestampMsOrNow(session.updatedAt), session.id)
      .exec();
  }

  async getBillingCheckoutSession(id: string): Promise<BillingCheckoutSession | null> {
    const raw = await this.redis.get(billingCheckoutKey(id));
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as BillingCheckoutSession;
  }

  async listBillingCheckoutSessions(limit: number): Promise<BillingCheckoutSession[]> {
    const keys = await this.redis.keys(`${BILLING_CHECKOUT_KEY_PREFIX}*`);
    if (keys.length === 0 || limit <= 0) {
      return [];
    }

    const rows = await this.redis.mget(...keys);
    const sessions = rows
      .filter((value): value is string => Boolean(value))
      .map((value) => JSON.parse(value) as BillingCheckoutSession)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));

    return sessions.slice(-limit);
  }

  async listBillingCheckoutSessionsForSubject(subjectId: string, limit: number): Promise<BillingCheckoutSession[]> {
    if (limit <= 0) {
      return [];
    }

    const ids = await this.redis.zrevrange(billingCheckoutSubjectIndexKey(subjectId), 0, Math.max(limit - 1, 0));
    if (ids.length === 0) {
      return [];
    }

    const rows = await this.redis.mget(...ids.map((id) => billingCheckoutKey(id)));
    return rows
      .filter((value): value is string => Boolean(value))
      .map((value) => JSON.parse(value) as BillingCheckoutSession)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, limit);
  }

  async updateBillingCheckoutStatus(id: string, status: BillingCheckoutStatus, updatedAt: string): Promise<void> {
    const existing = await this.getBillingCheckoutSession(id);
    if (!existing) {
      return;
    }

    const ttlSeconds = Math.max(1, Math.floor((new Date(existing.expiresAt).getTime() - this.now().getTime()) / 1000));
    await this.redis.set(
      billingCheckoutKey(id),
      JSON.stringify({
        ...existing,
        status,
        updatedAt
      }),
      "EX",
      ttlSeconds
    );
    await this.redis.zadd(billingCheckoutSubjectIndexKey(existing.subjectId), timestampMsOrNow(updatedAt), id);
  }

  async getBillingWebhookEvent(providerEventId: string): Promise<BillingWebhookEvent | null> {
    const raw = await this.redis.get(billingEventKey(providerEventId));
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as BillingWebhookEvent;
  }

  async appendBillingWebhookEvent(event: BillingWebhookEvent): Promise<void> {
    const inserted = await this.redis.set(billingEventKey(event.providerEventId), JSON.stringify(event), "NX");
    if (inserted === null) {
      return;
    }

    await this.redis.rpush(BILLING_EVENT_LIST_KEY, JSON.stringify(event));
  }

  async listBillingWebhookEvents(limit: number): Promise<BillingWebhookEvent[]> {
    const rows = await this.redis.lrange(BILLING_EVENT_LIST_KEY, Math.max(-limit, -1000), -1);
    return rows.map((value) => JSON.parse(value) as BillingWebhookEvent);
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
    if (limit <= 0) {
      return [];
    }

    const n = Math.min(limit, 1000);
    const rows = await this.redis.lrange(DELETION_AUDIT_LIST_KEY, -n, -1);
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
  private readonly now: () => Date;
  private initPromise: Promise<void> | null = null;

  constructor(input: { connectionString: string; clock?: () => Date }) {
    this.pool = new Pool({ connectionString: input.connectionString });
    this.now = input.clock || (() => new Date());
  }

  private async initialize(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.ensureSchema();
    }
    await this.initPromise;
  }

  private async ensureSchema(): Promise<void> {
    // Keep runtime bootstrap as a safety net for environments that have not applied SQL migrations yet.
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
      CREATE TABLE IF NOT EXISTS ${POSTGRES_BILLING_EVENT_TABLE} (
        provider_event_id TEXT PRIMARY KEY,
        payload JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS imageops_deletion_audit_created_idx
      ON ${POSTGRES_AUDIT_TABLE} (created_at DESC);
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS imageops_billing_events_created_idx
      ON ${POSTGRES_BILLING_EVENT_TABLE} (created_at DESC);
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS imageops_billing_checkout_subject_updated_idx
      ON ${POSTGRES_KV_TABLE} ((value->>'subjectId'), (value->>'updatedAt') DESC)
      WHERE key LIKE '${BILLING_CHECKOUT_KEY_PREFIX}%';
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
    if (row.expires_at && row.expires_at.getTime() <= this.now().getTime()) {
      await this.pool.query(`DELETE FROM ${POSTGRES_KV_TABLE} WHERE key = $1`, [key]);
      return null;
    }

    return row.value;
  }

  private async setStoredValue(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    await this.initialize();
    const expiresAt = ttlSeconds ? new Date(this.now().getTime() + ttlSeconds * 1000).toISOString() : null;
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

  async reserveQuotaAndCreateJob(input: {
    subjectId: string;
    requestedImages: number;
    now: Date;
    job: ImageJobRecord;
    quotaLimit?: number;
    quotaWindowHours?: number;
  }): Promise<QuotaResult> {
    await this.initialize();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const quotaResultRow = await client.query<{ value: QuotaWindow; expires_at: Date | null }>(
        `SELECT value, expires_at FROM ${POSTGRES_KV_TABLE} WHERE key = $1 FOR UPDATE`,
        [quotaKey(input.subjectId)]
      );

      const existing = (quotaResultRow.rowCount ?? 0) > 0
        ? (quotaResultRow.rows[0].value as QuotaWindow)
        : { windowStartAt: input.now.toISOString(), usedCount: 0 };

      const quotaResult = applyQuota(
        existing,
        input.requestedImages,
        input.now,
        input.quotaLimit,
        input.quotaWindowHours
      );
      if (!quotaResult.allowed) {
        await client.query("ROLLBACK");
        return quotaResult;
      }

      await client.query(
        `
          INSERT INTO ${POSTGRES_KV_TABLE} (key, value, expires_at)
          VALUES ($1, $2::jsonb, NULL)
          ON CONFLICT (key)
          DO UPDATE SET value = EXCLUDED.value, expires_at = EXCLUDED.expires_at
        `,
        [quotaKey(input.subjectId), JSON.stringify(quotaResult.window)]
      );
      await client.query(
        `
          INSERT INTO ${POSTGRES_KV_TABLE} (key, value, expires_at)
          VALUES ($1, $2::jsonb, NULL)
          ON CONFLICT (key)
          DO UPDATE SET value = EXCLUDED.value, expires_at = EXCLUDED.expires_at
        `,
        [jobKey(input.job.id), JSON.stringify(input.job)]
      );

      await client.query("COMMIT");
      return quotaResult;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getUploadCompletion(objectKey: string): Promise<UploadCompletionRecord | null> {
    return this.getStoredValue<UploadCompletionRecord>(uploadCompletionKey(objectKey));
  }

  async finalizeUploadCompletion(input: {
    completion: UploadCompletionRecord;
    dedupRecord: DedupObjectRecord;
  }): Promise<void> {
    await this.initialize();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const dedupResult = await client.query<{ value: DedupObjectRecord[]; expires_at: Date | null }>(
        `SELECT value, expires_at FROM ${POSTGRES_KV_TABLE} WHERE key = $1 FOR UPDATE`,
        [dedupHashKey(input.dedupRecord.sha256)]
      );
      const existing = (dedupResult.rowCount ?? 0) > 0
        ? (dedupResult.rows[0].value as DedupObjectRecord[])
        : [];
      if (!existing.some((record) => record.objectKey === input.dedupRecord.objectKey)) {
        existing.push(input.dedupRecord);
      }

      await client.query(
        `
          INSERT INTO ${POSTGRES_KV_TABLE} (key, value, expires_at)
          VALUES ($1, $2::jsonb, NULL)
          ON CONFLICT (key)
          DO UPDATE SET value = EXCLUDED.value, expires_at = EXCLUDED.expires_at
        `,
        [uploadCompletionKey(input.completion.objectKey), JSON.stringify(input.completion)]
      );
      await client.query(
        `
          INSERT INTO ${POSTGRES_KV_TABLE} (key, value, expires_at)
          VALUES ($1, $2::jsonb, NULL)
          ON CONFLICT (key)
          DO UPDATE SET value = EXCLUDED.value, expires_at = EXCLUDED.expires_at
        `,
        [dedupHashKey(input.dedupRecord.sha256), JSON.stringify(existing)]
      );

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async listDedupByHash(sha256: string): Promise<DedupObjectRecord[]> {
    return (await this.getStoredValue<DedupObjectRecord[]>(dedupHashKey(sha256))) || [];
  }

  async getSubjectProfile(subjectId: string): Promise<SubjectProfile | null> {
    return this.getStoredValue<SubjectProfile>(subjectProfileKey(subjectId));
  }

  async upsertSubjectProfile(profile: SubjectProfile): Promise<void> {
    await this.setStoredValue(subjectProfileKey(profile.subjectId), profile);
  }

  async putAuthRefreshSession(session: AuthRefreshSession, ttlSeconds: number): Promise<void> {
    await this.setStoredValue(authRefreshSessionKey(session.id), session, ttlSeconds);
  }

  async getAuthRefreshSession(id: string): Promise<AuthRefreshSession | null> {
    return this.getStoredValue<AuthRefreshSession>(authRefreshSessionKey(id));
  }

  async revokeAuthRefreshSession(id: string, revokedAt: string): Promise<void> {
    const existing = await this.getAuthRefreshSession(id);
    if (!existing) {
      return;
    }

    const ttlSeconds = Math.floor((new Date(existing.expiresAt).getTime() - this.now().getTime()) / 1000);
    if (ttlSeconds <= 0) {
      await this.pool.query(`DELETE FROM ${POSTGRES_KV_TABLE} WHERE key = $1`, [authRefreshSessionKey(id)]);
      return;
    }

    await this.setStoredValue(
      authRefreshSessionKey(id),
      {
        ...existing,
        revokedAt,
        updatedAt: revokedAt
      },
      ttlSeconds
    );
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

  async createBillingCheckoutSession(session: BillingCheckoutSession, ttlSeconds: number): Promise<void> {
    await this.setStoredValue(billingCheckoutKey(session.id), session, ttlSeconds);
  }

  async getBillingCheckoutSession(id: string): Promise<BillingCheckoutSession | null> {
    return this.getStoredValue<BillingCheckoutSession>(billingCheckoutKey(id));
  }

  async listBillingCheckoutSessions(limit: number): Promise<BillingCheckoutSession[]> {
    await this.initialize();
    const result = await this.pool.query<{ value: BillingCheckoutSession; expires_at: Date | null }>(
      `
        SELECT value, expires_at
        FROM ${POSTGRES_KV_TABLE}
        WHERE key LIKE $1
        ORDER BY key DESC
      `,
      [`${BILLING_CHECKOUT_KEY_PREFIX}%`]
    );

    if (limit <= 0) {
      return [];
    }

    const nowMs = this.now().getTime();
    const sessions = result.rows
      .filter((row) => !row.expires_at || row.expires_at.getTime() > nowMs)
      .map((row) => row.value)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));

    return sessions.slice(-limit);
  }

  async listBillingCheckoutSessionsForSubject(subjectId: string, limit: number): Promise<BillingCheckoutSession[]> {
    await this.initialize();
    if (limit <= 0) {
      return [];
    }

    const result = await this.pool.query<{ value: BillingCheckoutSession; expires_at: Date | null }>(
      `
        SELECT value, expires_at
        FROM ${POSTGRES_KV_TABLE}
        WHERE key LIKE $1
          AND value->>'subjectId' = $2
        ORDER BY (value->>'updatedAt')::timestamptz DESC NULLS LAST
        LIMIT $3
      `,
      [`${BILLING_CHECKOUT_KEY_PREFIX}%`, subjectId, limit]
    );

    const nowMs = this.now().getTime();
    return result.rows
      .filter((row) => !row.expires_at || row.expires_at.getTime() > nowMs)
      .map((row) => row.value);
  }

  async updateBillingCheckoutStatus(id: string, status: BillingCheckoutStatus, updatedAt: string): Promise<void> {
    const existing = await this.getBillingCheckoutSession(id);
    if (!existing) {
      return;
    }

    const ttlSeconds = Math.max(1, Math.floor((new Date(existing.expiresAt).getTime() - this.now().getTime()) / 1000));
    await this.setStoredValue(
      billingCheckoutKey(id),
      {
        ...existing,
        status,
        updatedAt
      },
      ttlSeconds
    );
  }

  async getBillingWebhookEvent(providerEventId: string): Promise<BillingWebhookEvent | null> {
    await this.initialize();
    const result = await this.pool.query<{ payload: BillingWebhookEvent }>(
      `SELECT payload FROM ${POSTGRES_BILLING_EVENT_TABLE} WHERE provider_event_id = $1`,
      [providerEventId]
    );
    if (result.rowCount === 0) {
      return null;
    }
    return result.rows[0].payload;
  }

  async appendBillingWebhookEvent(event: BillingWebhookEvent): Promise<void> {
    await this.initialize();
    await this.pool.query(
      `
        INSERT INTO ${POSTGRES_BILLING_EVENT_TABLE} (provider_event_id, payload)
        VALUES ($1, $2::jsonb)
        ON CONFLICT (provider_event_id) DO NOTHING
      `,
      [event.providerEventId, JSON.stringify(event)]
    );
  }

  async listBillingWebhookEvents(limit: number): Promise<BillingWebhookEvent[]> {
    await this.initialize();
    const result = await this.pool.query<{ payload: BillingWebhookEvent }>(
      `
        SELECT payload
        FROM ${POSTGRES_BILLING_EVENT_TABLE}
        ORDER BY created_at DESC
        LIMIT $1
      `,
      [Math.max(limit, 0)]
    );
    return result.rows.map((row) => row.payload).reverse();
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
  private readonly uploadCompletions = new Map<string, UploadCompletionRecord>();
  private readonly dedupByHash = new Map<string, DedupObjectRecord[]>();
  private readonly profiles = new Map<string, SubjectProfile>();
  private readonly authRefreshSessions = new Map<string, AuthRefreshSession>();
  private readonly jobs = new Map<string, ImageJobRecord>();
  private readonly checkouts = new Map<string, BillingCheckoutSession>();
  private readonly billingEvents = new Map<string, BillingWebhookEvent>();
  private readonly idempotency = new Map<string, { record: CleanupIdempotencyRecord; expiresAtMs: number }>();
  private readonly deletionAudit: DeletionAuditRecord[] = [];

  async getQuotaWindow(subjectId: string): Promise<QuotaWindow | null> {
    return this.quotas.get(subjectId) || null;
  }

  async setQuotaWindow(subjectId: string, window: QuotaWindow): Promise<void> {
    this.quotas.set(subjectId, window);
  }

  async reserveQuotaAndCreateJob(input: {
    subjectId: string;
    requestedImages: number;
    now: Date;
    job: ImageJobRecord;
    quotaLimit?: number;
    quotaWindowHours?: number;
  }): Promise<QuotaResult> {
    const existing = this.quotas.get(input.subjectId) || {
      windowStartAt: input.now.toISOString(),
      usedCount: 0
    };
    const quotaResult = applyQuota(
      existing,
      input.requestedImages,
      input.now,
      input.quotaLimit,
      input.quotaWindowHours
    );
    if (!quotaResult.allowed) {
      return quotaResult;
    }

    this.quotas.set(input.subjectId, quotaResult.window);
    this.jobs.set(input.job.id, input.job);
    return quotaResult;
  }

  async getUploadCompletion(objectKey: string): Promise<UploadCompletionRecord | null> {
    return this.uploadCompletions.get(objectKey) || null;
  }

  async finalizeUploadCompletion(input: {
    completion: UploadCompletionRecord;
    dedupRecord: DedupObjectRecord;
  }): Promise<void> {
    this.uploadCompletions.set(input.completion.objectKey, input.completion);
    const existing = this.dedupByHash.get(input.dedupRecord.sha256) || [];
    if (!existing.some((record) => record.objectKey === input.dedupRecord.objectKey)) {
      existing.push(input.dedupRecord);
    }
    this.dedupByHash.set(input.dedupRecord.sha256, existing);
  }

  async listDedupByHash(sha256: string): Promise<DedupObjectRecord[]> {
    return [...(this.dedupByHash.get(sha256) || [])];
  }

  async getSubjectProfile(subjectId: string): Promise<SubjectProfile | null> {
    return this.profiles.get(subjectId) || null;
  }

  async upsertSubjectProfile(profile: SubjectProfile): Promise<void> {
    this.profiles.set(profile.subjectId, profile);
  }

  async putAuthRefreshSession(session: AuthRefreshSession, _ttlSeconds: number): Promise<void> {
    this.authRefreshSessions.set(session.id, session);
  }

  async getAuthRefreshSession(id: string): Promise<AuthRefreshSession | null> {
    return this.authRefreshSessions.get(id) || null;
  }

  async revokeAuthRefreshSession(id: string, revokedAt: string): Promise<void> {
    const existing = this.authRefreshSessions.get(id);
    if (!existing) {
      return;
    }
    this.authRefreshSessions.set(id, {
      ...existing,
      revokedAt,
      updatedAt: revokedAt
    });
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

    this.jobs.set(input.id, updated);
  }

  async createBillingCheckoutSession(session: BillingCheckoutSession, _ttlSeconds: number): Promise<void> {
    this.checkouts.set(session.id, session);
  }

  async getBillingCheckoutSession(id: string): Promise<BillingCheckoutSession | null> {
    return this.checkouts.get(id) || null;
  }

  async listBillingCheckoutSessions(limit: number): Promise<BillingCheckoutSession[]> {
    if (limit <= 0) {
      return [];
    }
    const rows = Array.from(this.checkouts.values()).sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    return rows.slice(-limit);
  }

  async listBillingCheckoutSessionsForSubject(subjectId: string, limit: number): Promise<BillingCheckoutSession[]> {
    if (limit <= 0) {
      return [];
    }

    return Array.from(this.checkouts.values())
      .filter((session) => session.subjectId === subjectId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, limit);
  }

  async updateBillingCheckoutStatus(id: string, status: BillingCheckoutStatus, updatedAt: string): Promise<void> {
    const existing = this.checkouts.get(id);
    if (!existing) {
      return;
    }

    this.checkouts.set(id, {
      ...existing,
      status,
      updatedAt
    });
  }

  async getBillingWebhookEvent(providerEventId: string): Promise<BillingWebhookEvent | null> {
    return this.billingEvents.get(providerEventId) || null;
  }

  async appendBillingWebhookEvent(event: BillingWebhookEvent): Promise<void> {
    if (this.billingEvents.has(event.providerEventId)) {
      return;
    }
    this.billingEvents.set(event.providerEventId, event);
  }

  async listBillingWebhookEvents(limit: number): Promise<BillingWebhookEvent[]> {
    const items = Array.from(this.billingEvents.values());
    return items.slice(-limit);
  }

  async getCleanupIdempotency(key: string): Promise<CleanupIdempotencyRecord | null> {
    const entry = this.idempotency.get(key);
    if (!entry) {
      return null;
    }

    if (entry.expiresAtMs <= Date.now()) {
      this.idempotency.delete(key);
      return null;
    }

    return entry.record;
  }

  async setCleanupIdempotency(key: string, record: CleanupIdempotencyRecord, ttlSeconds: number): Promise<void> {
    this.idempotency.set(key, {
      record,
      expiresAtMs: Date.now() + Math.max(1, ttlSeconds) * 1000
    });
  }

  async appendDeletionAudit(record: DeletionAuditRecord): Promise<void> {
    this.deletionAudit.push(record);
  }

  async listDeletionAudit(limit: number): Promise<DeletionAuditRecord[]> {
    if (limit <= 0) {
      return [];
    }
    const n = Math.min(limit, 1000);
    return this.deletionAudit.slice(-n);
  }

  async close(): Promise<void> {}
}

export function createJobRepository(config: ApiConfig): JobRepository {
  if (config.jobRepoDriver === "postgres") {
    if (!config.postgresUrl) {
      throw new ValidationError("POSTGRES_URL is required when JOB_REPO_DRIVER=postgres");
    }
    return new PostgresJobRepository({ connectionString: config.postgresUrl });
  }

  return new RedisJobRepository({ redisUrl: config.redisUrl });
}
