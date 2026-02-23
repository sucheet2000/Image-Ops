import type { Request, Response, NextFunction } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { createSecretKey } from "node:crypto";
import { config } from "./config";
import type { AccessTokenClaims } from "./types";

type AuthenticatedRequest = Request & { auth?: AccessTokenClaims };

async function verifyToken(token: string): Promise<AccessTokenClaims> {
  if (config.jwtJwksUrl) {
    const jwks = createRemoteJWKSet(new URL(config.jwtJwksUrl));
    const verified = await jwtVerify(token, jwks, {
      issuer: config.jwtIssuer,
      audience: config.jwtAudience
    });

    return {
      sub: String(verified.payload.sub || ""),
      iss: String(verified.payload.iss || ""),
      aud: verified.payload.aud as string | string[],
      exp: Number(verified.payload.exp || 0),
      scopes: String(verified.payload.scope || "")
        .split(" ")
        .map((value) => value.trim())
        .filter(Boolean)
    };
  }

  if (!config.jwtSecret) {
    throw new Error("JWT verification is not configured.");
  }

  const key = createSecretKey(Buffer.from(config.jwtSecret));
  const verified = await jwtVerify(token, key, {
    issuer: config.jwtIssuer,
    audience: config.jwtAudience
  });

  return {
    sub: String(verified.payload.sub || ""),
    iss: String(verified.payload.iss || ""),
    aud: verified.payload.aud as string | string[],
    exp: Number(verified.payload.exp || 0),
    scopes: String(verified.payload.scope || "")
      .split(" ")
      .map((value) => value.trim())
      .filter(Boolean)
  };
}

export async function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.header("authorization") || "";
    const [scheme, token] = header.split(" ");

    if (scheme?.toLowerCase() !== "bearer" || !token) {
      res.status(401).json({ error: "UNAUTHORIZED", message: "Missing bearer token." });
      return;
    }

    req.auth = await verifyToken(token);
    next();
  } catch {
    res.status(401).json({ error: "UNAUTHORIZED", message: "Token validation failed." });
  }
}

export function requireScope(req: AuthenticatedRequest, scope: string): boolean {
  return Boolean(req.auth?.scopes?.includes(scope));
}

export type { AuthenticatedRequest };
