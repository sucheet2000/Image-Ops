export const FREE_PLAN_LIMIT = 6;
export const FREE_PLAN_WINDOW_HOURS = 10;

export type QuotaWindow = {
  windowStartAt: string;
  usedCount: number;
};

export type QuotaResult = {
  allowed: boolean;
  window: QuotaWindow;
  nextWindowStartAt?: string;
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

export function shouldApplyWatermark(plan: "free" | "pro" | "team", isAdvancedTool: boolean): boolean {
  return plan === "free" && isAdvancedTool;
}
