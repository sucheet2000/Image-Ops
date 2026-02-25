import {
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
  type ImageTool
} from "@imageops/core";
import { ulid } from "ulid";
import { z } from "zod";
import type { Router } from "express";
import type { ApiConfig } from "../config";
import { asyncHandler } from "../lib/async-handler";
import { logError, logInfo } from "../lib/log";
import { quotaPolicyForPlan } from "../lib/quota-policy";
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
    const profile = await deps.jobRepo.getSubjectProfile(subjectId);
    const plan = (profile?.plan || "free") as ImagePlan;
    const tool = payload.tool as ImageTool;

    const completion = await deps.jobRepo.getUploadCompletion(payload.inputObjectKey);
    if (!completion) {
      res.status(409).json({
        error: "UPLOAD_NOT_COMPLETED",
        message: "Call POST /api/uploads/complete before creating a job."
      });
      return;
    }

    const canonicalInputObjectKey = completion.canonicalObjectKey;
    const head = await deps.storage.headObject(canonicalInputObjectKey);
    if (!head.exists) {
      res.status(404).json({ error: "INPUT_OBJECT_NOT_FOUND", message: "Input object key is missing or expired." });
      return;
    }

    if ((head.contentLength ?? completion.sizeBytes) > deps.config.maxUploadBytes) {
      res.status(413).json({
        error: "FILE_TOO_LARGE",
        message: `Maximum upload size is ${deps.config.maxUploadBytes} bytes.`
      });
      return;
    }

    const inputMimeRaw = (head.contentType || completion.contentType || "").toLowerCase().trim();
    if (!inputMimeRaw) {
      res.status(422).json({
        error: "INPUT_MIME_UNKNOWN",
        message: "Unable to determine input MIME type for this upload."
      });
      return;
    }
    const inputMime = inputMimeRaw;
    const mergedOptions = mergeToolOptions(tool, payload.options as Record<string, unknown> | undefined);
    const outputFormat = toolOutputFormat(tool, inputMime, mergedOptions);
    const outputMime = formatToMime(outputFormat);

    const id = ulid(now.getTime());
    const outputObjectKey = `${inferOutputObjectKeyPrefix(subjectId, tool, now)}/${id}.${formatToExtension(outputFormat)}`;
    const watermarkRequired = shouldApplyWatermarkForTool(plan, tool);
    const quotaPolicy = quotaPolicyForPlan(deps.config, plan);

    const job: ImageJobRecord = {
      id,
      subjectId,
      tool,
      plan,
      isAdvanced: tool === "background-remove",
      watermarkRequired,
      inputObjectKey: canonicalInputObjectKey,
      outputObjectKey,
      inputMime,
      outputMime,
      options: mergedOptions,
      status: "queued",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };

    const quotaResult = await deps.jobRepo.reserveQuotaAndCreateJob({
      subjectId,
      requestedImages: 1,
      now,
      job,
      quotaLimit: quotaPolicy.limit,
      quotaWindowHours: quotaPolicy.windowHours
    });

    if (!quotaResult.allowed) {
      res.status(429).json({
        error: "PLAN_LIMIT_EXCEEDED",
        message: `${plan} plan allows ${quotaPolicy.limit} images per rolling ${quotaPolicy.windowHours} hours.`,
        plan,
        limit: quotaPolicy.limit,
        windowHours: quotaPolicy.windowHours,
        nextWindowStartAt: quotaResult.nextWindowStartAt
      });
      return;
    }

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

    try {
      await deps.queue.enqueue(queuePayload);
    } catch (error) {
      const enqueueErrorMessage = error instanceof Error ? error.message : String(error);
      await deps.jobRepo.updateJobStatus({
        id: job.id,
        status: "failed",
        errorCode: "QUEUE_ENQUEUE_FAILED",
        errorMessage: enqueueErrorMessage,
        updatedAt: deps.now().toISOString()
      });
      logError("job.enqueue.failed", {
        jobId: job.id,
        subjectId: job.subjectId,
        error: enqueueErrorMessage
      });
      throw error;
    }

    logInfo("job.enqueued", {
      jobId: job.id,
      subjectId: job.subjectId,
      tool: job.tool,
      status: job.status,
      deduplicatedInput: completion.deduplicated
    });

    res.status(201).json({
      id: job.id,
      status: job.status,
      inputObjectKey: job.inputObjectKey,
      watermarkRequired,
      outputMime,
      quota: {
        plan,
        limit: quotaPolicy.limit,
        windowHours: quotaPolicy.windowHours,
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
