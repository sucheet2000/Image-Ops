import { describe, expect, it } from "vitest";
import { InMemoryAuthService } from "../src/services/auth";
import { createApiApp } from "../src/server";
import { createFakeServices, createTestConfig } from "./helpers/fakes";
import { startApiTestServer } from "./helpers/server";

describe("API token enforcement", () => {
  it("rejects protected routes without bearer token", async () => {
    const config = createTestConfig();
    const services = createFakeServices();
    const auth = new InMemoryAuthService(config.authTokenSecret);

    const app = createApiApp({ config, ...services, auth, now: () => new Date("2026-02-23T00:00:00.000Z") });
    const server = await startApiTestServer({ app });

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
    const services = createFakeServices();
    const auth = new InMemoryAuthService(config.authTokenSecret);

    const app = createApiApp({ config, ...services, auth, now: () => new Date("2026-02-23T00:00:00.000Z") });
    const server = await startApiTestServer({ app });

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

    expect(response.status).not.toBe(401);

    await server.close();
  });

  it("rejects watch tower logs endpoint without bearer token", async () => {
    const config = createTestConfig();
    const services = createFakeServices();
    const auth = new InMemoryAuthService(config.authTokenSecret);

    const app = createApiApp({ config, ...services, auth, now: () => new Date("2026-02-23T00:00:00.000Z") });
    const server = await startApiTestServer({ app });

    const response = await fetch(`${server.baseUrl}/api/observability/logs`);
    expect(response.status).toBe(401);

    await server.close();
  });
});
