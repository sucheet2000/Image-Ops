import { isPlan, toSafeSubjectId, type AuthRefreshSession, type ImagePlan, type SubjectProfile } from "@image-ops/core";
import { ulid } from "ulid";
import { z } from "zod";
import type { Request, Response, Router } from "express";
import type { ApiConfig } from "../config";
import { asyncHandler } from "../lib/async-handler";
import {
  issueRefreshToken,
  parseRefreshToken,
  verifyRefreshTokenSecret,
  type AuthService
} from "../services/auth";
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

function sameSiteCookieValue(value: ApiConfig["authRefreshCookieSameSite"]): "Lax" | "Strict" | "None" {
  if (value === "strict") {
    return "Strict";
  }
  if (value === "none") {
    return "None";
  }
  return "Lax";
}

function buildRefreshCookieParts(config: ApiConfig, rawValue: string): string[] {
  const parts = [
    `${config.authRefreshCookieName}=${rawValue}`,
    `Path=${config.authRefreshCookiePath}`,
    "HttpOnly",
    `SameSite=${sameSiteCookieValue(config.authRefreshCookieSameSite)}`
  ];

  if (config.authRefreshCookieSecure) {
    parts.push("Secure");
  }
  if (config.authRefreshCookieDomain) {
    parts.push(`Domain=${config.authRefreshCookieDomain}`);
  }

  return parts;
}

function serializeRefreshCookie(config: ApiConfig, value: string, maxAgeSeconds: number): string {
  const parts = buildRefreshCookieParts(config, encodeURIComponent(value));
  parts.push(`Max-Age=${maxAgeSeconds}`);

  return parts.join("; ");
}

function clearRefreshCookie(config: ApiConfig): string {
  const parts = buildRefreshCookieParts(config, "");
  parts.push("Max-Age=0");
  parts.push("Expires=Thu, 01 Jan 1970 00:00:00 GMT");

  return parts.join("; ");
}

// Keep explicit cookie parsing here to avoid an extra runtime dependency for a single refresh-token cookie read path.
// Parsing joins segments after the first "=" so signed/base64 values remain intact.
function parseCookieHeader(request: Request): Map<string, string> {
  const raw = request.header("cookie") || "";
  const map = new Map<string, string>();
  for (const segment of raw.split(";")) {
    const [name, ...valueParts] = segment.trim().split("=");
    if (!name || valueParts.length === 0) {
      continue;
    }

    const encoded = valueParts.join("=");
    try {
      map.set(name, decodeURIComponent(encoded));
    } catch {
      map.set(name, encoded);
    }
  }

  return map;
}

function readRefreshTokenFromCookie(request: Request, cookieName: string): string | null {
  return parseCookieHeader(request).get(cookieName) || null;
}

function sendRefreshUnauthorized(res: Response, config: ApiConfig): void {
  res.setHeader("set-cookie", clearRefreshCookie(config));
  res.status(401).json({ error: "UNAUTHORIZED", message: "Invalid or expired refresh session." });
}

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

    const refreshIssued = issueRefreshToken(now);
    const refreshSession: AuthRefreshSession = {
      id: refreshIssued.sessionId,
      subjectId,
      plan: profile.plan,
      email: identity.email,
      secretHash: refreshIssued.secretHash,
      createdAt: nowIso,
      updatedAt: nowIso,
      expiresAt: new Date(now.getTime() + deps.config.authRefreshTtlSeconds * 1000).toISOString()
    };
    await deps.jobRepo.putAuthRefreshSession(refreshSession, deps.config.authRefreshTtlSeconds);

    res.setHeader("cache-control", "no-store");
    res.setHeader("set-cookie", serializeRefreshCookie(deps.config, refreshIssued.token, deps.config.authRefreshTtlSeconds));
    res.status(200).json({
      token,
      tokenType: "Bearer",
      expiresIn: deps.config.authTokenTtlSeconds,
      profile
    });
  }));

  router.post("/api/auth/refresh", asyncHandler(async (req, res) => {
    const refreshToken = readRefreshTokenFromCookie(req, deps.config.authRefreshCookieName);
    if (!refreshToken) {
      sendRefreshUnauthorized(res, deps.config);
      return;
    }

    const parsed = parseRefreshToken(refreshToken);
    if (!parsed) {
      sendRefreshUnauthorized(res, deps.config);
      return;
    }

    const now = deps.now();
    const nowIso = now.toISOString();
    const existingSession = await deps.jobRepo.getAuthRefreshSession(parsed.sessionId);
    if (!existingSession) {
      sendRefreshUnauthorized(res, deps.config);
      return;
    }

    if (existingSession.revokedAt || new Date(existingSession.expiresAt).getTime() <= now.getTime()) {
      await deps.jobRepo.revokeAuthRefreshSession(existingSession.id, nowIso);
      sendRefreshUnauthorized(res, deps.config);
      return;
    }

    if (!verifyRefreshTokenSecret(parsed.secret, existingSession.secretHash)) {
      try {
        await deps.jobRepo.revokeAuthRefreshSession(existingSession.id, nowIso);
      } catch {
        // Best-effort revocation; still return unauthorized.
      }
      sendRefreshUnauthorized(res, deps.config);
      return;
    }

    const storedProfile = await deps.jobRepo.getSubjectProfile(existingSession.subjectId);
    const plan = storedProfile?.plan || existingSession.plan;
    const profile: SubjectProfile = storedProfile || {
      subjectId: existingSession.subjectId,
      plan,
      createdAt: existingSession.createdAt,
      updatedAt: nowIso
    };

    await deps.jobRepo.revokeAuthRefreshSession(existingSession.id, nowIso);

    const rotated = issueRefreshToken(now);
    const rotatedSession: AuthRefreshSession = {
      id: rotated.sessionId,
      subjectId: existingSession.subjectId,
      plan,
      email: existingSession.email,
      secretHash: rotated.secretHash,
      createdAt: nowIso,
      updatedAt: nowIso,
      expiresAt: new Date(now.getTime() + deps.config.authRefreshTtlSeconds * 1000).toISOString()
    };
    await deps.jobRepo.putAuthRefreshSession(rotatedSession, deps.config.authRefreshTtlSeconds);

    const token = deps.auth.issueApiToken({
      sub: existingSession.subjectId,
      plan,
      email: existingSession.email,
      now
    });

    res.setHeader("cache-control", "no-store");
    res.setHeader("set-cookie", serializeRefreshCookie(deps.config, rotated.token, deps.config.authRefreshTtlSeconds));
    res.status(200).json({
      token,
      tokenType: "Bearer",
      expiresIn: deps.config.authTokenTtlSeconds,
      plan: profile.plan,
      profile
    });
  }));

  router.post("/api/auth/logout", asyncHandler(async (req, res) => {
    const refreshToken = readRefreshTokenFromCookie(req, deps.config.authRefreshCookieName);
    if (refreshToken) {
      const parsed = parseRefreshToken(refreshToken);
      if (parsed) {
        await deps.jobRepo.revokeAuthRefreshSession(parsed.sessionId, deps.now().toISOString());
      }
    }

    res.setHeader("set-cookie", clearRefreshCookie(deps.config));
    res.status(204).end();
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
