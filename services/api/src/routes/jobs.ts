import {
  applyQuota,
  defaultToolOptions,
  formatToExtension,
  formatToMime,
  inferOutputObjectKeyPrefix,
  isTool,
  mergeToolOptions,
  shouldApplyWatermarkForTool,
  toSafeSubjectId,
  toolOutputFormat,
  type ImageJobRecord,
  type ImageJobQueuePayload,
  type ImagePlan,
  type ImageTool,
  type QuotaWindow
} from "@image-ops/core";
import { ulid } from "ulid";
import { z } from "zod";
import type { Router } from "express";
import type { ApiConfig } from "../config";
import { asyncHandler } from "../lib/async-handler";
import { logInfo } from "../lib/log";
import type { JobQueueService } from "../services/queue";
import type { JobRepository } from "../services/job-repo";
import type { ObjectStorageService } from "../services/storage";

const planSchema = z.enum(["free", "pro", "team"]).default("free");

const jobsCreateSchema = z.object({
  subjectId: z.string().min(1),
  plan: planSchema.optional(),
  tool: z.string().min(1),
  inputObjectKey: z.string().min(1),
  options: z.record(z.any()).optional()
});

const jobIdParamSchema = z.object({
  id: z.string().min(1)
});

/**
 * Create a new quota window starting at the provided time with zero used count.
 *
 * @param now - The start time for the quota window
 * @returns A QuotaWindow with `windowStartAt` set to `now.toISOString()` and `usedCount` set to 0
 */
function newQuotaWindow(now: Date): QuotaWindow {
  return { windowStartAt: now.toISOString(), usedCount: 0 };
}

/**
 * Registers HTTP routes for creating and querying image processing jobs on the provided Express router.
 *
 * Exposes:
 * - POST /api/jobs: validate request, enforce plan quota, verify input object, determine formats/options,
 *   create a job record, enqueue work, and respond with job metadata and quota info.
 * - GET /api/jobs/:id: validate job id, return job details and a presigned download URL when the job is done.
 *
 * @param router - Express Router to attach the job routes to
 * @param deps - Dependency bag used by the routes
 * @param deps.config - API configuration (used for values like signed download TTL)
 * @param deps.storage - Object storage service for headObject and presigned URL generation
 * @param deps.queue - Job queue service used to enqueue work
 * @param deps.jobRepo - Repository for persisting and retrieving job and quota data
 * @param deps.now - Function returning the current Date (injected for testability)
 */
export function registerJobsRoutes(
  router: Router,
  deps: {
    config: ApiConfig;
    storage: ObjectStorageService;
    queue: JobQueueService;
    jobRepo: JobRepository;
    now: () => Date;
  }
): void {
 router.post("/api/jobs", asyncHandler(async (req, res) => {
    const parsed = jobsCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "INVALID_JOB_REQUEST", details: parsed.error.flatten() });
      return;
    }

    const payload = parsed.data;
    if (!isTool(payload.tool)) {
      res.status(400).json({ error: "UNSUPPORTED_TOOL", message: "Unsupported tool." });
      return;
    }

    const now = deps.now();
    const subjectId = toSafeSubjectId(payload.subjectId);
    const plan = (payload.plan || "free") as ImagePlan;
    const tool = payload.tool as ImageTool;

    const quotaWindow = (await deps.jobRepo.getQuotaWindow(subjectId)) || newQuotaWindow(now);
    const quotaResult = applyQuota(quotaWindow, 1, now);

    if (!quotaResult.allowed) {
      res.status(429).json({
        error: "FREE_PLAN_LIMIT_EXCEEDED",
        message: "Free plan allows 6 images per rolling 10 hours.",
        nextWindowStartAt: quotaResult.nextWindowStartAt
      });
      return;
    }

    await deps.jobRepo.setQuotaWindow(subjectId, quotaResult.window);

    const head = await deps.storage.headObject(payload.inputObjectKey);
    if (!head.exists) {
      res.status(404).json({ error: "INPUT_OBJECT_NOT_FOUND", message: "Input object key is missing or expired." });
      return;
    }

    if ((head.contentLength ?? 0) > deps.config.maxUploadBytes) {
      res.status(413).json({
        error: "FILE_TOO_LARGE",
        message: `Maximum upload size is  bytes.`
      });
      return;
    }

    if ((head.contentLength ?? 0) > deps.config.maxUploadBytes) {
      res.status(413).json({
        error: "FILE_TOO_LARGE",
        message: `Maximum upload size is  bytes.`
      });
      return;
    }

    const inputMime = (head.contentType || "image/jpeg").toLowerCase();
    const mergedOptions = mergeToolOptions(tool, payload.options as Record<string, unknown> | undefined);
    const outputFormat = toolOutputFormat(tool, inputMime, mergedOptions);
    const outputMime = formatToMime(outputFormat);

    const id = ulid();
    const outputObjectKey = `${inferOutputObjectKeyPrefix(subjectId, tool, now)}/${id}.${formatToExtension(outputFormat)}`;
    const watermarkRequired = shouldApplyWatermarkForTool(plan, tool);

    const job: ImageJobRecord = {
      id,
      subjectId,
      tool,
      plan,
      isAdvanced: tool === "background-remove",
      watermarkRequired,
      inputObjectKey: payload.inputObjectKey,
      outputObjectKey,
      inputMime,
      outputMime,
      options: mergedOptions,
      status: "queued",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };

    const queuePayload: ImageJobQueuePayload = {
      id: job.id,
      subjectId: job.subjectId,
      tool: job.tool,
      plan: job.plan,
      watermarkRequired: job.watermarkRequired,
      inputObjectKey: job.inputObjectKey,
      outputObjectKey,
      inputMime: job.inputMime,
      options: job.options
    };

    await deps.jobRepo.createJob(job);
    await deps.queue.enqueue(queuePayload);

    logInfo("job.enqueued", {
      jobId: job.id,
      subjectId: job.subjectId,
      tool: job.tool,
      status: job.status
    });

    res.status(201).json({
      id: job.id,
      status: job.status,
      watermarkRequired,
      outputMime,
      quota: {
        usedCount: quotaResult.window.usedCount,
        windowStartAt: quotaResult.window.windowStartAt
      },
      options: mergedOptions || defaultToolOptions(tool)
    });
 }));

 router.get("/api/jobs/:id", asyncHandler(async (req, res) => {
    const parsed = jobIdParamSchema.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: "INVALID_JOB_ID", details: parsed.error.flatten() });
      return;
    }

    const job = await deps.jobRepo.getJob(parsed.data.id);
    if (!job) {
      res.status(404).json({ error: "JOB_NOT_FOUND", message: "Job does not exist." });
      return;
    }

    let downloadUrl: string | null = null;
    let downloadUrlExpiresAt: string | null = null;

    if (job.status === "done" && job.outputObjectKey) {
      downloadUrl = await deps.storage.createPresignedDownloadUrl({
        objectKey: job.outputObjectKey,
        expiresInSeconds: deps.config.signedDownloadTtlSeconds
      });
      downloadUrlExpiresAt = new Date(deps.now().getTime() + deps.config.signedDownloadTtlSeconds * 1000).toISOString();
    }

    res.json({
      id: job.id,
      status: job.status,
      tool: job.tool,
      inputObjectKey: job.inputObjectKey,
      outputObjectKey: job.outputObjectKey || null,
      outputMime: job.outputMime || null,
      errorCode: job.errorCode || null,
      errorMessage: job.errorMessage || null,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      downloadUrl,
      downloadUrlExpiresAt
    });
 }));
}
