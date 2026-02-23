import cors from "cors";
import express from "express";
import { applyQuota, FREE_PLAN_LIMIT, FREE_PLAN_WINDOW_HOURS, type QuotaWindow } from "@image-ops/core";

const app = express();
const port = Number(process.env.API_PORT || 4000);

app.use(cors({ origin: process.env.WEB_ORIGIN || "http://localhost:3000" }));
app.use(express.json());

const windows = new Map<string, QuotaWindow>();

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/quota/:subjectId", (req, res) => {
  const { subjectId } = req.params;
  const window = windows.get(subjectId) || { windowStartAt: new Date().toISOString(), usedCount: 0 };

  res.json({
    subjectId,
    limit: FREE_PLAN_LIMIT,
    windowHours: FREE_PLAN_WINDOW_HOURS,
    usedCount: window.usedCount,
    windowStartAt: window.windowStartAt
  });
});

app.get("/api/quota", (req, res) => {
  const subjectId = String(req.query.subjectId || "");
  if (!subjectId) {
    res.status(400).json({ error: "SUBJECT_ID_REQUIRED", message: "subjectId query param is required." });
    return;
  }

  const window = windows.get(subjectId) || { windowStartAt: new Date().toISOString(), usedCount: 0 };
  res.json({
    subjectId,
    limit: FREE_PLAN_LIMIT,
    windowHours: FREE_PLAN_WINDOW_HOURS,
    usedCount: window.usedCount,
    windowStartAt: window.windowStartAt
  });
});

app.post("/api/quota/check", (req, res) => {
  const subjectId = String(req.body.subjectId || "anonymous");
  const requestedImages = Number(req.body.requestedImages || 1);

  const existing = windows.get(subjectId) || { windowStartAt: new Date().toISOString(), usedCount: 0 };
  const result = applyQuota(existing, requestedImages, new Date());

  if (!result.allowed) {
    return res.status(429).json({
      error: "FREE_PLAN_LIMIT_EXCEEDED",
      message: `Free plan allows ${FREE_PLAN_LIMIT} images per ${FREE_PLAN_WINDOW_HOURS} hours.`,
      nextWindowStartAt: result.nextWindowStartAt
    });
  }

  windows.set(subjectId, result.window);
  return res.json({ allowed: true, window: result.window });
});

app.post("/api/cleanup", (req, res) => {
  const keys = Array.isArray(req.body.objectKeys) ? req.body.objectKeys : [];
  // Placeholder for object-store deletion + deletion audit insert.
  res.status(202).json({ accepted: true, cleaned: keys.length });
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Image Ops API listening on http://localhost:${port}`);
});
