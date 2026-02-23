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

/**
 * Selects a default image file extension based on the MIME type string.
 *
 * @param mime - The MIME type to examine (for example `"image/png"` or `"image/jpeg"`).
 * @returns The chosen extension: `"png"` if `mime` contains `"png"`, `"webp"` if it contains `"webp"`, otherwise `"jpg"`.
 */
function mimeToDefaultExtension(mime: string): string {
  if (mime.includes("png")) {
    return "png";
  }
  if (mime.includes("webp")) {
    return "webp";
  }
  return "jpg";
}

/**
 * Determine the preferred image file extension using the client's filename when valid, otherwise fall back to the MIME type.
 *
 * @param filename - Original filename provided by the client; may include an extension.
 * @param mime - The image MIME type (e.g., "image/png", "image/jpeg").
 * @returns The selected file extension: `"jpg"`, `"png"`, or `"webp"` (maps `"jpeg"` to `"jpg"`).
 */
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

/**
 * Registers the POST /api/uploads/init route that initializes image uploads by validating input, generating an object key, and returning a presigned upload URL.
 *
 * Validates request body (subjectId, tool, filename, mime, size), enforces supported image MIME types and maximum upload size, verifies the tool value, computes a storage object key (using a subject/tool prefix and ULID), obtains a presigned upload URL from the storage dependency, and responds with `objectKey`, `uploadUrl`, `expiresAt`, and storage flags. Responds with appropriate HTTP status codes for invalid requests (400), unsupported MIME (400), file too large (413), and successful creation (201).
 *
 * @param router - Express Router to attach the route to
 * @param deps - Route dependencies:
 *  - config: API configuration (includes `maxUploadBytes` and `signedUploadTtlSeconds`)
 *  - storage: ObjectStorageService used to create presigned upload URLs
 *  - now: function that returns the current `Date` for timestamping and prefix computation
 */
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
