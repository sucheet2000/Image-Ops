import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import {
  inferUploadObjectKeyPrefix,
  isTool,
  toSafeSubjectId,
  type DedupObjectRecord,
  type ImageTool,
  type UploadCompletionRecord
} from "@image-ops/core";
import { ulid } from "ulid";
import { z } from "zod";
import type { Router } from "express";
import type { ApiConfig } from "../config";
import { asyncHandler } from "../lib/async-handler";
import type { JobRepository } from "../services/job-repo";
import type { ObjectStorageService } from "../services/storage";

const SUPPORTED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

const uploadInitSchema = z.object({
  subjectId: z.string().min(1),
  tool: z.string().min(1),
  filename: z.string().min(1),
  mime: z.string().min(1),
  size: z.number().int().positive()
});

const uploadCompleteSchema = z.object({
  subjectId: z.string().min(1),
  objectKey: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i).optional()
});

function mimeToDefaultExtension(mime: string): string {
  if (mime.includes("png")) {
    return "png";
  }
  if (mime.includes("webp")) {
    return "webp";
  }
  return "jpg";
}

function selectExtension(filename: string, mime: string): string {
  const normalized = filename.trim();
  if (normalized.includes(".")) {
    const ext = normalized.split(".").pop()?.toLowerCase();
    if (ext && ["jpg", "jpeg", "png", "webp"].includes(ext)) {
      return ext === "jpeg" ? "jpg" : ext;
    }
  }

  return mimeToDefaultExtension(mime);
}

async function sha256HexStreaming(bytes: Buffer): Promise<string> {
  const hasher = createHash("sha256");
  for await (const chunk of Readable.from(bytes)) {
    hasher.update(chunk as Buffer);
  }
  return hasher.digest("hex");
}

function buffersEqualByteByByte(left: Buffer, right: Buffer): boolean {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

function isStorageNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const statusCode = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
  if (error.name === "NotFound" || statusCode === 404) {
    return true;
  }

  return /not found/i.test(error.message);
}

export function registerUploadsRoutes(
  router: Router,
  deps: { config: ApiConfig; storage: ObjectStorageService; jobRepo: JobRepository; now: () => Date }
): void {
  router.post("/api/uploads/init", asyncHandler(async (req, res) => {
    const parsed = uploadInitSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "INVALID_UPLOAD_REQUEST", details: parsed.error.flatten() });
      return;
    }

    const payload = parsed.data;
    const safeSubjectId = toSafeSubjectId(payload.subjectId);
    const mime = payload.mime.toLowerCase();

    if (!SUPPORTED_MIME.has(mime)) {
      res.status(400).json({ error: "UNSUPPORTED_MIME", message: "Supported MIME types: image/jpeg, image/png, image/webp" });
      return;
    }

    if (payload.size > deps.config.maxUploadBytes) {
      res.status(413).json({ error: "FILE_TOO_LARGE", message: `Maximum upload size is ${deps.config.maxUploadBytes} bytes.` });
      return;
    }

    if (!isTool(payload.tool)) {
      res.status(400).json({ error: "INVALID_TOOL", message: "Unsupported tool value." });
      return;
    }

    const tool = payload.tool as ImageTool;
    const prefix = inferUploadObjectKeyPrefix(safeSubjectId, tool, deps.now());
    const extension = selectExtension(payload.filename, mime);
    const objectKey = `${prefix}/${ulid(deps.now().getTime())}.${extension}`;

    const uploadUrl = await deps.storage.createPresignedUploadUrl({
      objectKey,
      contentType: mime,
      expiresInSeconds: deps.config.signedUploadTtlSeconds,
      maxSizeBytes: deps.config.maxUploadBytes
    });

    const expiresAt = new Date(deps.now().getTime() + deps.config.signedUploadTtlSeconds * 1000).toISOString();

    res.status(201).json({
      objectKey,
      uploadUrl,
      expiresAt,
      tempStorageOnly: true,
      imageStoredInDatabase: false
    });
  }));

  router.post("/api/uploads/complete", asyncHandler(async (req, res) => {
    const parsed = uploadCompleteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "INVALID_UPLOAD_COMPLETE_REQUEST", details: parsed.error.flatten() });
      return;
    }

    const payload = parsed.data;
    const safeSubjectId = toSafeSubjectId(payload.subjectId);
    const subjectUploadPrefix = `tmp/${safeSubjectId}/input/`;
    if (!payload.objectKey.startsWith(subjectUploadPrefix)) {
      res.status(400).json({ error: "INVALID_OBJECT_KEY", message: "Object key does not match subject upload prefix." });
      return;
    }

    const head = await deps.storage.headObject(payload.objectKey);
    if (!head.exists) {
      res.status(404).json({ error: "INPUT_OBJECT_NOT_FOUND", message: "Input object key is missing or expired." });
      return;
    }

    let object: { bytes: Buffer; contentType: string };
    try {
      object = await deps.storage.getObjectBuffer(payload.objectKey);
    } catch (error) {
      if (isStorageNotFoundError(error)) {
        res.status(404).json({ error: "INPUT_OBJECT_NOT_FOUND", message: "Input object key is missing or expired." });
        return;
      }
      throw error;
    }
    if (object.bytes.length > deps.config.maxUploadBytes) {
      res.status(413).json({
        error: "FILE_TOO_LARGE",
        message: `Maximum upload size is ${deps.config.maxUploadBytes} bytes.`
      });
      return;
    }

    const sha256 = await sha256HexStreaming(object.bytes);
    if (payload.sha256 && payload.sha256.toLowerCase() !== sha256) {
      res.status(400).json({ error: "SHA256_MISMATCH", message: "Provided sha256 does not match uploaded bytes." });
      return;
    }

    const candidates = await deps.jobRepo.listDedupByHash(sha256);

    let canonicalObjectKey = payload.objectKey;
    let deduplicated = false;

    for (const candidate of candidates) {
      if (
        !candidate.objectKey.startsWith(subjectUploadPrefix)
        || candidate.objectKey === payload.objectKey
        || candidate.sizeBytes !== object.bytes.length
      ) {
        continue;
      }

      try {
        const existing = await deps.storage.getObjectBuffer(candidate.objectKey);
        if (buffersEqualByteByByte(existing.bytes, object.bytes)) {
          canonicalObjectKey = candidate.objectKey;
          deduplicated = true;
          break;
        }
      } catch {
        // Ignore missing/expired candidate objects; dedup index can contain stale keys.
      }
    }

    const nowIso = deps.now().toISOString();

    const completion: UploadCompletionRecord = {
      objectKey: payload.objectKey,
      canonicalObjectKey,
      subjectId: safeSubjectId,
      sha256,
      sizeBytes: object.bytes.length,
      contentType: object.contentType,
      deduplicated,
      createdAt: nowIso
    };

    const dedupRecord: DedupObjectRecord = {
      sha256,
      objectKey: canonicalObjectKey,
      sizeBytes: object.bytes.length,
      contentType: object.contentType,
      createdAt: nowIso
    };

    await deps.jobRepo.finalizeUploadCompletion({ completion, dedupRecord });

    if (deduplicated && canonicalObjectKey !== payload.objectKey) {
      await deps.storage.deleteObjects([payload.objectKey]);
    }

    res.status(200).json({
      objectKey: payload.objectKey,
      canonicalObjectKey,
      sha256,
      sizeBytes: object.bytes.length,
      contentType: object.contentType,
      deduplicated
    });
  }));
}
