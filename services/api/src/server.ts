import cors from "cors";
import express from "express";
import { applyQuota, FREE_PLAN_LIMIT, FREE_PLAN_WINDOW_HOURS, type QuotaWindow } from "@image-ops/core";

const DEFAULT_MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 10 * 1024 * 1024);
const DEFAULT_TEMP_TTL_MINUTES = Number(process.env.TEMP_OBJECT_TTL_MINUTES || 30);

const ALLOWED_IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const ALLOWED_JOB_TOOLS = new Set(["resize", "compress", "remove-background", "convert"]);

type JobStatus = "queued" | "running" | "done" | "failed";

type TempUploadRecord = {
  key: string;
  token: string;
  subjectId: string;
  filename: string;
  mime: string;
  size: number;
  tool: string;
  createdAt: string;
  expiresAt: string;
};

type JobRecord = {
  id: string;
  subjectId: string;
  tool: string;
  inputObjectKey: string;
  options: Record<string, unknown>;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  outputObjectKey?: string;
  errorCode?: string;
};

type QueueItem = {
  jobId: string;
  enqueuedAt: string;
};

type DeletionReason = "page_exit" | "ttl_expiry" | "manual";
type DeletionResult = "success" | "not_found";

type DeletionAuditRecord = {
  id: string;
  objectKey: string;
  reason: DeletionReason;
  result: DeletionResult;
  deletedAt: string;
};

type CleanupResponse = {
  accepted: true;
  cleaned: number;
  notFound: number;
  expiredPurged: number;
  idempotencyKey: string;
};

type IdempotencyRecord = {
  requestSignature: string;
  status: number;
  response: CleanupResponse;
  createdAt: string;
};

type ApiState = {
  windows: Map<string, QuotaWindow>;
  tempUploads: Map<string, TempUploadRecord>;
  jobs: Map<string, JobRecord>;
  queue: QueueItem[];
  deletionAudit: DeletionAuditRecord[];
  cleanupIdempotency: Map<string, IdempotencyRecord>;
};

type CreateApiAppOptions = {
  now?: () => Date;
  state?: ApiState;
};

/**
 * Express error-handling middleware that logs the provided error and sends a standardized 500 JSON response.
 *
 * @param error - The error object or value caught by Express
 */
function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  const message = error instanceof Error ? error.message : "Internal server error";
  logError("api.error", { message });
  res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message });
}

/**
 * Create a fresh ApiState with all collections initialized empty.
 *
 * @returns An ApiState whose maps and arrays are initialized to empty containers:
 * - `windows`: empty Map of subject quota windows
 * - `tempUploads`: empty Map of temporary upload records
 * - `jobs`: empty Map of job records
 * - `queue`: empty array for queued items
 * - `deletionAudit`: empty array for deletion audit entries
 * - `cleanupIdempotency`: empty Map for cleanup idempotency records
 */
function createInitialState(): ApiState {
  return {
    windows: new Map<string, QuotaWindow>(),
    tempUploads: new Map<string, TempUploadRecord>(),
    jobs: new Map<string, JobRecord>(),
    queue: [],
    deletionAudit: [],
    cleanupIdempotency: new Map<string, IdempotencyRecord>()
  };

  return normalized.split(".").pop()?.toLowerCase() || "";
}

function createTempObjectKey(subjectId: string, filename: string, now: Date): string {
  const ext = fileExtension(filename);
  const suffix = ext ? `.${ext}` : "";
  return `tmp/${subjectId}/${now.getTime()}-${crypto.randomUUID()}${suffix}`;
}

function addDeletionAudit(
  state: ApiState,
  objectKey: string,
  reason: DeletionReason,
  result: DeletionResult,
  at: Date
): void {
  state.deletionAudit.push({
    id: `del_${crypto.randomUUID().replace(/-/g, "")}`,
    objectKey,
    reason,
    result,
    deletedAt: at.toISOString()
  });
}

function pruneExpired(state: ApiState, now: Date): number {
  let removed = 0;
  for (const [key, record] of state.tempUploads.entries()) {
    if (now > new Date(record.expiresAt)) {
      state.tempUploads.delete(key);
      removed += 1;
      addDeletionAudit(state, key, "ttl_expiry", "success", now);
    }
  }

  return removed;
}

function currentQuotaWindow(state: ApiState, subjectId: string, now: Date): QuotaWindow {
  return state.windows.get(subjectId) || { windowStartAt: now.toISOString(), usedCount: 0 };
}

function requireWorkerAuth(req: express.Request, res: express.Response): boolean {
  const token = req.header("x-worker-token") || "";
  if (!token || token !== workerToken()) {
    res.status(401).json({ error: "UNAUTHORIZED_WORKER", message: "Worker token is missing or invalid." });
    return false;
  }

  return true;
}

function normalizeObjectKeys(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const unique = new Set<string>();
  for (const item of value) {
    const key = String(item || "").trim();
    if (key) {
      unique.add(key);
    }
  }

  return [...unique].sort((a, b) => a.localeCompare(b));
}

function cleanupSignature(keys: string[]): string {
  return keys.join("|");
}

/**
 * Create and configure an Express application exposing the API endpoints and middleware for the service.
 *
 * @param options - Optional overrides for bootstrap behavior (e.g., custom in-memory state or a `now()` time provider).
 * @returns An Express application instance configured with routes, CORS, JSON parsing, and the service's API endpoints.
 */
export function createApiApp(options: CreateApiAppOptions = {}) {
  const now = options.now || (() => new Date());
  const state = options.state || createInitialState();
  const app = express();
  app.use(cors({ origin: deps.config.webOrigin }));
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    const purged = pruneExpired(state, now());
    res.json({
      status: "ok",
      tempUploads: state.tempUploads.size,
      jobs: state.jobs.size,
      queueDepth: state.queue.length,
      deletionAuditCount: state.deletionAudit.length,
      purged
    });
  });

  app.get("/api/quota/:subjectId", (req, res) => {
    const subjectId = sanitizeSubjectId(String(req.params.subjectId || "anonymous"));
    const currentNow = now();
    pruneExpired(state, currentNow);
    const window = currentQuotaWindow(state, subjectId, currentNow);

    res.json({
      subjectId,
      limit: FREE_PLAN_LIMIT,
      windowHours: FREE_PLAN_WINDOW_HOURS,
      usedCount: window.usedCount,
      windowStartAt: window.windowStartAt
    });
  });

  app.get("/api/quota", (req, res) => {
    const subjectRaw = String(req.query.subjectId || "");
    if (!subjectRaw) {
      res.status(400).json({ error: "SUBJECT_ID_REQUIRED", message: "subjectId query param is required." });
      return;
    }

    const subjectId = sanitizeSubjectId(subjectRaw);
    const currentNow = now();
    pruneExpired(state, currentNow);
    const window = currentQuotaWindow(state, subjectId, currentNow);

    res.json({
      subjectId,
      limit: FREE_PLAN_LIMIT,
      windowHours: FREE_PLAN_WINDOW_HOURS,
      usedCount: window.usedCount,
      windowStartAt: window.windowStartAt
    });
  });

  app.post("/api/quota/check", (req, res) => {
    const currentNow = now();
    pruneExpired(state, currentNow);

    const subjectId = sanitizeSubjectId(String(req.body.subjectId || "anonymous"));
    const requestedImages = Number(req.body.requestedImages || 1);
    const existing = currentQuotaWindow(state, subjectId, currentNow);
    const result = applyQuota(existing, requestedImages, currentNow);

    if (!result.allowed) {
      return res.status(429).json({
        error: "FREE_PLAN_LIMIT_EXCEEDED",
        message: `Free plan allows ${FREE_PLAN_LIMIT} images per ${FREE_PLAN_WINDOW_HOURS} hours.`,
        nextWindowStartAt: result.nextWindowStartAt
      });
    }

    state.windows.set(subjectId, result.window);
    return res.json({ allowed: true, window: result.window });
  });

  app.post("/api/uploads/init", (req, res) => {
    const currentNow = now();
    pruneExpired(state, currentNow);

    const subjectId = sanitizeSubjectId(String(req.body.subjectId || "anonymous"));
    const filename = String(req.body.filename || "").trim();
    const mime = String(req.body.mime || "").toLowerCase();
    const size = Number(req.body.size || 0);
    const tool = String(req.body.tool || "").trim();

    if (!filename || !mime || !tool || !Number.isFinite(size) || size <= 0) {
      res.status(400).json({
        error: "INVALID_UPLOAD_REQUEST",
        message: "filename, mime, size, and tool are required."
      });
      return;
    }

    if (!ALLOWED_IMAGE_MIME.has(mime)) {
      res.status(400).json({
        error: "UNSUPPORTED_MIME",
        message: "Only supported image formats are allowed."
      });
      return;
    }

    if (size > DEFAULT_MAX_UPLOAD_BYTES) {
      res.status(413).json({
        error: "FILE_TOO_LARGE",
        message: `Max upload size is ${DEFAULT_MAX_UPLOAD_BYTES} bytes.`
      });
      return;
    }

    const existing = currentQuotaWindow(state, subjectId, currentNow);
    const quota = applyQuota(existing, 1, currentNow);

    if (!quota.allowed) {
      res.status(429).json({
        error: "FREE_PLAN_LIMIT_EXCEEDED",
        message: `Free plan allows ${FREE_PLAN_LIMIT} images per ${FREE_PLAN_WINDOW_HOURS} hours.`,
        nextWindowStartAt: quota.nextWindowStartAt
      });
      return;
    }

    state.windows.set(subjectId, quota.window);

    const key = createTempObjectKey(subjectId, filename, currentNow);
    const token = crypto.randomBytes(16).toString("hex");
    const expiresAt = new Date(currentNow.getTime() + DEFAULT_TEMP_TTL_MINUTES * 60 * 1000).toISOString();
    const uploadBase = process.env.UPLOAD_BASE_URL || "https://temp-upload.image-ops.local";

    state.tempUploads.set(key, {
      key,
      token,
      subjectId,
      filename,
      mime,
      size,
      tool,
      createdAt: currentNow.toISOString(),
      expiresAt
    });

    res.status(201).json({
      objectKey: key,
      uploadUrl: `${uploadBase}/upload/${encodeURIComponent(key)}?token=${token}`,
      expiresAt,
      quota: {
        subjectId,
        usedCount: quota.window.usedCount,
        limit: FREE_PLAN_LIMIT,
        windowHours: FREE_PLAN_WINDOW_HOURS,
        windowStartAt: quota.window.windowStartAt
      },
      privacy: {
        imageStoredInDatabase: false,
        tempStorageOnly: true
      }
    });
  });

  registerUploadsRoutes(app, { config: deps.config, storage: deps.storage, now: deps.now });
  registerJobsRoutes(app, {
    config: deps.config,
    storage: deps.storage,
    queue: deps.queue,
    jobRepo: deps.jobRepo,
    now: deps.now
  });

  app.get("/api/jobs/:id", (req, res) => {
    const id = String(req.params.id || "").trim();
    const job = state.jobs.get(id);

    if (!job) {
      res.status(404).json({
        error: "JOB_NOT_FOUND",
        message: "Job does not exist."
      });
      return;
    }

    const queueIndex = state.queue.findIndex((item) => item.jobId === id);
    const queuePosition = job.status === "queued" && queueIndex >= 0 ? queueIndex + 1 : null;

    res.json({
      id: job.id,
      status: job.status,
      tool: job.tool,
      inputObjectKey: job.inputObjectKey,
      outputObjectKey: job.outputObjectKey || null,
      errorCode: job.errorCode || null,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      queuePosition
    });
  });

  app.post("/api/internal/queue/claim", (req, res) => {
    if (!requireWorkerAuth(req, res)) {
      return;
    }

    const currentNow = now();
    pruneExpired(state, currentNow);

    while (state.queue.length > 0) {
      const item = state.queue.shift();
      if (!item) {
        break;
      }

      const job = state.jobs.get(item.jobId);
      if (!job || job.status !== "queued") {
        continue;
      }

      job.status = "running";
      job.updatedAt = currentNow.toISOString();
      state.jobs.set(job.id, job);

      res.json({
        claimed: true,
        job: {
          id: job.id,
          subjectId: job.subjectId,
          tool: job.tool,
          inputObjectKey: job.inputObjectKey,
          options: job.options,
          status: job.status,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt
        }
      });
      return;
    }

    res.json({ claimed: false });
  });

  app.post("/api/internal/jobs/:id/complete", (req, res) => {
    if (!requireWorkerAuth(req, res)) {
      return;
    }

    const id = String(req.params.id || "").trim();
    const job = state.jobs.get(id);
    if (!job) {
      res.status(404).json({ error: "JOB_NOT_FOUND", message: "Job does not exist." });
      return;
    }

    if (job.status !== "running") {
      res.status(409).json({ error: "JOB_NOT_RUNNING", message: "Only running jobs can be completed." });
      return;
    }

    const success = Boolean(req.body.success);
    const outputObjectKey = String(req.body.outputObjectKey || "").trim();
    const errorCode = String(req.body.errorCode || "").trim();
    const currentNow = now();

    if (success) {
      if (!outputObjectKey) {
        res.status(400).json({
          error: "OUTPUT_KEY_REQUIRED",
          message: "outputObjectKey is required when marking job success."
        });
        return;
      }
      job.status = "done";
      job.outputObjectKey = outputObjectKey;
      job.errorCode = undefined;
    } else {
      if (!errorCode) {
        res.status(400).json({
          error: "ERROR_CODE_REQUIRED",
          message: "errorCode is required when marking job failure."
        });
        return;
      }
      job.status = "failed";
      job.outputObjectKey = undefined;
      job.errorCode = errorCode;
    }

    job.updatedAt = currentNow.toISOString();
    state.jobs.set(job.id, job);

    res.json({
      id: job.id,
      status: job.status,
      outputObjectKey: job.outputObjectKey || null,
      errorCode: job.errorCode || null,
      updatedAt: job.updatedAt
    });
  });

  app.post("/api/internal/temp/sweep", (req, res) => {
    if (!requireWorkerAuth(req, res)) {
      return;
    }

    const currentNow = now();
    const swept = pruneExpired(state, currentNow);
    res.json({
      swept,
      deletionAuditCount: state.deletionAudit.length,
      at: currentNow.toISOString()
    });
  });

  app.get("/api/internal/deletion-audit", (req, res) => {
    if (!requireWorkerAuth(req, res)) {
      return;
    }

    const limitRaw = Number(req.query.limit || 20);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, limitRaw)) : 20;
    const items = state.deletionAudit.slice(-limit);

    res.json({
      count: state.deletionAudit.length,
      items
    });
  });

  app.post("/api/cleanup", (req, res) => {
    const idempotencyKey = String(req.header("idempotency-key") || "").trim();
    if (!idempotencyKey) {
      res.status(400).json({
        error: "IDEMPOTENCY_KEY_REQUIRED",
        message: "idempotency-key header is required."
      });
      return;
    }

    const keys = normalizeObjectKeys(req.body.objectKeys);
    const signature = cleanupSignature(keys);

    const existing = state.cleanupIdempotency.get(idempotencyKey);
    if (existing) {
      if (existing.requestSignature !== signature) {
        res.status(409).json({
          error: "IDEMPOTENCY_KEY_CONFLICT",
          message: "idempotency-key has already been used with different objectKeys."
        });
        return;
      }

      res.setHeader("x-idempotent-replay", "true");
      res.status(existing.status).json(existing.response);
      return;
    }

    const currentNow = now();
    const expiredPurged = pruneExpired(state, currentNow);
    let cleaned = 0;
    let notFound = 0;

    for (const key of keys) {
      if (state.tempUploads.delete(key)) {
        cleaned += 1;
        addDeletionAudit(state, key, "page_exit", "success", currentNow);
      } else {
        notFound += 1;
        addDeletionAudit(state, key, "page_exit", "not_found", currentNow);
      }
    }

    const response: CleanupResponse = {
      accepted: true,
      cleaned,
      notFound,
      expiredPurged,
      idempotencyKey
    };

    state.cleanupIdempotency.set(idempotencyKey, {
      requestSignature: signature,
      status: 202,
      response,
      createdAt: currentNow.toISOString()
    });

    res.status(202).json(response);
  });
  registerQuotaRoutes(app, { jobRepo: deps.jobRepo, now: deps.now });

  app.use(errorHandler);
  return app;
}

if (require.main === module) {
  const config = loadApiConfig();
  const app = createApiApp({ config });
  app.listen(config.port, () => {
    logInfo("api.started", { port: config.port });
  });
}
