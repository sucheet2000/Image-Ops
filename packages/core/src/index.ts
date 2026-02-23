export const FREE_PLAN_LIMIT = 6;
export const FREE_PLAN_WINDOW_HOURS = 10;

export const IMAGE_TOOLS = ["resize", "compress", "convert", "background-remove"] as const;
export type ImageTool = (typeof IMAGE_TOOLS)[number];

export const IMAGE_PLANS = ["free", "pro", "team"] as const;
export type ImagePlan = (typeof IMAGE_PLANS)[number];

export const IMAGE_FORMATS = ["jpeg", "png", "webp"] as const;
export type ImageFormat = (typeof IMAGE_FORMATS)[number];

export const JOB_STATUSES = ["queued", "running", "done", "failed"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export type QuotaWindow = {
  windowStartAt: string;
  usedCount: number;
};

export type QuotaResult = {
  allowed: boolean;
  window: QuotaWindow;
  nextWindowStartAt?: string;
};

export type ResizeOptions = {
  width?: number;
  height?: number;
  fit?: "cover" | "contain" | "inside" | "outside" | "fill";
};

export type CompressOptions = {
  quality?: number;
};

export type ConvertOptions = {
  format: ImageFormat;
  quality?: number;
};

export type BackgroundRemoveOptions = {
  outputFormat?: ImageFormat;
};

export type ToolOptionsByType = {
  resize: ResizeOptions;
  compress: CompressOptions;
  convert: ConvertOptions;
  "background-remove": BackgroundRemoveOptions;
};

export type ToolOptions<T extends ImageTool = ImageTool> = ToolOptionsByType[T];

export type ImageJobRecord = {
  id: string;
  subjectId: string;
  tool: ImageTool;
  plan: ImagePlan;
  isAdvanced: boolean;
  watermarkRequired: boolean;
  inputObjectKey: string;
  outputObjectKey?: string;
  inputMime: string;
  outputMime?: string;
  options: ToolOptions;
  status: JobStatus;
  errorCode?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
};

export type ImageJobQueuePayload = {
  id: string;
  subjectId: string;
  tool: ImageTool;
  plan: ImagePlan;
  watermarkRequired: boolean;
  inputObjectKey: string;
  outputObjectKey: string;
  inputMime: string;
  options: ToolOptions;
};

export type DeletionReason = "delivered" | "page_exit" | "ttl_expiry" | "manual";

export type DeletionAuditRecord = {
  id: string;
  objectKey: string;
  reason: DeletionReason;
  result: "success" | "not_found";
  createdAt: string;
};

export type CleanupIdempotencyRecord = {
  signature: string;
  response: {
    accepted: true;
    cleaned: number;
    notFound: number;
    idempotencyKey: string;
  };
  status: number;
  createdAt: string;
};

export type UploadInitRequest = {
  subjectId: string;
  tool: ImageTool;
  filename: string;
  mime: string;
  size: number;
};

export type UploadInitResponse = {
  objectKey: string;
  uploadUrl: string;
  expiresAt: string;
};

/**
 * Advance a Date by the specified number of hours.
 *
 * @param date - The base Date to advance
 * @param hours - Number of hours to add (may be negative to subtract hours)
 * @returns A new Date representing `date` shifted by `hours` hours
 */
function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

/**
 * Determine whether the requested number of images can be consumed under the free-plan quota and return the updated quota window.
 *
 * @param existing - The current quota window containing `windowStartAt` (ISO string) and `usedCount`
 * @param requestedImages - Number of images requested to consume from the quota
 * @param now - Reference time used to evaluate or reset the quota window
 * @returns A `QuotaResult` where `allowed` indicates if the request fits the free-plan limit and `window` is the updated quota window; when `allowed` is `false`, `nextWindowStartAt` is included indicating when the quota window will reset
 */
export function applyQuota(existing: QuotaWindow, requestedImages: number, now: Date): QuotaResult {
  const start = new Date(existing.windowStartAt);
  const current = { ...existing };

  if (Number.isNaN(start.getTime()) || now > addHours(start, FREE_PLAN_WINDOW_HOURS)) {
    current.windowStartAt = now.toISOString();
    current.usedCount = 0;
  }

  const projected = current.usedCount + requestedImages;
  if (projected > FREE_PLAN_LIMIT) {
    return {
      allowed: false,
      window: current,
      nextWindowStartAt: addHours(new Date(current.windowStartAt), FREE_PLAN_WINDOW_HOURS).toISOString()
    };
  }

  current.usedCount = projected;
  return { allowed: true, window: current };
}

/**
 * Determines if the given image tool is considered advanced.
 *
 * @param tool - The image tool to check
 * @returns `true` if `tool` is `"background-remove"`, `false` otherwise
 */
export function isAdvancedTool(tool: ImageTool): boolean {
  return tool === "background-remove";
}

/**
 * Decides if a watermark should be applied based on the subscription plan and whether the tool is advanced.
 *
 * @param plan - The user's image plan
 * @param isAdvancedToolFlag - `true` when the selected tool is considered advanced (e.g., background removal)
 * @returns `true` if `plan` is "free" and `isAdvancedToolFlag` is `true`, `false` otherwise.
 */
export function shouldApplyWatermark(plan: ImagePlan, isAdvancedToolFlag: boolean): boolean {
  return plan === "free" && isAdvancedToolFlag;
}

/**
 * Determine whether a watermark should be applied for a specific plan and tool.
 *
 * @param plan - The image plan (for example `"free"`, `"pro"`, `"team"`)
 * @param tool - The image tool (for example `"resize"`, `"background-remove"`)
 * @returns `true` if a watermark should be applied for the combination of `plan` and `tool`, `false` otherwise.
 */
export function shouldApplyWatermarkForTool(plan: ImagePlan, tool: ImageTool): boolean {
  return shouldApplyWatermark(plan, isAdvancedTool(tool));
}

/**
 * Provide the default options for a specific image tool.
 *
 * @param tool - The image tool to retrieve default options for
 * @returns The default options object corresponding to `tool`:
 * - `resize` -> `{ fit: "inside" }`
 * - `compress` -> `{ quality: 80 }`
 * - `convert` -> `{ format: "jpeg", quality: 85 }`
 * - `background-remove` -> `{ outputFormat: "png" }`
 */
export function defaultToolOptions(tool: ImageTool): ToolOptions {
  if (tool === "resize") {
    return { fit: "inside" };
  }
  if (tool === "compress") {
    return { quality: 80 };
  }
  if (tool === "convert") {
    return { format: "jpeg", quality: 85 };
  }
  return { outputFormat: "png" };
}

/**
 * Produce the options for a given tool by combining the tool's defaults with user-provided overrides.
 *
 * @param tool - The image tool to produce options for
 * @param incoming - Partial option overrides; properties provided here replace the corresponding defaults
 * @returns The fully populated options object for `tool`
 */
export function mergeToolOptions<T extends ImageTool>(tool: T, incoming: Partial<ToolOptionsByType[T]> | undefined): ToolOptionsByType[T] {
  return { ...defaultToolOptions(tool), ...(incoming || {}) } as ToolOptionsByType[T];
}

/**
 * Selects the output image format for a processing job based on the tool, input MIME type, and tool options.
 *
 * @param tool - The image tool being applied (may force or influence the output format)
 * @param inputMime - MIME type of the input image used to infer a sensible default when the tool doesn't specify an output
 * @param options - Tool-specific options that can explicitly set the output format for tools that support it
 * @returns The chosen output image format: `jpeg`, `png`, or `webp`
 */
export function toolOutputFormat(tool: ImageTool, inputMime: string, options: ToolOptions): ImageFormat {
  if (tool === "convert") {
    return (options as ConvertOptions).format;
  }

  if (tool === "background-remove") {
    return (options as BackgroundRemoveOptions).outputFormat || "png";
  }

  if (inputMime.includes("png")) {
    return "png";
  }

  if (inputMime.includes("webp")) {
    return "webp";
  }

  return "jpeg";
}

/**
 * Map an ImageFormat to its corresponding MIME type.
 *
 * @param format - The image format to convert
 * @returns The MIME type string for the given `format` (`"jpeg"` → `"image/jpeg"`, `"png"` → `"image/png"`, `"webp"` → `"image/webp"`)
 */
export function formatToMime(format: ImageFormat): string {
  if (format === "jpeg") {
    return "image/jpeg";
  }

  if (format === "png") {
    return "image/png";
  }

  return "image/webp";
}

/**
 * Maps an ImageFormat to its preferred file extension.
 *
 * @returns `'jpg'` when `format` is `"jpeg"`; otherwise the same value as `format`.
 */
export function formatToExtension(format: ImageFormat): string {
  if (format === "jpeg") {
    return "jpg";
  }

  return format;
}

/**
 * Determine the ImageFormat corresponding to a MIME type string.
 *
 * Matches common image MIME type substrings and returns the corresponding ImageFormat.
 *
 * @param mime - The MIME type or content-type string to inspect
 * @returns The `ImageFormat` (`'jpeg'`, `'png'`, or `'webp'`) for a recognized MIME type, or `null` if none match
 */
export function mimeToFormat(mime: string): ImageFormat | null {
  if (mime.includes("jpeg") || mime.includes("jpg")) {
    return "jpeg";
  }

  if (mime.includes("png")) {
    return "png";
  }

  if (mime.includes("webp")) {
    return "webp";
  }

  return null;
}

/**
 * Compute the ISO timestamp when a quota window expires.
 *
 * @param window - The quota window containing `windowStartAt`
 * @returns The ISO 8601 timestamp for `window.windowStartAt` advanced by the free-plan window duration
 */
export function quotaWindowResetAt(window: QuotaWindow): string {
  return addHours(new Date(window.windowStartAt), FREE_PLAN_WINDOW_HOURS).toISOString();
}

/**
 * Create a deterministic signature for a cleanup request from an array of object keys.
 *
 * @param objectKeys - Array of object key strings (may contain duplicates or surrounding whitespace)
 * @returns A single string built by trimming, removing empty entries, deduplicating, lexically sorting the remaining keys, and joining them with `|`. Returns an empty string if no valid keys remain.
 */
export function cleanupRequestSignature(objectKeys: string[]): string {
  const keys = [...new Set(objectKeys.map((value) => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  return keys.join("|");
}

/**
 * Determines whether a cleanup request is a replay by comparing two normalized signatures.
 *
 * @param existingSignature - The previously recorded cleanup request signature
 * @param incomingSignature - The newly computed cleanup request signature to compare
 * @returns `true` if both signatures are exactly equal, `false` otherwise
 */
export function isCleanupReplayAllowed(existingSignature: string, incomingSignature: string): boolean {
  return existingSignature === incomingSignature;
}

/**
 * Normalize an input into a deduplicated list of trimmed, non-empty object keys.
 *
 * @param keys - Value to normalize; if not an array, an empty array is returned.
 * @returns An array of unique, trimmed, non-empty strings derived from `keys`, preserving the first-seen order.
 */
export function normalizeObjectKeys(keys: unknown): string[] {
  if (!Array.isArray(keys)) {
    return [];
  }

  return [...new Set(keys.map((value) => String(value || "").trim()).filter(Boolean))];
}

/**
 * Check whether a string matches one of the supported image tool names.
 *
 * @param value - The string to test (e.g. "resize", "compress", "convert", "background-remove")
 * @returns `true` if `value` is a valid `ImageTool`, `false` otherwise.
 */
export function isTool(value: string): value is ImageTool {
  return (IMAGE_TOOLS as readonly string[]).includes(value);
}

/**
 * Check whether a string corresponds to one of the defined image plans.
 *
 * @param value - Candidate plan string to validate
 * @returns `true` if `value` is a valid ImagePlan, `false` otherwise.
 */
export function isPlan(value: string): value is ImagePlan {
  return (IMAGE_PLANS as readonly string[]).includes(value);
}

/**
 * Sanitizes a subject identifier by removing disallowed characters, truncating to 64 characters, and falling back to "anonymous" when empty.
 *
 * @param value - The raw subject identifier to sanitize.
 * @returns The sanitized subject identifier containing only letters, digits, underscores, and dashes, truncated to 64 characters, or `"anonymous"` if the result is empty.
 */
export function toSafeSubjectId(value: string): string {
  const safe = value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
  return safe || "anonymous";
}

/**
 * Determines whether an upload size is within the allowed byte limit.
 *
 * @param size - Upload size in bytes
 * @param maxUploadBytes - Maximum allowed upload size in bytes
 * @returns `true` if `size` is greater than zero and less than or equal to `maxUploadBytes`, `false` otherwise.
 */
export function isWithinUploadLimit(size: number, maxUploadBytes: number): boolean {
  return size > 0 && size <= maxUploadBytes;
}

/**
 * Builds a UTC-dated object key prefix for temporary upload inputs.
 *
 * @param subjectId - Subject identifier inserted into the key (used as provided)
 * @param tool - Image tool name appended to the key
 * @param now - Date used to generate the YYYY/MM/DD path segments (UTC)
 * @returns The object key prefix in the form `tmp/{subjectId}/input/YYYY/MM/DD/{tool}`
 */
export function inferUploadObjectKeyPrefix(subjectId: string, tool: ImageTool, now: Date): string {
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  return `tmp/${subjectId}/input/${yyyy}/${mm}/${dd}/${tool}`;
}

/**
 * Builds a stable object key prefix for output files for a given subject and tool using the UTC date.
 *
 * @param subjectId - Subject identifier to include in the path
 * @param tool - Image tool name to include as the final path segment
 * @param now - Reference date used to generate the YYYY/MM/DD segments in UTC
 * @returns A key prefix in the form `tmp/{subjectId}/output/YYYY/MM/DD/{tool}` where the date parts are taken from `now` in UTC
 */
export function inferOutputObjectKeyPrefix(subjectId: string, tool: ImageTool, now: Date): string {
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  return `tmp/${subjectId}/output/${yyyy}/${mm}/${dd}/${tool}`;
}

/**
 * Maps an unknown processing error into a structured `{ code, message }` representation.
 *
 * @param error - The error to classify; may be an `Error` or any other value.
 * @returns An object with `code` (one of `"BACKGROUND_REMOVE_FAILED"`, `"PROCESSING_TIMEOUT"`, `"OBJECT_NOT_FOUND"`, or `"PROCESSING_FAILED"`) and a descriptive `message`.
 */
export function classifyProcessingError(error: unknown): { code: string; message: string } {
  if (error instanceof Error) {
    const message = error.message || "processing error";
    if (/background/i.test(message)) {
      return { code: "BACKGROUND_REMOVE_FAILED", message };
    }
    if (/timeout/i.test(message)) {
      return { code: "PROCESSING_TIMEOUT", message };
    }
    if (/not found/i.test(message)) {
      return { code: "OBJECT_NOT_FOUND", message };
    }
    return { code: "PROCESSING_FAILED", message };
  }

  return { code: "PROCESSING_FAILED", message: "Unknown processing error." };
}

/**
 * Format an event name and associated payload into a structured JSON log string.
 *
 * @param event - The event name or identifier
 * @param payload - Arbitrary data to include with the event
 * @returns A JSON string containing `ts` (ISO timestamp), `event`, and `payload`
 */
export function toStructuredLog(event: string, payload: Record<string, unknown>): string {
  return JSON.stringify({ ts: new Date().toISOString(), event, payload });
}
