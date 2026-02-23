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

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

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

export function isAdvancedTool(tool: ImageTool): boolean {
  return tool === "background-remove";
}

export function shouldApplyWatermark(plan: ImagePlan, isAdvancedToolFlag: boolean): boolean {
  return plan === "free" && isAdvancedToolFlag;
}

export function shouldApplyWatermarkForTool(plan: ImagePlan, tool: ImageTool): boolean {
  return shouldApplyWatermark(plan, isAdvancedTool(tool));
}

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

export function mergeToolOptions<T extends ImageTool>(tool: T, incoming: Partial<ToolOptionsByType[T]> | undefined): ToolOptionsByType[T] {
  return { ...defaultToolOptions(tool), ...(incoming || {}) } as ToolOptionsByType[T];
}

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

export function formatToMime(format: ImageFormat): string {
  if (format === "jpeg") {
    return "image/jpeg";
  }

  if (format === "png") {
    return "image/png";
  }

  return "image/webp";
}

export function formatToExtension(format: ImageFormat): string {
  if (format === "jpeg") {
    return "jpg";
  }

  return format;
}

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

export function quotaWindowResetAt(window: QuotaWindow): string {
  return addHours(new Date(window.windowStartAt), FREE_PLAN_WINDOW_HOURS).toISOString();
}

export function cleanupRequestSignature(objectKeys: string[]): string {
  const keys = [...new Set(objectKeys.map((value) => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  return keys.join("|");
}

export function isCleanupReplayAllowed(existingSignature: string, incomingSignature: string): boolean {
  return existingSignature === incomingSignature;
}

export function normalizeObjectKeys(keys: unknown): string[] {
  if (!Array.isArray(keys)) {
    return [];
  }

  return [...new Set(keys.map((value) => String(value || "").trim()).filter(Boolean))];
}

export function isTool(value: string): value is ImageTool {
  return (IMAGE_TOOLS as readonly string[]).includes(value);
}

export function isPlan(value: string): value is ImagePlan {
  return (IMAGE_PLANS as readonly string[]).includes(value);
}

export function toSafeSubjectId(value: string): string {
  const safe = value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
  return safe || "anonymous";
}

export function isWithinUploadLimit(size: number, maxUploadBytes: number): boolean {
  return size > 0 && size <= maxUploadBytes;
}

export function inferUploadObjectKeyPrefix(subjectId: string, tool: ImageTool, now: Date): string {
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  return `tmp/${subjectId}/input/${yyyy}/${mm}/${dd}/${tool}`;
}

export function inferOutputObjectKeyPrefix(subjectId: string, tool: ImageTool, now: Date): string {
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  return `tmp/${subjectId}/output/${yyyy}/${mm}/${dd}/${tool}`;
}

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

export function toStructuredLog(event: string, payload: Record<string, unknown>): string {
  return JSON.stringify({ ts: new Date().toISOString(), event, payload });
}
