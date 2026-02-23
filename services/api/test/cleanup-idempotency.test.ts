import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createApiApp } from "../src/server";

const servers: Array<{ close: () => void }> = [];
const originalWorkerToken = process.env.WORKER_INTERNAL_TOKEN;

afterEach(() => {
  while (servers.length > 0) {
    const server = servers.pop();
    server?.close();
  }

  if (originalWorkerToken === undefined) {
    delete process.env.WORKER_INTERNAL_TOKEN;
  } else {
    process.env.WORKER_INTERNAL_TOKEN = originalWorkerToken;
  }
});

async function startTestServer(now: () => Date, workerToken = "cleanup-worker-token") {
  process.env.WORKER_INTERNAL_TOKEN = workerToken;
  const app = createApiApp({ now });
  const server = app.listen(0);
  servers.push(server);
  const { port } = server.address() as AddressInfo;
  return { base: `http://127.0.0.1:${port}`, workerToken };
}

async function initUpload(base: string, subjectId: string, filename = "listing.jpg") {
  const response = await fetch(`${base}/api/uploads/init`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      subjectId,
      filename,
      mime: "image/jpeg",
      size: 250000,
      tool: "compress"
    })
  });

  expect(response.status).toBe(201);
  return response.json();
}

describe("cleanup idempotency and ttl sweep", () => {
  it("requires idempotency-key header", async () => {
    const { base } = await startTestServer(() => new Date("2026-02-23T00:00:00.000Z"));
    const upload = await initUpload(base, "seller_cleanup_1");

    const cleanup = await fetch(`${base}/api/cleanup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ objectKeys: [upload.objectKey] })
    });

    expect(cleanup.status).toBe(400);
    const payload = await cleanup.json();
    expect(payload.error).toBe("IDEMPOTENCY_KEY_REQUIRED");
  });

  it("replays identical cleanup calls for the same key", async () => {
    const { base } = await startTestServer(() => new Date("2026-02-23T00:00:00.000Z"));
    const upload = await initUpload(base, "seller_cleanup_2");

    const first = await fetch(`${base}/api/cleanup`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "cleanup-replay-key"
      },
      body: JSON.stringify({ objectKeys: [upload.objectKey] })
    });
    expect(first.status).toBe(202);
    const firstPayload = await first.json();
    expect(firstPayload.cleaned).toBe(1);

    const second = await fetch(`${base}/api/cleanup`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "cleanup-replay-key"
      },
      body: JSON.stringify({ objectKeys: [upload.objectKey] })
    });

    expect(second.status).toBe(202);
    expect(second.headers.get("x-idempotent-replay")).toBe("true");
    const secondPayload = await second.json();
    expect(secondPayload.cleaned).toBe(1);
    expect(secondPayload.idempotencyKey).toBe("cleanup-replay-key");
  });

  it("rejects key reuse with different payload", async () => {
    const { base } = await startTestServer(() => new Date("2026-02-23T00:00:00.000Z"));
    const uploadA = await initUpload(base, "seller_cleanup_3", "a.jpg");
    const uploadB = await initUpload(base, "seller_cleanup_3", "b.jpg");

    const first = await fetch(`${base}/api/cleanup`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "cleanup-conflict-key"
      },
      body: JSON.stringify({ objectKeys: [uploadA.objectKey] })
    });
    expect(first.status).toBe(202);

    const conflict = await fetch(`${base}/api/cleanup`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "cleanup-conflict-key"
      },
      body: JSON.stringify({ objectKeys: [uploadB.objectKey] })
    });

    expect(conflict.status).toBe(409);
    const payload = await conflict.json();
    expect(payload.error).toBe("IDEMPOTENCY_KEY_CONFLICT");
  });

  it("sweeps expired temp uploads and records ttl audit events", async () => {
    let currentTime = new Date("2026-02-23T00:00:00.000Z");
    const now = () => currentTime;
    const { base, workerToken } = await startTestServer(now);
    const upload = await initUpload(base, "seller_cleanup_4");

    currentTime = new Date("2026-02-23T00:31:00.000Z");

    const sweep = await fetch(`${base}/api/internal/temp/sweep`, {
      method: "POST",
      headers: { "x-worker-token": workerToken }
    });
    expect(sweep.status).toBe(200);
    const sweepPayload = await sweep.json();
    expect(sweepPayload.swept).toBe(1);

    const audits = await fetch(`${base}/api/internal/deletion-audit?limit=10`, {
      headers: { "x-worker-token": workerToken }
    });
    expect(audits.status).toBe(200);
    const auditPayload = await audits.json();
    const ttlEntry = auditPayload.items.find((item: { objectKey: string; reason: string }) => item.objectKey === upload.objectKey);
    expect(ttlEntry?.reason).toBe("ttl_expiry");
  });
});
