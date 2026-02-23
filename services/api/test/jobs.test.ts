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

async function initUpload(base: string, subjectId: string) {
  const response = await fetch(`${base}/api/uploads/init`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      subjectId,
      filename: "listing.jpg",
      mime: "image/jpeg",
      size: 350000,
      tool: "compress"
    })
  });

  expect(response.status).toBe(201);
  return response.json();
}

describe("jobs endpoints", () => {
  it("creates a queued job from a valid upload object key", async () => {
    const base = await startTestServer();
    const upload = await initUpload(base, "seller_1");

    const create = await fetch(`${base}/api/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subjectId: "seller_1",
        tool: "compress",
        inputObjectKey: upload.objectKey,
        options: { quality: 80 }
      })
    });

    expect(create.status).toBe(201);
    const payload = await create.json();
    expect(payload.id).toContain("job_");
    expect(payload.status).toBe("queued");
    expect(payload.queuePosition).toBe(1);
  });

  it("rejects unsupported tools", async () => {
    const base = await startTestServer();
    const upload = await initUpload(base, "seller_2");

    const create = await fetch(`${base}/api/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subjectId: "seller_2",
        tool: "upscale-ai",
        inputObjectKey: upload.objectKey
      })
    });

    expect(create.status).toBe(400);
    const payload = await create.json();
    expect(payload.error).toBe("UNSUPPORTED_TOOL");
  });

  it("rejects missing input object key", async () => {
    const base = await startTestServer();

    const create = await fetch(`${base}/api/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subjectId: "seller_3",
        tool: "compress",
        inputObjectKey: "tmp/seller_3/missing.jpg"
      })
    });

    expect(create.status).toBe(404);
    const payload = await create.json();
    expect(payload.error).toBe("INPUT_OBJECT_NOT_FOUND");
  });

  it("rejects object ownership mismatch", async () => {
    const base = await startTestServer();
    const upload = await initUpload(base, "seller_4");

    const create = await fetch(`${base}/api/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subjectId: "seller_5",
        tool: "compress",
        inputObjectKey: upload.objectKey
      })
    });

    expect(create.status).toBe(403);
    const payload = await create.json();
    expect(payload.error).toBe("INPUT_OBJECT_FORBIDDEN");
  });

  it("returns job status for created jobs", async () => {
    const base = await startTestServer();
    const upload = await initUpload(base, "seller_6");

    const create = await fetch(`${base}/api/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subjectId: "seller_6",
        tool: "resize",
        inputObjectKey: upload.objectKey
      })
    });
    const job = await create.json();

    const getStatus = await fetch(`${base}/api/jobs/${job.id}`);
    expect(getStatus.status).toBe(200);
    const statusPayload = await getStatus.json();
    expect(statusPayload.id).toBe(job.id);
    expect(statusPayload.status).toBe("queued");
    expect(statusPayload.queuePosition).toBe(1);
  });

  it("returns 404 for unknown jobs", async () => {
    const base = await startTestServer();
    const getStatus = await fetch(`${base}/api/jobs/job_missing`);
    expect(getStatus.status).toBe(404);
    const payload = await getStatus.json();
    expect(payload.error).toBe("JOB_NOT_FOUND");
  });
});
