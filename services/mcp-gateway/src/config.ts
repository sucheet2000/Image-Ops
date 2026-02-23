function parseNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  port: parseNumber("MCP_PORT", 4300),
  apiBaseUrl: process.env.MCP_API_BASE_URL || "http://localhost:4000",
  allowedHosts: (process.env.MCP_ALLOWED_HOSTS || "localhost").split(",").map((value) => value.trim()),
  executeEnabled: (process.env.MCP_EXECUTE_ENABLED || "true").toLowerCase() === "true",
  executeTimeoutMs: parseNumber("MCP_EXEC_TIMEOUT_MS", 4000),
  maxCallsPerExecute: parseNumber("MCP_MAX_CALLS_PER_EXEC", 5),
  rateLimitWindowMs: parseNumber("MCP_RATE_LIMIT_WINDOW_MS", 60_000),
  rateLimitMaxRequests: parseNumber("MCP_RATE_LIMIT_MAX_REQUESTS", 30),
  jwtIssuer: process.env.MCP_JWT_ISSUER || "image-ops-auth",
  jwtAudience: process.env.MCP_JWT_AUDIENCE || "image-ops-mcp",
  jwtJwksUrl: process.env.MCP_JWT_JWKS_URL || "",
  jwtSecret: process.env.MCP_JWT_SHARED_SECRET || ""
};
