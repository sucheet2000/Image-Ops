import { afterEach, describe, expect, it } from "vitest";
import { InMemoryAuthService } from "../src/services/auth";
import { createApiApp } from "../src/server";
import { createFakeServices, createTestConfig } from "./helpers/fakes";
import { startExpressTestServer } from "./helpers/server";

function cookieValue(setCookieHeader: string | null, cookieName: string): string | null {
  if (!setCookieHeader) {
    return null;
  }
  const firstPart = setCookieHeader.split(";")[0] || "";
  const separatorIndex = firstPart.indexOf("=");
  if (separatorIndex === -1) {
    return null;
  }

  const name = firstPart.slice(0, separatorIndex);
  const value = firstPart.slice(separatorIndex + 1);
  if (!name || name !== cookieName || !value) {
    return null;
  }

  return decodeURIComponent(value);
}

const closers: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (closers.length > 0) {
    const close = closers.pop();
    if (close) {
      await close();
    }
  }
});

describe("auth refresh session hardening", () => {
  it("sets httpOnly refresh cookie on google auth", async () => {
    const config = createTestConfig();
    const services = createFakeServices();
    const auth = new InMemoryAuthService(config.authTokenSecret);

    let nowMs = Date.parse("2026-02-23T00:00:00.000Z");
    const app = createApiApp({ config, ...services, auth, now: () => new Date(nowMs) });
    const server = await startExpressTestServer(app);
    closers.push(server.close);

    const response = await fetch(`${server.baseUrl}/api/auth/google`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken: "google-token-1" })
    });

    expect(response.status).toBe(200);
    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).toContain(`${config.authRefreshCookieName}=`);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain(`Path=${config.authRefreshCookiePath}`);
  });

  it("rotates refresh cookie and rejects replay of old cookie", async () => {
    const config = createTestConfig();
    const services = createFakeServices();
    const auth = new InMemoryAuthService(config.authTokenSecret);

    let nowMs = Date.parse("2026-02-23T00:00:00.000Z");
    const app = createApiApp({ config, ...services, auth, now: () => new Date(nowMs) });
    const server = await startExpressTestServer(app);
    closers.push(server.close);

    const signIn = await fetch(`${server.baseUrl}/api/auth/google`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken: "google-token-2" })
    });
    expect(signIn.status).toBe(200);

    const cookieName = config.authRefreshCookieName;
    const firstRefreshToken = cookieValue(signIn.headers.get("set-cookie"), cookieName);
    expect(firstRefreshToken).toBeTruthy();

    nowMs += 1000;

    const refreshed = await fetch(`${server.baseUrl}/api/auth/refresh`, {
      method: "POST",
      headers: { cookie: `${cookieName}=${encodeURIComponent(firstRefreshToken || "")}` }
    });

    expect(refreshed.status).toBe(200);
    const refreshedPayload = await refreshed.json();
    expect(refreshedPayload.tokenType).toBe("Bearer");

    const secondRefreshToken = cookieValue(refreshed.headers.get("set-cookie"), cookieName);
    expect(secondRefreshToken).toBeTruthy();
    expect(secondRefreshToken).not.toBe(firstRefreshToken);

    const replay = await fetch(`${server.baseUrl}/api/auth/refresh`, {
      method: "POST",
      headers: { cookie: `${cookieName}=${encodeURIComponent(firstRefreshToken || "")}` }
    });

    expect(replay.status).toBe(401);
  });

  it("revokes refresh session on logout", async () => {
    const config = createTestConfig();
    const services = createFakeServices();
    const auth = new InMemoryAuthService(config.authTokenSecret);

    let nowMs = Date.parse("2026-02-23T00:00:00.000Z");
    const app = createApiApp({ config, ...services, auth, now: () => new Date(nowMs) });
    const server = await startExpressTestServer(app);
    closers.push(server.close);

    const signIn = await fetch(`${server.baseUrl}/api/auth/google`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken: "google-token-3" })
    });
    const cookieName = config.authRefreshCookieName;
    const refreshToken = cookieValue(signIn.headers.get("set-cookie"), cookieName);
    expect(refreshToken).toBeTruthy();

    const logout = await fetch(`${server.baseUrl}/api/auth/logout`, {
      method: "POST",
      headers: { cookie: `${cookieName}=${encodeURIComponent(refreshToken || "")}` }
    });

    expect(logout.status).toBe(204);
    expect(logout.headers.get("set-cookie")).toContain("Max-Age=0");

    nowMs += 1000;

    const refreshAfterLogout = await fetch(`${server.baseUrl}/api/auth/refresh`, {
      method: "POST",
      headers: { cookie: `${cookieName}=${encodeURIComponent(refreshToken || "")}` }
    });

    expect(refreshAfterLogout.status).toBe(401);
  });

  it("rejects expired refresh sessions", async () => {
    const config = createTestConfig();
    config.authRefreshTtlSeconds = 1;

    const services = createFakeServices();
    const auth = new InMemoryAuthService(config.authTokenSecret);

    let nowMs = Date.parse("2026-02-23T00:00:00.000Z");
    const app = createApiApp({ config, ...services, auth, now: () => new Date(nowMs) });
    const server = await startExpressTestServer(app);
    closers.push(server.close);

    const signIn = await fetch(`${server.baseUrl}/api/auth/google`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken: "google-token-4" })
    });

    const cookieName = config.authRefreshCookieName;
    const refreshToken = cookieValue(signIn.headers.get("set-cookie"), cookieName);
    expect(refreshToken).toBeTruthy();

    nowMs += 2000;

    const refresh = await fetch(`${server.baseUrl}/api/auth/refresh`, {
      method: "POST",
      headers: { cookie: `${cookieName}=${encodeURIComponent(refreshToken || "")}` }
    });

    expect(refresh.status).toBe(401);
  });
});
