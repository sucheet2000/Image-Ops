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

function fakeImageBytes(marker: string): Buffer {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from(marker, "utf8")
  ]);
}

describe("GET /api/quota/:subjectId", () => {
  it("returns current usage for active window", async () => {
    let nowValue = new Date("2026-02-23T00:00:00.000Z");
    const now = () => nowValue;
    const services = createFakeServices();
    const server = await startApiTestServer({ ...services, config: createTestConfig(), now });
    closers.push(server.close);

    const inputObjectKey = "tmp/seller_1/input/2026/02/23/compress/a.jpg";
    services.storage.setObject(inputObjectKey, "image/png", fakeImageBytes("quota-seller-1"));

    const complete = await fetch(`${server.baseUrl}/api/uploads/complete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subjectId: "seller_1",
        objectKey: inputObjectKey
      })
    });
    expect(complete.status).toBe(200);

    const createJob = await fetch(`${server.baseUrl}/api/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subjectId: "seller_1",
        plan: "free",
        tool: "compress",
        inputObjectKey
      })
    });
    expect(createJob.status).toBe(201);

    const quota = await fetch(`${server.baseUrl}/api/quota/seller_1`);
    expect(quota.status).toBe(200);
    const payload = await quota.json();
    expect(payload.plan).toBe("free");
    expect(payload.usedCount).toBe(1);
    expect(payload.limit).toBe(6);

    nowValue = new Date("2026-02-23T11:00:00.000Z");
    const rolled = await fetch(`${server.baseUrl}/api/quota/seller_1`);
    const rolledPayload = await rolled.json();
    expect(rolledPayload.usedCount).toBe(0);
  });

  it("returns configured quota policy for requested plan", async () => {
    const services = createFakeServices();
    const config = createTestConfig();
    config.teamPlanLimit = 4000;
    config.teamPlanWindowHours = 48;

    const server = await startApiTestServer({ ...services, config });
    closers.push(server.close);

    const response = await fetch(`${server.baseUrl}/api/quota/seller_team?plan=team`);
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.plan).toBe("team");
    expect(payload.limit).toBe(4000);
    expect(payload.windowHours).toBe(48);
    expect(payload.usedCount).toBe(0);
  });
});
