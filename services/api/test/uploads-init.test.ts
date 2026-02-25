import { afterEach, describe, expect, it } from "vitest";
import { bearerAuthHeaders } from "./helpers/auth";
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
      headers: { "content-type": "application/json", ...bearerAuthHeaders("seller_1") },
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
      headers: { "content-type": "application/json", ...bearerAuthHeaders("seller_1") },
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
      headers: { "content-type": "application/json", ...bearerAuthHeaders("seller_1") },
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
});
