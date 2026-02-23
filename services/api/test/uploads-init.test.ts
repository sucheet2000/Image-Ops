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

describe("POST /api/uploads/init", () => {
  it("returns object key and signed upload URL", async () => {
    const services = createFakeServices();
    const server = await startApiTestServer({ ...services, config: createTestConfig() });
    closers.push(server.close);

    const response = await fetch(`${server.baseUrl}/api/uploads/init`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subjectId: "seller_1",
        tool: "resize",
        filename: "sample.jpg",
        mime: "image/jpeg",
        size: 200_000
      })
    });

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.objectKey).toContain("tmp/seller_1/input/2026/02/23/resize/");
    expect(payload.uploadUrl).toContain(encodeURIComponent(payload.objectKey));
    expect(payload.tempStorageOnly).toBe(true);
    expect(payload.imageStoredInDatabase).toBe(false);
    expect(new Date(payload.expiresAt).getTime()).toBeGreaterThan(new Date("2026-02-23T00:00:00.000Z").getTime());
  });

  it("rejects unsupported MIME type", async () => {
    const services = createFakeServices();
    const server = await startApiTestServer({ ...services, config: createTestConfig() });
    closers.push(server.close);

    const response = await fetch(`${server.baseUrl}/api/uploads/init`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subjectId: "seller_1",
        tool: "resize",
        filename: "sample.gif",
        mime: "image/gif",
        size: 1_000
      })
    });

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.error).toBe("UNSUPPORTED_MIME");
  });

  it("rejects oversized uploads", async () => {
    const services = createFakeServices();
    const config = createTestConfig();
    config.maxUploadBytes = 1024;

    const server = await startApiTestServer({ ...services, config });
    closers.push(server.close);

    const response = await fetch(`${server.baseUrl}/api/uploads/init`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subjectId: "seller_1",
        tool: "resize",
        filename: "sample.jpg",
        mime: "image/jpeg",
        size: 4096
      })
    });

    expect(response.status).toBe(413);
    const payload = await response.json();
    expect(payload.error).toBe("FILE_TOO_LARGE");
  });

  it("rejects missing required fields", async () => {
    const services = createFakeServices();
    const server = await startApiTestServer({ ...services, config: createTestConfig() });
    closers.push(server.close);

    const response = await fetch(`${server.baseUrl}/api/uploads/init`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subjectId: "seller_1"
      })
    });

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.error).toBe("INVALID_UPLOAD_REQUEST");
  });

  it("rejects invalid size values", async () => {
    const services = createFakeServices();
    const server = await startApiTestServer({ ...services, config: createTestConfig() });
    closers.push(server.close);

    const response = await fetch(`${server.baseUrl}/api/uploads/init`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subjectId: "seller_1",
        tool: "resize",
        filename: "sample.jpg",
        mime: "image/jpeg",
        size: 0
      })
    });

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.error).toBe("INVALID_UPLOAD_REQUEST");
  });

  it("enforces quota limits on upload init", async () => {
    const services = createFakeServices();
    const server = await startApiTestServer({ ...services, config: createTestConfig() });
    closers.push(server.close);

    for (let i = 0; i < 6; i++) {
      const response = await fetch(`${server.baseUrl}/api/uploads/init`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subjectId: "seller_quota",
          tool: "compress",
          filename: `file${i}.jpg`,
          mime: "image/jpeg",
          size: 100_000
        })
      });
      expect(response.status).toBe(201);
    }

    const blocked = await fetch(`${server.baseUrl}/api/uploads/init`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subjectId: "seller_quota",
        tool: "compress",
        filename: "blocked.jpg",
        mime: "image/jpeg",
        size: 100_000
      })
    });

    expect(blocked.status).toBe(429);
    const payload = await blocked.json();
    expect(payload.error).toBe("FREE_PLAN_LIMIT_EXCEEDED");
  });

  it("accepts all supported MIME types", async () => {
    const services = createFakeServices();
    const server = await startApiTestServer({ ...services, config: createTestConfig() });
    closers.push(server.close);

    const supportedMimes = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

    for (const mime of supportedMimes) {
      const response = await fetch(`${server.baseUrl}/api/uploads/init`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subjectId: `seller_mime_${mime}`,
          tool: "compress",
          filename: "test.jpg",
          mime,
          size: 50_000
        })
      });

      expect(response.status).toBe(201);
    }
  });

  it("creates unique object keys for concurrent uploads", async () => {
    const services = createFakeServices();
    const server = await startApiTestServer({ ...services, config: createTestConfig() });
    closers.push(server.close);

    const promises = Array.from({ length: 5 }, (_, i) =>
      fetch(`${server.baseUrl}/api/uploads/init`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subjectId: "seller_concurrent",
          tool: "resize",
          filename: "image.jpg",
          mime: "image/jpeg",
          size: 100_000
        })
      })
    );

    const responses = await Promise.all(promises);
    const payloads = await Promise.all(responses.map((r) => r.json()));
    const keys = payloads.map((p) => p.objectKey);

    expect(new Set(keys).size).toBe(5);
  });

  it("includes privacy information in response", async () => {
    const services = createFakeServices();
    const server = await startApiTestServer({ ...services, config: createTestConfig() });
    closers.push(server.close);

    const response = await fetch(`${server.baseUrl}/api/uploads/init`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subjectId: "seller_privacy",
        tool: "compress",
        filename: "private.jpg",
        mime: "image/jpeg",
        size: 50_000
      })
    });

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.imageStoredInDatabase).toBe(false);
    expect(payload.tempStorageOnly).toBe(true);
  });
});