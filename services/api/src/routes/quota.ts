import { applyQuota, quotaWindowResetAt, toSafeSubjectId, type ImagePlan, type QuotaWindow } from "@imageops/core";
import { z } from "zod";
import type { Router } from "express";
import { asyncHandler } from "../lib/async-handler";
import { quotaPolicyForPlan } from "../lib/quota-policy";
import type { ApiConfig } from "../config";
import type { JobRepository } from "../services/job-repo";

const quotaParamSchema = z.object({
  subjectId: z.string().min(1)
});

const quotaQuerySchema = z.object({
  plan: z.enum(["free", "pro", "team"]).optional()
});

/**
 * Create a new quota window starting at the provided time with zero usage.
 *
 * @param now - The Date used to set the window's start time
 * @returns A QuotaWindow with `windowStartAt` set to `now.toISOString()` and `usedCount` set to 0
 */
function defaultQuota(now: Date): QuotaWindow {
  return {
    windowStartAt: now.toISOString(),
    usedCount: 0
  };
}

/**
 * Registers the GET /api/quota/:subjectId route that returns the subject's quota window and usage.
 *
 * @param router - Express router on which the quota route will be mounted.
 * @param deps - Dependency bag.
 * @param deps.jobRepo - Repository used to read and persist quota windows.
 * @param deps.now - Function returning the current Date; used to compute and roll quota windows.
 */
export function registerQuotaRoutes(
  router: Router,
  deps: { config: ApiConfig; jobRepo: JobRepository; now: () => Date }
): void {
  router.get("/api/quota/:subjectId", asyncHandler(async (req, res) => {
    const parsed = quotaParamSchema.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: "INVALID_SUBJECT_ID", details: parsed.error.flatten() });
      return;
    }
    const parsedQuery = quotaQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      res.status(400).json({ error: "INVALID_QUOTA_QUERY", details: parsedQuery.error.flatten() });
      return;
    }

    const now = deps.now();
    const subjectId = toSafeSubjectId(parsed.data.subjectId);
    const profile = await deps.jobRepo.getSubjectProfile(subjectId);
    const plan = (parsedQuery.data.plan || profile?.plan || "free") as ImagePlan;
    const quotaPolicy = quotaPolicyForPlan(deps.config, plan);
    const existingRecord = await deps.jobRepo.getQuotaWindow(subjectId);
    const existing = existingRecord || defaultQuota(now);

    // requestedImages=0 keeps existing count but still rolls window when expired.
    const rolled = applyQuota(existing, 0, now, quotaPolicy.limit, quotaPolicy.windowHours).window;
    if (
      !existingRecord
      || rolled.windowStartAt !== existing.windowStartAt
      || rolled.usedCount !== existing.usedCount
    ) {
      await deps.jobRepo.setQuotaWindow(subjectId, rolled);
    }

    res.json({
      subjectId,
      plan,
      limit: quotaPolicy.limit,
      windowHours: quotaPolicy.windowHours,
      usedCount: rolled.usedCount,
      windowStartAt: rolled.windowStartAt,
      windowResetAt: quotaWindowResetAt(rolled, quotaPolicy.windowHours)
    });
  }));
}
