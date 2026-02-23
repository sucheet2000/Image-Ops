import {
  classifyProcessingError,
  toStructuredLog,
  type DeletionAuditRecord,
  type ImageJobQueuePayload
} from "@image-ops/core";
import { ulid } from "ulid";
import type { BackgroundRemoveProvider } from "./providers/bg-remove-provider";
import type { WorkerJobRepository } from "./services/job-repo";
import type { WorkerStorageService } from "./services/storage";
import { runBackgroundRemove } from "./tools/background-remove";
import { runCompress } from "./tools/compress";
import { runConvert } from "./tools/convert";
import { runResize } from "./tools/resize";
import { applyWatermark } from "./tools/watermark";

export type ProcessorDependencies = {
  storage: WorkerStorageService;
  jobRepo: WorkerJobRepository;
  bgRemoveProvider: BackgroundRemoveProvider;
  now: () => Date;
};

/**
 * Emit a structured log for an event to the console.
 *
 * @param event - A short event name to include in the structured log
 * @param payload - Arbitrary key-value data to attach to the log entry
 */
function log(event: string, payload: Record<string, unknown>): void {
  // eslint-disable-next-line no-console
  console.log(toStructuredLog(event, payload));
}

/**
 * Transform image bytes according to the job payload's specified tool.
 *
 * @param payload - Job payload that specifies the transformation `tool` ("resize", "compress", or "convert") and any tool-specific `options`.
 * @param inputBytes - Raw input image bytes to be transformed.
 * @returns An object with `bytes` containing the transformed image data and `contentType` indicating the output MIME type.
 * @throws Error if `payload.tool` is "background-remove" (requires provider context) or otherwise unsupported.
 */
async function transform(payload: ImageJobQueuePayload, inputBytes: Buffer): Promise<{ bytes: Buffer; contentType: string }> {
  if (payload.tool === "resize") {
    return runResize({
      bytes: inputBytes,
      contentType: payload.inputMime,
      options: payload.options as never
    });
  }

  if (payload.tool === "compress") {
    return runCompress({
      bytes: inputBytes,
      contentType: payload.inputMime,
      options: payload.options as never
    });
  }

  if (payload.tool === "convert") {
    return runConvert({
      bytes: inputBytes,
      options: payload.options as never
    });
  }

  throw new Error("background-remove transform needs provider context");
}

/**
 * Process a single image job from the queue: perform the requested transform (including background removal), optionally apply a watermark, persist the output, remove the original input, record a deletion audit, and update job status throughout.
 *
 * @param payload - Image job payload containing job id, subject id, input/output object keys, tool name, transform options, and watermark flag
 * @param deps - Runtime dependencies: `storage` for object I/O, `jobRepo` for updating job status and recording audits, `bgRemoveProvider` for background-removal operations, and `now` for timestamps
 * @throws The original processing error after it has been classified and the job status has been updated to `"failed"`
 */
export async function processImageJob(payload: ImageJobQueuePayload, deps: ProcessorDependencies): Promise<void> {
  const nowIso = deps.now().toISOString();

  await deps.jobRepo.updateJobStatus({
    id: payload.id,
    status: "running",
    updatedAt: nowIso
  });

  log("worker.job.running", { jobId: payload.id, tool: payload.tool, subjectId: payload.subjectId });

  try {
    const input = await deps.storage.getObjectBuffer(payload.inputObjectKey);

    let transformed: { bytes: Buffer; contentType: string };
    if (payload.tool === "background-remove") {
      transformed = await runBackgroundRemove({
        bytes: input.bytes,
        contentType: input.contentType,
        options: payload.options as never,
        provider: deps.bgRemoveProvider
      });
    } else {
      transformed = await transform(payload, input.bytes);
    }

    if (payload.watermarkRequired) {
      transformed = await applyWatermark({
        bytes: transformed.bytes,
        contentType: transformed.contentType
      });
    }

    await deps.storage.putObjectBuffer({
      objectKey: payload.outputObjectKey,
      bytes: transformed.bytes,
      contentType: transformed.contentType
    });

    await deps.jobRepo.updateJobStatus({
      id: payload.id,
      status: "done",
      outputObjectKey: payload.outputObjectKey,
      outputMime: transformed.contentType,
      updatedAt: deps.now().toISOString()
    });

    await deps.storage.deleteObject(payload.inputObjectKey);

    const deletionAudit: DeletionAuditRecord = {
      id: ulid(),
      objectKey: payload.inputObjectKey,
      reason: "delivered",
      result: "success",
      createdAt: deps.now().toISOString()
    };
    await deps.jobRepo.appendDeletionAudit(deletionAudit);

    log("worker.job.done", {
      jobId: payload.id,
      outputObjectKey: payload.outputObjectKey,
      outputMime: transformed.contentType
    });
  } catch (error) {
    const classified = classifyProcessingError(error);

    await deps.jobRepo.updateJobStatus({
      id: payload.id,
      status: "failed",
      errorCode: classified.code,
      errorMessage: classified.message,
      updatedAt: deps.now().toISOString()
    });

    log("worker.job.failed", {
      jobId: payload.id,
      code: classified.code,
      message: classified.message
    });

    throw error;
  }
}
