import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { AuthError, type ImagePlan } from "@imageops/core";
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

function toBase64Url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function fromBase64Url(input: string): Buffer {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${pad}`, "base64");
}

function hashSecret(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
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

  constructor(input: { googleClientId: string; authTokenSecret: string; authTokenTtlSeconds: number }) {
    this.googleClientId = input.googleClientId;
    this.authTokenSecret = input.authTokenSecret;
    this.authTokenTtlSeconds = input.authTokenTtlSeconds;
  }

  async verifyGoogleIdToken(idToken: string): Promise<GoogleIdentity> {
    const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
    if (!response.ok) {
      throw new AuthError("Invalid Google ID token.");
    }

    const payload = (await response.json()) as Record<string, unknown>;
    if (String(payload.aud || "") !== this.googleClientId) {
      throw new AuthError("Google token audience mismatch.");
    }

    const sub = String(payload.sub || "").trim();
    if (!sub) {
      throw new AuthError("Google token missing subject.");
    }

    return {
      sub,
      email: payload.email ? String(payload.email) : undefined,
      emailVerified: String(payload.email_verified || "false") === "true"
    };
  }

  issueApiToken(input: { sub: string; plan: ImagePlan; email?: string; now: Date }): string {
    const header = toBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const iat = Math.floor(input.now.getTime() / 1000);
    const payloadClaims: ApiTokenClaims = {
      sub: input.sub,
      plan: input.plan,
      email: input.email,
      iat,
      exp: iat + this.authTokenTtlSeconds
    };
    const payload = toBase64Url(JSON.stringify(payloadClaims));
    const signingInput = `${header}.${payload}`;
    const signature = toBase64Url(createHmac("sha256", this.authTokenSecret).update(signingInput).digest());
    return `${signingInput}.${signature}`;
  }

  verifyApiToken(token: string): ApiTokenClaims | null {
    const [headerPart, payloadPart, signaturePart] = token.split(".");
    if (!headerPart || !payloadPart || !signaturePart) {
      return null;
    }

    const expected = toBase64Url(createHmac("sha256", this.authTokenSecret).update(`${headerPart}.${payloadPart}`).digest());
    if (expected.length !== signaturePart.length) {
      return null;
    }

    if (!timingSafeEqual(Buffer.from(expected), Buffer.from(signaturePart))) {
      return null;
    }

    try {
      const payload = JSON.parse(fromBase64Url(payloadPart).toString("utf8")) as ApiTokenClaims;
      const nowUnix = Math.floor(Date.now() / 1000);
      if (!payload.sub || !payload.plan || typeof payload.exp !== "number" || payload.exp <= nowUnix) {
        return null;
      }
      return payload;
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
      throw new AuthError("Invalid Google ID token.");
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
