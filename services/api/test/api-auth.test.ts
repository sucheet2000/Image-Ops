import { describe, expect, it } from "vitest";
import { InMemoryAuthService } from "../src/services/auth";
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

describe("API token enforcement", () => {
  it("rejects protected routes without bearer token when API_AUTH_REQUIRED=true", async () => {
    const config = createTestConfig();
    config.apiAuthRequired = true;
    const services = createFakeServices();
    const auth = new InMemoryAuthService(config.authTokenSecret);

    const app = createApiApp({ config, ...services, auth, now: () => new Date("2026-02-23T00:00:00.000Z") });
    const server = await startServer(app);

    const response = await fetch(`${server.baseUrl}/api/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subjectId: "seller_1",
        tool: "compress",
        inputObjectKey: "tmp/seller_1/input/1.jpg"
      })
    });

    expect(response.status).toBe(401);

    await server.close();
  });

  it("accepts protected routes with valid bearer token", async () => {
    const config = createTestConfig();
    config.apiAuthRequired = true;
    const services = createFakeServices();
    const auth = new InMemoryAuthService(config.authTokenSecret);

    const app = createApiApp({ config, ...services, auth, now: () => new Date("2026-02-23T00:00:00.000Z") });
    const server = await startServer(app);

    const token = auth.issueApiToken({
      sub: "seller_1",
      plan: "free",
      now: new Date()
    });

    const response = await fetch(`${server.baseUrl}/api/jobs`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        subjectId: "seller_1",
        tool: "compress",
        inputObjectKey: "tmp/seller_1/input/1.jpg"
      })
    });

    expect(response.status).toBe(409);

    await server.close();
  });
});
