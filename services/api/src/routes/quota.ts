import { applyQuota, FREE_PLAN_LIMIT, FREE_PLAN_WINDOW_HOURS, quotaWindowResetAt, toSafeSubjectId, type QuotaWindow } from "@image-ops/core";
import { z } from "zod";
import type { Router } from "express";
import { asyncHandler } from "../lib/async-handler";
import type { JobRepository } from "../services/job-repo";

const quotaParamSchema = z.object({
  subjectId: z.string().min(1)
});

function defaultQuota(now: Date): QuotaWindow {
  return {
    windowStartAt: now.toISOString(),
    usedCount: 0
  };
}

export function registerQuotaRoutes(router: Router, deps: { jobRepo: JobRepository; now: () => Date }): void {
  router.get("/api/quota/:subjectId", asyncHandler(async (req, res) => {
    const parsed = quotaParamSchema.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: "INVALID_SUBJECT_ID", details: parsed.error.flatten() });
      return;
    }

    const now = deps.now();
    const subjectId = toSafeSubjectId(parsed.data.subjectId);
    const existing = (await deps.jobRepo.getQuotaWindow(subjectId)) || defaultQuota(now);

    // requestedImages=0 keeps existing count but still rolls window when expired.
    const rolled = applyQuota(existing, 0, now).window;
    if (rolled.windowStartAt !== existing.windowStartAt || rolled.usedCount !== existing.usedCount) {
      await deps.jobRepo.setQuotaWindow(subjectId, rolled);
    }

    res.json({
      subjectId,
      limit: FREE_PLAN_LIMIT,
      windowHours: FREE_PLAN_WINDOW_HOURS,
      usedCount: rolled.usedCount,
      windowStartAt: rolled.windowStartAt,
      windowResetAt: quotaWindowResetAt(rolled)
    });
  }));
}
