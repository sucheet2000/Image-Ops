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

async function completeUpload(baseUrl: string, subjectId: string, objectKey: string): Promise<void> {
  const response = await fetch(`${baseUrl}/api/uploads/complete`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ subjectId, objectKey })
  });
  expect(response.status).toBe(200);
}

describe("POST /api/jobs", () => {
  it("enqueues validated job payload and stores queued status", async () => {
    const services = createFakeServices();
    const server = await startApiTestServer({ ...services, config: createTestConfig() });
    closers.push(server.close);

    const inputObjectKey = "tmp/seller_1/input/2026/02/23/resize/input.jpg";
    services.storage.setObject(inputObjectKey, "image/png", fakeImageBytes("first-image-bytes"));
    await completeUpload(server.baseUrl, "seller_1", inputObjectKey);

    const response = await fetch(`${server.baseUrl}/api/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subjectId: "seller_1",
        plan: "free",
        tool: "background-remove",
        inputObjectKey,
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

    const missingObjectKey = "tmp/seller_1/input/2026/02/23/compress/missing.jpg";
    const completeResponse = await fetch(`${server.baseUrl}/api/uploads/complete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subjectId: "seller_1",
        objectKey: missingObjectKey
      })
    });
    expect(completeResponse.status).toBe(404);

    const response = await fetch(`${server.baseUrl}/api/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subjectId: "seller_1",
        plan: "free",
        tool: "compress",
        inputObjectKey: missingObjectKey
      })
    });

    expect(response.status).toBe(409);
    const payload = await response.json();
    expect(payload.error).toBe("UPLOAD_NOT_COMPLETED");
  });

  it("enforces free-plan rolling quota on job creation", async () => {
    const services = createFakeServices();
    const server = await startApiTestServer({ ...services, config: createTestConfig() });
    closers.push(server.close);

    for (let index = 0; index < 6; index += 1) {
      const key = `tmp/seller_2/input/2026/02/23/compress/${index}.jpg`;
      services.storage.setObject(key, "image/png", fakeImageBytes(`bytes-${index}`));
      await completeUpload(server.baseUrl, "seller_2", key);

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
    services.storage.setObject(blockedKey, "image/png", fakeImageBytes("bytes-blocked"));
    await completeUpload(server.baseUrl, "seller_2", blockedKey);

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
    expect(payload.error).toBe("PLAN_LIMIT_EXCEEDED");
    expect(payload.plan).toBe("free");
    expect(payload.limit).toBe(6);
    expect(payload.windowHours).toBe(10);
  });

  it("uses stored subject plan when plan is omitted", async () => {
    const services = createFakeServices();
    const server = await startApiTestServer({ ...services, config: createTestConfig() });
    closers.push(server.close);

    await services.jobRepo.upsertSubjectProfile({
      subjectId: "seller_paid",
      plan: "pro",
      createdAt: "2026-02-23T00:00:00.000Z",
      updatedAt: "2026-02-23T00:00:00.000Z"
    });

    const inputObjectKey = "tmp/seller_paid/input/2026/02/23/background-remove/input.png";
    services.storage.setObject(inputObjectKey, "image/png", fakeImageBytes("seller-paid-image"));
    await completeUpload(server.baseUrl, "seller_paid", inputObjectKey);

    const response = await fetch(`${server.baseUrl}/api/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subjectId: "seller_paid",
        tool: "background-remove",
        inputObjectKey,
        options: { outputFormat: "png" }
      })
    });

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.watermarkRequired).toBe(false);

    expect(services.queue.items[0]?.plan).toBe("pro");
  });

  it("enforces configured pro-plan limits independently from free-plan limits", async () => {
    const services = createFakeServices();
    const config = createTestConfig();
    config.proPlanLimit = 2;
    config.proPlanWindowHours = 24;

    const server = await startApiTestServer({ ...services, config });
    closers.push(server.close);

    await services.jobRepo.upsertSubjectProfile({
      subjectId: "seller_pro_limited",
      plan: "pro",
      createdAt: "2026-02-23T00:00:00.000Z",
      updatedAt: "2026-02-23T00:00:00.000Z"
    });

    for (let index = 0; index < 2; index += 1) {
      const key = `tmp/seller_pro_limited/input/2026/02/23/convert/${index}.png`;
      services.storage.setObject(key, "image/png", fakeImageBytes(`seller-pro-${index}`));
      await completeUpload(server.baseUrl, "seller_pro_limited", key);

      const create = await fetch(`${server.baseUrl}/api/jobs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subjectId: "seller_pro_limited",
          tool: "convert",
          inputObjectKey: key,
          options: { format: "webp" }
        })
      });

      expect(create.status).toBe(201);
      const payload = await create.json();
      expect(payload.quota.plan).toBe("pro");
      expect(payload.quota.limit).toBe(2);
      expect(payload.quota.windowHours).toBe(24);
    }

    const blockedKey = "tmp/seller_pro_limited/input/2026/02/23/convert/blocked.png";
    services.storage.setObject(blockedKey, "image/png", fakeImageBytes("seller-pro-blocked"));
    await completeUpload(server.baseUrl, "seller_pro_limited", blockedKey);

    const blocked = await fetch(`${server.baseUrl}/api/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subjectId: "seller_pro_limited",
        tool: "convert",
        inputObjectKey: blockedKey,
        options: { format: "webp" }
      })
    });

    expect(blocked.status).toBe(429);
    const payload = await blocked.json();
    expect(payload.error).toBe("PLAN_LIMIT_EXCEEDED");
    expect(payload.plan).toBe("pro");
    expect(payload.limit).toBe(2);
    expect(payload.windowHours).toBe(24);
  });

  it("ignores client-supplied plan when server profile is free", async () => {
    const services = createFakeServices();
    const server = await startApiTestServer({ ...services, config: createTestConfig() });
    closers.push(server.close);

    const inputObjectKey = "tmp/seller_spoof/input/2026/02/23/background-remove/input.png";
    services.storage.setObject(inputObjectKey, "image/png", fakeImageBytes("seller-spoof-image"));
    await completeUpload(server.baseUrl, "seller_spoof", inputObjectKey);

    const response = await fetch(`${server.baseUrl}/api/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subjectId: "seller_spoof",
        plan: "team",
        tool: "background-remove",
        inputObjectKey,
        options: { outputFormat: "png" }
      })
    });

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.quota.plan).toBe("free");
    expect(payload.watermarkRequired).toBe(true);
    expect(services.queue.items[0]?.plan).toBe("free");
  });
});
