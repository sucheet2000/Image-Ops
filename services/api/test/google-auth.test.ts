import { describe, expect, it } from "vitest";
import type { AuthService } from "../src/services/auth";
import { createApiApp } from "../src/server";
import { createFakeServices, createTestConfig } from "./helpers/fakes";

async function startServer(app: ReturnType<typeof createApiApp>): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = app.listen(0);
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: async () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      })
  };
}

describe("POST /api/auth/google", () => {
  it("issues API token and upserts profile", async () => {
    const config = createTestConfig();
    config.authTokenTtlSeconds = 7200;

    const services = createFakeServices();
    const authStub: AuthService = {
      verifyGoogleIdToken: async () => ({
        sub: "google-subject-1",
        email: "seller@example.com",
        emailVerified: true
      }),
      issueApiToken: () => "signed-api-token",
      verifyApiToken: () => null
    };

    const app = createApiApp({ config, ...services, auth: authStub, now: () => new Date("2026-02-23T00:00:00.000Z") });
    const server = await startServer(app);

    const response = await fetch(`${server.baseUrl}/api/auth/google`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken: "google-id-token" })
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.token).toBe("signed-api-token");
    expect(payload.expiresIn).toBe(7200);
    expect(payload.profile.subjectId).toBe("google_google-subject-1");
    expect(payload.profile.plan).toBe("free");

    await server.close();
  });
});
