import crypto from "node:crypto";
import cors from "cors";
import express from "express";
import { applyQuota, FREE_PLAN_LIMIT, FREE_PLAN_WINDOW_HOURS, type QuotaWindow } from "@image-ops/core";

const DEFAULT_MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 10 * 1024 * 1024);
const DEFAULT_TEMP_TTL_MINUTES = Number(process.env.TEMP_OBJECT_TTL_MINUTES || 30);

const ALLOWED_IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

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

type ApiState = {
  windows: Map<string, QuotaWindow>;
  tempUploads: Map<string, TempUploadRecord>;
};

type CreateApiAppOptions = {
  now?: () => Date;
  state?: ApiState;
};

function createInitialState(): ApiState {
  return {
    windows: new Map<string, QuotaWindow>(),
    tempUploads: new Map<string, TempUploadRecord>()
  };
}

function sanitizeSubjectId(value: string): string {
  const sanitized = value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
  return sanitized || "anonymous";
}

function fileExtension(filename: string): string {
  const normalized = filename.trim();
  if (!normalized.includes(".")) {
    return "";
  }

  return normalized.split(".").pop()?.toLowerCase() || "";
}

function createTempObjectKey(subjectId: string, filename: string, now: Date): string {
  const ext = fileExtension(filename);
  const suffix = ext ? `.${ext}` : "";
  return `tmp/${subjectId}/${now.getTime()}-${crypto.randomUUID()}${suffix}`;
}

function pruneExpired(state: ApiState, now: Date): number {
  let removed = 0;
  for (const [key, record] of state.tempUploads.entries()) {
    if (now > new Date(record.expiresAt)) {
      state.tempUploads.delete(key);
      removed += 1;
    }
  }

  return removed;
}

function currentQuotaWindow(state: ApiState, subjectId: string, now: Date): QuotaWindow {
  return state.windows.get(subjectId) || { windowStartAt: now.toISOString(), usedCount: 0 };
}

export function createApiApp(options: CreateApiAppOptions = {}) {
  const now = options.now || (() => new Date());
  const state = options.state || createInitialState();
  const app = express();

  app.use(cors({ origin: process.env.WEB_ORIGIN || "http://localhost:3000" }));
  app.use(express.json());

  app.get("/health", (_req, res) => {
    const purged = pruneExpired(state, now());
    res.json({ status: "ok", tempUploads: state.tempUploads.size, purged });
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

  app.post("/api/cleanup", (req, res) => {
    const currentNow = now();
    const expiredPurged = pruneExpired(state, currentNow);

    const keys = Array.isArray(req.body.objectKeys) ? req.body.objectKeys.map((key) => String(key)) : [];
    let cleaned = 0;

    for (const key of keys) {
      if (state.tempUploads.delete(key)) {
        cleaned += 1;
      }
    }

    res.status(202).json({ accepted: true, cleaned, expiredPurged });
  });

  return app;
}

if (require.main === module) {
  const port = Number(process.env.API_PORT || 4000);
  const app = createApiApp();
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Image Ops API listening on http://localhost:${port}`);
  });
}
