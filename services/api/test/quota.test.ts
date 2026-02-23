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

describe("GET /api/quota/:subjectId", () => {
  it("returns current usage for active window", async () => {
    let nowValue = new Date("2026-02-23T00:00:00.000Z");
    const now = () => nowValue;
    const services = createFakeServices();
    const server = await startApiTestServer({ ...services, config: createTestConfig(), now });
    closers.push(server.close);

    services.storage.setObject("tmp/seller_1/input/a.jpg", "image/jpeg");

    await fetch(`${server.baseUrl}/api/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subjectId: "seller_1",
        plan: "free",
        tool: "compress",
        inputObjectKey: "tmp/seller_1/input/a.jpg"
      })
    });

    const quota = await fetch(`${server.baseUrl}/api/quota/seller_1`);
    expect(quota.status).toBe(200);
    const payload = await quota.json();
    expect(payload.usedCount).toBe(1);
    expect(payload.limit).toBe(6);

    nowValue = new Date("2026-02-23T11:00:00.000Z");
    const rolled = await fetch(`${server.baseUrl}/api/quota/seller_1`);
    const rolledPayload = await rolled.json();
    expect(rolledPayload.usedCount).toBe(0);
  });
});
