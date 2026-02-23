import { isPlan, toSafeSubjectId, type ImagePlan, type SubjectProfile } from "@image-ops/core";
import { ulid } from "ulid";
import { z } from "zod";
import type { Router } from "express";
import type { ApiConfig } from "../config";
import { asyncHandler } from "../lib/async-handler";
import type { AuthService } from "../services/auth";
import type { JobRepository } from "../services/job-repo";

const createSessionSchema = z.object({
  subjectId: z.string().optional(),
  plan: z.string().optional()
});

const getSessionParamSchema = z.object({
  subjectId: z.string().min(1)
});

const googleAuthSchema = z.object({
  idToken: z.string().min(1)
});

export function registerAuthRoutes(
  router: Router,
  deps: {
    config: ApiConfig;
    jobRepo: JobRepository;
    auth: AuthService;
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

  router.post("/api/auth/google", asyncHandler(async (req, res) => {
    const parsed = googleAuthSchema.safeParse(req.body || {});
    if (!parsed.success) {
      res.status(400).json({ error: "INVALID_GOOGLE_AUTH_REQUEST", details: parsed.error.flatten() });
      return;
    }

    const identity = await deps.auth.verifyGoogleIdToken(parsed.data.idToken);
    const subjectId = toSafeSubjectId(`google_${identity.sub}`);
    const now = deps.now();
    const nowIso = now.toISOString();

    const existing = await deps.jobRepo.getSubjectProfile(subjectId);
    const profile: SubjectProfile = {
      subjectId,
      plan: existing?.plan || "free",
      createdAt: existing?.createdAt || nowIso,
      updatedAt: nowIso
    };
    await deps.jobRepo.upsertSubjectProfile(profile);

    const token = deps.auth.issueApiToken({
      sub: subjectId,
      plan: profile.plan,
      email: identity.email,
      now
    });

    res.status(200).json({
      token,
      tokenType: "Bearer",
      expiresIn: deps.config.authTokenTtlSeconds,
      profile
    });
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
