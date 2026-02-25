import { createHash } from "node:crypto";
import {
  inferUploadObjectKeyPrefix,
  isTool,
  toSafeSubjectId,
  type DedupObjectRecord,
  type ImageTool,
  type UploadCompletionRecord
} from "@imageops/core";
import { ulid } from "ulid";
import { z } from "zod";
import type { Router } from "express";
import type { ApiConfig } from "../config";
import { asyncHandler } from "../lib/async-handler";
import { logError } from "../lib/log";
import type { JobRepository } from "../services/job-repo";
import type { MalwareScanService } from "../services/malware-scan";
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
  return createHash("sha256").update(bytes).digest("hex");
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

function detectMimeFromBytes(bytes: Buffer): string | null {
  if (
    bytes.length >= 8
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
    && bytes[4] === 0x0d
    && bytes[5] === 0x0a
    && bytes[6] === 0x1a
    && bytes[7] === 0x0a
  ) {
    return "image/png";
  }

  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  if (
    bytes.length >= 12
    && bytes[0] === 0x52 // R
    && bytes[1] === 0x49 // I
    && bytes[2] === 0x46 // F
    && bytes[3] === 0x46 // F
    && bytes[8] === 0x57 // W
    && bytes[9] === 0x45 // E
    && bytes[10] === 0x42 // B
    && bytes[11] === 0x50 // P
  ) {
    return "image/webp";
  }

  return null;
}

function parseUploadObjectKeyForSubject(subjectId: string, objectKey: string): {
  year: number;
  month: number;
  day: number;
  tool: ImageTool;
  filename: string;
} | null {
  const segments = objectKey.split("/");
  if (segments.length !== 8) {
    return null;
  }

  const [tmp, keySubjectId, scope, yyyyRaw, mmRaw, ddRaw, toolRaw, filename] = segments;
  if (tmp !== "tmp" || keySubjectId !== subjectId || scope !== "input" || !filename) {
    return null;
  }
  if (!/^\d{4}$/.test(yyyyRaw) || !/^\d{2}$/.test(mmRaw) || !/^\d{2}$/.test(ddRaw)) {
    return null;
  }
  if (!isTool(toolRaw)) {
    return null;
  }
  if (!/^[^/]+\.[a-z0-9]+$/i.test(filename)) {
    return null;
  }

  const year = Number.parseInt(yyyyRaw, 10);
  const month = Number.parseInt(mmRaw, 10);
  const day = Number.parseInt(ddRaw, 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  return {
    year,
    month,
    day,
    tool: toolRaw,
    filename
  };
}

export function registerUploadsRoutes(
  router: Router,
  deps: {
    config: ApiConfig;
    storage: ObjectStorageService;
    jobRepo: JobRepository;
    malwareScan: MalwareScanService;
    now: () => Date;
  }
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

    const presignedUpload = await deps.storage.createPresignedUploadUrl({
      objectKey,
      contentType: mime,
      expiresInSeconds: deps.config.signedUploadTtlSeconds,
      maxSizeBytes: deps.config.maxUploadBytes
    });

    const expiresAt = new Date(deps.now().getTime() + deps.config.signedUploadTtlSeconds * 1000).toISOString();

    res.status(201).json({
      objectKey,
      uploadUrl: presignedUpload.url,
      uploadFields: presignedUpload.fields,
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
    const parsedKey = parseUploadObjectKeyForSubject(safeSubjectId, payload.objectKey);
    if (!parsedKey) {
      res.status(400).json({ error: "INVALID_OBJECT_KEY", message: "Object key does not match expected upload key format." });
      return;
    }
    const prefixDate = new Date(Date.UTC(parsedKey.year, parsedKey.month - 1, parsedKey.day));
    const expectedPrefix = inferUploadObjectKeyPrefix(safeSubjectId, parsedKey.tool, prefixDate);
    if (!payload.objectKey.startsWith(`${expectedPrefix}/`)) {
      res.status(400).json({ error: "INVALID_OBJECT_KEY", message: "Object key does not match subject upload prefix." });
      return;
    }

    const head = await deps.storage.headObject(payload.objectKey);
    if (!head.exists) {
      res.status(404).json({ error: "INPUT_OBJECT_NOT_FOUND", message: "Input object key is missing or expired." });
      return;
    }
    if (typeof head.contentLength === "number" && head.contentLength > deps.config.maxUploadBytes) {
      res.status(413).json({
        error: "FILE_TOO_LARGE",
        message: `Maximum upload size is ${deps.config.maxUploadBytes} bytes.`
      });
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

    const detectedMime = detectMimeFromBytes(object.bytes);
    if (!detectedMime || !SUPPORTED_MIME.has(detectedMime)) {
      res.status(400).json({
        error: "UNSUPPORTED_MIME",
        message: "Uploaded object signature is not a supported image type."
      });
      return;
    }

    const sha256 = await sha256HexStreaming(object.bytes);
    if (payload.sha256 && payload.sha256.toLowerCase() !== sha256) {
      res.status(400).json({ error: "SHA256_MISMATCH", message: "Provided sha256 does not match uploaded bytes." });
      return;
    }

    try {
      const scan = await deps.malwareScan.scan({
        objectKey: payload.objectKey,
        subjectId: safeSubjectId,
        contentType: detectedMime,
        bytes: object.bytes
      });
      if (!scan.clean) {
        res.status(422).json({
          error: "MALWARE_DETECTED",
          message: scan.reason || "Upload blocked by malware scan policy."
        });
        return;
      }
    } catch (error) {
      if (deps.config.malwareScanFailClosed) {
        res.status(503).json({
          error: "MALWARE_SCAN_UNAVAILABLE",
          message: "Unable to complete malware scan. Try again shortly."
        });
        return;
      }

      logError("upload.malware_scan.failed_open", {
        objectKey: payload.objectKey,
        subjectId: safeSubjectId,
        error: error instanceof Error ? error.message : String(error)
      });
    }

    const candidates = await deps.jobRepo.listDedupByHash(sha256);

    let canonicalObjectKey = payload.objectKey;
    let deduplicated = false;

    for (const candidate of candidates) {
      const candidateParsed = parseUploadObjectKeyForSubject(safeSubjectId, candidate.objectKey);
      if (
        !candidateParsed
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
      contentType: detectedMime,
      deduplicated,
      createdAt: nowIso
    };

    const dedupRecord: DedupObjectRecord = {
      sha256,
      objectKey: canonicalObjectKey,
      sizeBytes: object.bytes.length,
      contentType: detectedMime,
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
      contentType: detectedMime,
      deduplicated
    });
  }));
}
