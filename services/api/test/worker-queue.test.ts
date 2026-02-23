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

async function startTestServer(workerToken = "test-worker-token") {
  process.env.WORKER_INTERNAL_TOKEN = workerToken;
  const app = createApiApp({ now: () => new Date("2026-02-23T00:00:00.000Z") });
  const server = app.listen(0);
  servers.push(server);
  const { port } = server.address() as AddressInfo;
  return { base: `http://127.0.0.1:${port}`, workerToken };
}

async function createJob(base: string, subjectId: string, tool = "compress", options?: Record<string, unknown>) {
  const init = await fetch(`${base}/api/uploads/init`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      subjectId,
      filename: "listing.jpg",
      mime: "image/jpeg",
      size: 300000,
      tool
    })
  });
  const upload = await init.json();

  const create = await fetch(`${base}/api/jobs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      subjectId,
      tool,
      inputObjectKey: upload.objectKey,
      options: options || {}
    })
  });

  expect(create.status).toBe(201);
  return create.json();
}

describe("internal worker queue lifecycle", () => {
  it("requires worker token for internal claim", async () => {
    const { base } = await startTestServer();
    const claim = await fetch(`${base}/api/internal/queue/claim`, {
      method: "POST",
      headers: { "x-worker-token": "wrong-token" }
    });

    expect(claim.status).toBe(401);
  });

  it("returns claimed false when queue is empty", async () => {
    const { base, workerToken } = await startTestServer();
    const claim = await fetch(`${base}/api/internal/queue/claim`, {
      method: "POST",
      headers: { "x-worker-token": workerToken }
    });

    expect(claim.status).toBe(200);
    const payload = await claim.json();
    expect(payload.claimed).toBe(false);
  });

  it("claims queued jobs and marks them running", async () => {
    const { base, workerToken } = await startTestServer();
    const job = await createJob(base, "seller_1");

    const claim = await fetch(`${base}/api/internal/queue/claim`, {
      method: "POST",
      headers: { "x-worker-token": workerToken }
    });
    expect(claim.status).toBe(200);
    const claimed = await claim.json();
    expect(claimed.claimed).toBe(true);
    expect(claimed.job.id).toBe(job.id);
    expect(claimed.job.status).toBe("running");

    const status = await fetch(`${base}/api/jobs/${job.id}`);
    const statusPayload = await status.json();
    expect(statusPayload.status).toBe("running");
    expect(statusPayload.queuePosition).toBe(null);
  });

  it("completes running jobs as done", async () => {
    const { base, workerToken } = await startTestServer();
    const job = await createJob(base, "seller_2");

    await fetch(`${base}/api/internal/queue/claim`, {
      method: "POST",
      headers: { "x-worker-token": workerToken }
    });

    const complete = await fetch(`${base}/api/internal/jobs/${job.id}/complete`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-worker-token": workerToken
      },
      body: JSON.stringify({
        success: true,
        outputObjectKey: `tmp/seller_2/processed/${job.id}.jpg`
      })
    });

    expect(complete.status).toBe(200);
    const payload = await complete.json();
    expect(payload.status).toBe("done");
    expect(payload.outputObjectKey).toContain(job.id);
  });

  it("completes running jobs as failed", async () => {
    const { base, workerToken } = await startTestServer();
    const job = await createJob(base, "seller_3");

    await fetch(`${base}/api/internal/queue/claim`, {
      method: "POST",
      headers: { "x-worker-token": workerToken }
    });

    const complete = await fetch(`${base}/api/internal/jobs/${job.id}/complete`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-worker-token": workerToken
      },
      body: JSON.stringify({
        success: false,
        errorCode: "SIMULATED_WORKER_FAILURE"
      })
    });

    expect(complete.status).toBe(200);
    const payload = await complete.json();
    expect(payload.status).toBe("failed");
    expect(payload.errorCode).toBe("SIMULATED_WORKER_FAILURE");
  });

  it("rejects completion when job is not running", async () => {
    const { base, workerToken } = await startTestServer();
    const job = await createJob(base, "seller_4");

    const complete = await fetch(`${base}/api/internal/jobs/${job.id}/complete`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-worker-token": workerToken
      },
      body: JSON.stringify({
        success: true,
        outputObjectKey: `tmp/seller_4/processed/${job.id}.jpg`
      })
    });

    expect(complete.status).toBe(409);
    const payload = await complete.json();
    expect(payload.error).toBe("JOB_NOT_RUNNING");
  });
});
