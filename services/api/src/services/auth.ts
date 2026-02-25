import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { isPlan, type ImagePlan } from "@imageops/core";
import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";
import { ulid } from "ulid";

export type ApiTokenClaims = {
  sub: string;
  plan: ImagePlan;
  email?: string;
  iat: number;
  exp: number;
};

export type GoogleIdentity = {
  sub: string;
  email?: string;
  emailVerified: boolean;
};

export type RefreshTokenIssueResult = {
  sessionId: string;
  token: string;
  secretHash: string;
};

export interface AuthService {
  verifyGoogleIdToken(idToken: string): Promise<GoogleIdentity>;
  issueApiToken(input: { sub: string; plan: ImagePlan; email?: string; now: Date }): string;
  verifyApiToken(token: string): ApiTokenClaims | null;
}

export class GoogleTokenVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleTokenVerificationError";
  }
}

function hashSecret(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

function isImagePlan(value: unknown): value is ImagePlan {
  return typeof value === "string" && isPlan(value);
}

export function issueRefreshToken(now: Date): RefreshTokenIssueResult {
  const sessionId = ulid(now.getTime());
  const secret = randomBytes(32).toString("base64url");
  return {
    sessionId,
    token: `${sessionId}.${secret}`,
    secretHash: hashSecret(secret)
  };
}

export function parseRefreshToken(token: string): { sessionId: string; secret: string } | null {
  const [sessionId, secret, ...rest] = token.split(".");
  if (!sessionId || !secret || rest.length > 0) {
    return null;
  }
  return { sessionId, secret };
}

export function verifyRefreshTokenSecret(secret: string, secretHash: string): boolean {
  const candidate = hashSecret(secret);
  if (candidate.length !== secretHash.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(candidate, "utf8"), Buffer.from(secretHash, "utf8"));
}

export class GoogleTokenAuthService implements AuthService {
  private readonly googleClientId: string;
  private readonly authTokenSecret: string;
  private readonly authTokenTtlSeconds: number;
  private readonly oauthClient: OAuth2Client;

  constructor(input: {
    googleClientId: string;
    authTokenSecret: string;
    authTokenTtlSeconds: number;
    oauthClient?: OAuth2Client;
  }) {
    this.googleClientId = input.googleClientId;
    this.authTokenSecret = input.authTokenSecret;
    this.authTokenTtlSeconds = input.authTokenTtlSeconds;
    this.oauthClient = input.oauthClient || new OAuth2Client(input.googleClientId);
  }

  async verifyGoogleIdToken(idToken: string): Promise<GoogleIdentity> {
    let payload:
      | {
          sub?: string;
          email?: string;
          email_verified?: boolean | string;
          aud?: string | string[];
          iss?: string;
          exp?: number;
        }
      | undefined;

    try {
      const ticket = await this.oauthClient.verifyIdToken({
        idToken,
        audience: this.googleClientId
      });
      payload = ticket.getPayload();
    } catch {
      throw new GoogleTokenVerificationError("Invalid Google ID token.");
    }

    if (!payload) {
      throw new GoogleTokenVerificationError("Invalid Google ID token.");
    }

    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!audiences.some((audience) => String(audience || "") === this.googleClientId)) {
      throw new GoogleTokenVerificationError("Google token audience mismatch.");
    }

    const issuer = String(payload.iss || "");
    if (issuer !== "accounts.google.com" && issuer !== "https://accounts.google.com") {
      throw new GoogleTokenVerificationError("Google token issuer mismatch.");
    }

    const exp = Number(payload.exp || 0);
    if (!Number.isFinite(exp) || exp <= Math.floor(Date.now() / 1000)) {
      throw new GoogleTokenVerificationError("Google token expired.");
    }

    const sub = String(payload.sub || "").trim();
    if (!sub) {
      throw new GoogleTokenVerificationError("Google token missing subject.");
    }

    return {
      sub,
      email: payload.email ? String(payload.email) : undefined,
      emailVerified: payload.email_verified === true || String(payload.email_verified || "").toLowerCase() === "true"
    };
  }

  issueApiToken(input: { sub: string; plan: ImagePlan; email?: string; now: Date }): string {
    const iat = Math.floor(input.now.getTime() / 1000);
    const payloadClaims: ApiTokenClaims = {
      sub: input.sub,
      plan: input.plan,
      email: input.email,
      iat,
      exp: iat + this.authTokenTtlSeconds
    };
    return jwt.sign(payloadClaims, this.authTokenSecret, {
      algorithm: "HS256",
      noTimestamp: true
    });
  }

  verifyApiToken(token: string): ApiTokenClaims | null {
    try {
      const payload = jwt.verify(token, this.authTokenSecret, {
        algorithms: ["HS256"]
      });
      if (!payload || typeof payload !== "object") {
        return null;
      }

      const sub = typeof payload.sub === "string" ? payload.sub : "";
      const plan = payload.plan;
      const exp = typeof payload.exp === "number" ? payload.exp : 0;
      const nowUnix = Math.floor(Date.now() / 1000);
      if (!sub || !isImagePlan(plan) || exp <= nowUnix) {
        return null;
      }

      return {
        sub,
        plan,
        email: typeof payload.email === "string" ? payload.email : undefined,
        iat: typeof payload.iat === "number" ? payload.iat : nowUnix,
        exp
      };
    } catch {
      return null;
    }
  }
}

export class InMemoryAuthService implements AuthService {
  private readonly delegate: GoogleTokenAuthService;

  constructor(secret = "test-auth-secret") {
    this.delegate = new GoogleTokenAuthService({
      googleClientId: "test-google-client",
      authTokenSecret: secret,
      authTokenTtlSeconds: 3600
    });
  }

  async verifyGoogleIdToken(idToken: string): Promise<GoogleIdentity> {
    if (!idToken) {
      throw new GoogleTokenVerificationError("Invalid Google ID token.");
    }

    return {
      sub: `google_${idToken.slice(0, 8)}`,
      email: "tester@example.com",
      emailVerified: true
    };
  }

  issueApiToken(input: { sub: string; plan: ImagePlan; email?: string; now: Date }): string {
    return this.delegate.issueApiToken(input);
  }

  verifyApiToken(token: string): ApiTokenClaims | null {
    return this.delegate.verifyApiToken(token);
  }
}
