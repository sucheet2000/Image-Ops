import { isPlan, toSafeSubjectId, type ImagePlan, type SubjectProfile } from "@image-ops/core";
import { ulid } from "ulid";
import { z } from "zod";
import type { Router } from "express";
import { asyncHandler } from "../lib/async-handler";
import type { JobRepository } from "../services/job-repo";

const createSessionSchema = z.object({
  subjectId: z.string().optional(),
  plan: z.string().optional()
});

const getSessionParamSchema = z.object({
  subjectId: z.string().min(1)
});

export function registerAuthRoutes(
  router: Router,
  deps: {
    jobRepo: JobRepository;
    now: () => Date;
  }
): void {
  router.post("/api/auth/session", asyncHandler(async (req, res) => {
    const parsed = createSessionSchema.safeParse(req.body || {});
    if (!parsed.success) {
      res.status(400).json({ error: "INVALID_SESSION_REQUEST", details: parsed.error.flatten() });
      return;
    }

    const nowIso = deps.now().toISOString();
    const subjectId = toSafeSubjectId(parsed.data.subjectId || `session_${ulid(deps.now().getTime())}`);

    const existing = await deps.jobRepo.getSubjectProfile(subjectId);
    if (existing) {
      res.status(200).json(existing);
      return;
    }

    let plan: ImagePlan = "free";
    if (parsed.data.plan) {
      if (!isPlan(parsed.data.plan)) {
        res.status(400).json({ error: "INVALID_PLAN", message: "Plan must be free, pro, or team." });
        return;
      }
      plan = parsed.data.plan;
    }

    const created: SubjectProfile = {
      subjectId,
      plan,
      createdAt: nowIso,
      updatedAt: nowIso
    };

    await deps.jobRepo.upsertSubjectProfile(created);

    res.status(201).json(created);
  }));

  router.get("/api/auth/session/:subjectId", asyncHandler(async (req, res) => {
    const parsed = getSessionParamSchema.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: "INVALID_SUBJECT_ID", details: parsed.error.flatten() });
      return;
    }

    const subjectId = toSafeSubjectId(parsed.data.subjectId);
    const profile = await deps.jobRepo.getSubjectProfile(subjectId);

    if (!profile) {
      res.status(404).json({ error: "SESSION_NOT_FOUND", message: "Subject profile does not exist." });
      return;
    }

    res.status(200).json(profile);
  }));
}
