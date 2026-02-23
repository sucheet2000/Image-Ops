import { inferUploadObjectKeyPrefix, isTool, toSafeSubjectId, type ImageTool } from "@image-ops/core";
import { ulid } from "ulid";
import { z } from "zod";
import type { Router } from "express";
import type { ApiConfig } from "../config";
import { asyncHandler } from "../lib/async-handler";
import type { ObjectStorageService } from "../services/storage";

const SUPPORTED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

const uploadInitSchema = z.object({
  subjectId: z.string().min(1),
  tool: z.string().min(1),
  filename: z.string().min(1),
  mime: z.string().min(1),
  size: z.number().int().positive()
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

export function registerUploadsRoutes(router: Router, deps: { config: ApiConfig; storage: ObjectStorageService; now: () => Date }): void {
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
    const objectKey = `${prefix}/${ulid()}.${extension}`;

    const uploadUrl = await deps.storage.createPresignedUploadUrl({
      objectKey,
      contentType: mime,
      expiresInSeconds: deps.config.signedUploadTtlSeconds
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
}
