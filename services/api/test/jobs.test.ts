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

describe("POST /api/jobs", () => {
  it("enqueues validated job payload and stores queued status", async () => {
    const services = createFakeServices();
    const server = await startApiTestServer({ ...services, config: createTestConfig() });
    closers.push(server.close);

    services.storage.setObject("tmp/seller_1/input/2026/02/23/resize/input.jpg", "image/jpeg");

    const response = await fetch(`${server.baseUrl}/api/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subjectId: "seller_1",
        plan: "free",
        tool: "background-remove",
        inputObjectKey: "tmp/seller_1/input/2026/02/23/resize/input.jpg",
        options: { outputFormat: "png" }
      })
    });

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.status).toBe("queued");
    expect(payload.watermarkRequired).toBe(true);

    expect(services.queue.items.length).toBe(1);
    expect(services.queue.items[0]?.tool).toBe("background-remove");
    expect(services.queue.items[0]?.watermarkRequired).toBe(true);
    expect(services.queue.items[0]?.outputObjectKey).toContain("tmp/seller_1/output/");
  });

  it("rejects missing input objects", async () => {
    const services = createFakeServices();
    const server = await startApiTestServer({ ...services, config: createTestConfig() });
    closers.push(server.close);

    const response = await fetch(`${server.baseUrl}/api/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subjectId: "seller_1",
        plan: "free",
        tool: "compress",
        inputObjectKey: "tmp/seller_1/input/missing.jpg"
      })
    });

    expect(response.status).toBe(404);
    const payload = await response.json();
    expect(payload.error).toBe("INPUT_OBJECT_NOT_FOUND");
  });

  it("enforces free-plan rolling quota on job creation", async () => {
    const services = createFakeServices();
    const server = await startApiTestServer({ ...services, config: createTestConfig() });
    closers.push(server.close);

    for (let index = 0; index < 6; index += 1) {
      const key = `tmp/seller_2/input/2026/02/23/compress/${index}.jpg`;
      services.storage.setObject(key, "image/jpeg");
      const response = await fetch(`${server.baseUrl}/api/jobs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subjectId: "seller_2",
          plan: "free",
          tool: "compress",
          inputObjectKey: key,
          options: { quality: 70 }
        })
      });
      expect(response.status).toBe(201);
    }

    const blockedKey = "tmp/seller_2/input/2026/02/23/compress/blocked.jpg";
    services.storage.setObject(blockedKey, "image/jpeg");

    const blocked = await fetch(`${server.baseUrl}/api/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subjectId: "seller_2",
        plan: "free",
        tool: "compress",
        inputObjectKey: blockedKey,
        options: { quality: 70 }
      })
    });

    expect(blocked.status).toBe(429);
    const payload = await blocked.json();
    expect(payload.error).toBe("FREE_PLAN_LIMIT_EXCEEDED");
  });
});
