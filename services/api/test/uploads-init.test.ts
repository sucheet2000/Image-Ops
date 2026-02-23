import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createApiApp } from "../src/server";

const servers: Array<{ close: () => void }> = [];

afterEach(() => {
  while (servers.length > 0) {
    const server = servers.pop();
    server?.close();
  }
});

async function startTestServer() {
  const app = createApiApp({ now: () => new Date("2026-02-23T00:00:00.000Z") });
  const server = app.listen(0);
  servers.push(server);
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

describe("POST /api/uploads/init", () => {
  it("creates a temp upload target and increments quota", async () => {
    const base = await startTestServer();

    const response = await fetch(`${base}/api/uploads/init`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subjectId: "seller_1",
        filename: "listing.jpg",
        mime: "image/jpeg",
        size: 400000,
        tool: "compress"
      })
    });

    expect(response.status).toBe(201);
    const payload = await response.json();

    expect(payload.objectKey).toContain("tmp/seller_1/");
    expect(payload.uploadUrl).toContain("token=");
    expect(payload.quota.usedCount).toBe(1);
    expect(payload.privacy.imageStoredInDatabase).toBe(false);
  });

  it("rejects unsupported mime types", async () => {
    const base = await startTestServer();

    const response = await fetch(`${base}/api/uploads/init`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subjectId: "seller_1",
        filename: "listing.svg",
        mime: "image/svg+xml",
        size: 1200,
        tool: "compress"
      })
    });

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.error).toBe("UNSUPPORTED_MIME");
  });

  it("enforces free plan limit of 6 images per 10 hours", async () => {
    const base = await startTestServer();

    for (let i = 0; i < 6; i += 1) {
      const ok = await fetch(`${base}/api/uploads/init`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subjectId: "seller_2",
          filename: `image-${i}.jpg`,
          mime: "image/jpeg",
          size: 300000,
          tool: "resize"
        })
      });
      expect(ok.status).toBe(201);
    }

    const blocked = await fetch(`${base}/api/uploads/init`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subjectId: "seller_2",
        filename: "image-7.jpg",
        mime: "image/jpeg",
        size: 300000,
        tool: "resize"
      })
    });

    expect(blocked.status).toBe(429);
    const payload = await blocked.json();
    expect(payload.error).toBe("FREE_PLAN_LIMIT_EXCEEDED");
  });

  it("cleans up temp upload keys", async () => {
    const base = await startTestServer();

    const init = await fetch(`${base}/api/uploads/init`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subjectId: "seller_3",
        filename: "listing.jpg",
        mime: "image/jpeg",
        size: 250000,
        tool: "compress"
      })
    });

    const payload = await init.json();
    const cleanup = await fetch(`${base}/api/cleanup`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "cleanup-test-key-1"
      },
      body: JSON.stringify({ objectKeys: [payload.objectKey] })
    });

    expect(cleanup.status).toBe(202);
    const cleaned = await cleanup.json();
    expect(cleaned.cleaned).toBe(1);
    expect(cleaned.idempotencyKey).toBe("cleanup-test-key-1");
  });
});
