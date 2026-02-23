import { afterEach, describe, expect, it } from "vitest";
import { createFakeServices, createTestConfig } from "./helpers/fakes";
import { startApiTestServer } from "./helpers/server";

const closers: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (closers.length > 0) {
    const close = closers.pop();
    if (close) {
      await close();
    }
  }
});

describe("auth session routes", () => {
  it("creates a free session profile when subject is omitted", async () => {
    const services = createFakeServices();
    const server = await startApiTestServer({ ...services, config: createTestConfig() });
    closers.push(server.close);

    const response = await fetch(`${server.baseUrl}/api/auth/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({})
    });

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.subjectId).toContain("session_");
    expect(payload.plan).toBe("free");

    const stored = await services.jobRepo.getSubjectProfile(payload.subjectId);
    expect(stored?.plan).toBe("free");
  });

  it("returns existing profile by subject id", async () => {
    const services = createFakeServices();
    const server = await startApiTestServer({ ...services, config: createTestConfig() });
    closers.push(server.close);

    const created = await fetch(`${server.baseUrl}/api/auth/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subjectId: "seller_pro", plan: "pro" })
    });

    expect(created.status).toBe(201);

    const fetched = await fetch(`${server.baseUrl}/api/auth/session/seller_pro`);
    expect(fetched.status).toBe(200);

    const payload = await fetched.json();
    expect(payload.subjectId).toBe("seller_pro");
    expect(payload.plan).toBe("pro");
  });
});
