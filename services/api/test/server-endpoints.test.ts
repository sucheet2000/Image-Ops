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

async function startTestServer(now: () => Date, workerToken = "test-worker-token") {
  process.env.WORKER_INTERNAL_TOKEN = workerToken;
  const app = createApiApp({ now });
  const server = app.listen(0);
  servers.push(server);
  const { port } = server.address() as AddressInfo;
  return { base: `http://127.0.0.1:${port}`, workerToken };
}

async function initUpload(base: string, subjectId: string, filename = "test.jpg") {
  const response = await fetch(`${base}/api/uploads/init`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      subjectId,
      filename,
      mime: "image/jpeg",
      size: 100000,
      tool: "compress"
    })
  });

  expect(response.status).toBe(201);
  return response.json();
}

describe("GET /health", () => {
  it("returns ok status with metrics", async () => {
    const { base } = await startTestServer(() => new Date("2026-02-23T00:00:00.000Z"));

    const response = await fetch(`${base}/health`);
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.status).toBe("ok");
    expect(payload.tempUploads).toBe(0);
    expect(payload.jobs).toBe(0);
    expect(payload.queueDepth).toBe(0);
    expect(payload.deletionAuditCount).toBe(0);
    expect(payload.purged).toBe(0);
  });

  it("reports correct counts after uploads", async () => {
    const { base } = await startTestServer(() => new Date("2026-02-23T00:00:00.000Z"));
    await initUpload(base, "seller_health_1");
    await initUpload(base, "seller_health_2");

    const response = await fetch(`${base}/health`);
    const payload = await response.json();
    expect(payload.tempUploads).toBe(2);
  });

  it("prunes expired uploads on health check", async () => {
    let currentTime = new Date("2026-02-23T00:00:00.000Z");
    const now = () => currentTime;
    const { base } = await startTestServer(now);

    await initUpload(base, "seller_health_expire");
    currentTime = new Date("2026-02-23T00:31:00.000Z");

    const response = await fetch(`${base}/health`);
    const payload = await response.json();
    expect(payload.purged).toBe(1);
    expect(payload.tempUploads).toBe(0);
  });
});

describe("GET /api/quota/:subjectId", () => {
  it("returns quota for subject ID from path", async () => {
    const { base } = await startTestServer(() => new Date("2026-02-23T00:00:00.000Z"));

    const response = await fetch(`${base}/api/quota/seller_123`);
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.subjectId).toBe("seller_123");
    expect(payload.limit).toBe(6);
    expect(payload.windowHours).toBe(10);
    expect(payload.usedCount).toBe(0);
  });

  it("sanitizes subject ID from path", async () => {
    const { base } = await startTestServer(() => new Date("2026-02-23T00:00:00.000Z"));

    const response = await fetch(`${base}/api/quota/`);
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.subjectId).toBe("anonymous");
  });
});

describe("GET /api/quota", () => {
  it("returns quota for subject ID from query param", async () => {
    const { base } = await startTestServer(() => new Date("2026-02-23T00:00:00.000Z"));

    const response = await fetch(`${base}/api/quota?subjectId=seller_456`);
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.subjectId).toBe("seller_456");
    expect(payload.limit).toBe(6);
  });

  it("requires subjectId query param", async () => {
    const { base } = await startTestServer(() => new Date("2026-02-23T00:00:00.000Z"));

    const response = await fetch(`${base}/api/quota`);
    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.error).toBe("SUBJECT_ID_REQUIRED");
  });

  it("rejects empty subjectId query param", async () => {
    const { base } = await startTestServer(() => new Date("2026-02-23T00:00:00.000Z"));

    const response = await fetch(`${base}/api/quota?subjectId=`);
    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.error).toBe("SUBJECT_ID_REQUIRED");
  });
});

describe("POST /api/quota/check", () => {
  it("allows request within quota", async () => {
    const { base } = await startTestServer(() => new Date("2026-02-23T00:00:00.000Z"));

    const response = await fetch(`${base}/api/quota/check`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subjectId: "seller_check_1",
        requestedImages: 3
      })
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.allowed).toBe(true);
    expect(payload.window.usedCount).toBe(3);
  });

  it("blocks request exceeding quota", async () => {
    const { base } = await startTestServer(() => new Date("2026-02-23T00:00:00.000Z"));

    const response = await fetch(`${base}/api/quota/check`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subjectId: "seller_check_2",
        requestedImages: 10
      })
    });

    expect(response.status).toBe(429);
    const payload = await response.json();
    expect(payload.error).toBe("FREE_PLAN_LIMIT_EXCEEDED");
    expect(payload.nextWindowStartAt).toBeDefined();
  });

  it("defaults to anonymous and 1 image if not specified", async () => {
    const { base } = await startTestServer(() => new Date("2026-02-23T00:00:00.000Z"));

    const response = await fetch(`${base}/api/quota/check`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({})
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.allowed).toBe(true);
    expect(payload.window.usedCount).toBe(1);
  });

  it("accumulates quota across multiple checks", async () => {
    const { base } = await startTestServer(() => new Date("2026-02-23T00:00:00.000Z"));

    for (let i = 0; i < 3; i++) {
      const response = await fetch(`${base}/api/quota/check`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subjectId: "seller_accumulate",
          requestedImages: 2
        })
      });

      if (i < 3) {
        expect(response.status).toBe(200);
      }
    }

    const blocked = await fetch(`${base}/api/quota/check`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subjectId: "seller_accumulate",
        requestedImages: 1
      })
    });

    expect(blocked.status).toBe(429);
  });
});

describe("GET /api/jobs/:id", () => {
  it("returns 404 for non-existent job", async () => {
    const { base } = await startTestServer(() => new Date("2026-02-23T00:00:00.000Z"));

    const response = await fetch(`${base}/api/jobs/job_nonexistent`);
    expect(response.status).toBe(404);
    const payload = await response.json();
    expect(payload.error).toBe("JOB_NOT_FOUND");
  });

  it("returns 404 for empty job ID", async () => {
    const { base } = await startTestServer(() => new Date("2026-02-23T00:00:00.000Z"));

    const response = await fetch(`${base}/api/jobs/`);
    expect(response.status).toBe(404);
  });
});

describe("POST /api/internal/queue/claim", () => {
  it("requires worker token", async () => {
    const { base } = await startTestServer(() => new Date("2026-02-23T00:00:00.000Z"));

    const response = await fetch(`${base}/api/internal/queue/claim`, {
      method: "POST"
    });

    expect(response.status).toBe(401);
    const payload = await response.json();
    expect(payload.error).toBe("UNAUTHORIZED_WORKER");
  });

  it("rejects invalid worker token", async () => {
    const { base } = await startTestServer(() => new Date("2026-02-23T00:00:00.000Z"), "valid-token");

    const response = await fetch(`${base}/api/internal/queue/claim`, {
      method: "POST",
      headers: { "x-worker-token": "invalid-token" }
    });

    expect(response.status).toBe(401);
    const payload = await response.json();
    expect(payload.error).toBe("UNAUTHORIZED_WORKER");
  });

  it("returns claimed false when queue is empty", async () => {
    const { base, workerToken } = await startTestServer(() => new Date("2026-02-23T00:00:00.000Z"));

    const response = await fetch(`${base}/api/internal/queue/claim`, {
      method: "POST",
      headers: { "x-worker-token": workerToken }
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.claimed).toBe(false);
  });
});

describe("POST /api/internal/jobs/:id/complete", () => {
  it("requires worker token", async () => {
    const { base } = await startTestServer(() => new Date("2026-02-23T00:00:00.000Z"));

    const response = await fetch(`${base}/api/internal/jobs/job_123/complete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ success: true, outputObjectKey: "output.jpg" })
    });

    expect(response.status).toBe(401);
    const payload = await response.json();
    expect(payload.error).toBe("UNAUTHORIZED_WORKER");
  });

  it("returns 404 for non-existent job", async () => {
    const { base, workerToken } = await startTestServer(() => new Date("2026-02-23T00:00:00.000Z"));

    const response = await fetch(`${base}/api/internal/jobs/job_nonexistent/complete`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-worker-token": workerToken
      },
      body: JSON.stringify({ success: true, outputObjectKey: "output.jpg" })
    });

    expect(response.status).toBe(404);
    const payload = await response.json();
    expect(payload.error).toBe("JOB_NOT_FOUND");
  });
});

describe("POST /api/internal/temp/sweep", () => {
  it("requires worker token", async () => {
    const { base } = await startTestServer(() => new Date("2026-02-23T00:00:00.000Z"));

    const response = await fetch(`${base}/api/internal/temp/sweep`, {
      method: "POST"
    });

    expect(response.status).toBe(401);
    const payload = await response.json();
    expect(payload.error).toBe("UNAUTHORIZED_WORKER");
  });

  it("returns swept count and timestamp", async () => {
    const { base, workerToken } = await startTestServer(() => new Date("2026-02-23T00:00:00.000Z"));

    const response = await fetch(`${base}/api/internal/temp/sweep`, {
      method: "POST",
      headers: { "x-worker-token": workerToken }
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.swept).toBe(0);
    expect(payload.deletionAuditCount).toBe(0);
    expect(payload.at).toBe("2026-02-23T00:00:00.000Z");
  });
});

describe("Quota window behavior", () => {
  it("resets quota after window expires", async () => {
    let currentTime = new Date("2026-02-23T00:00:00.000Z");
    const now = () => currentTime;
    const { base } = await startTestServer(now);

    for (let i = 0; i < 6; i++) {
      const response = await fetch(`${base}/api/uploads/init`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subjectId: "seller_window_reset",
          tool: "compress",
          filename: `file${i}.jpg`,
          mime: "image/jpeg",
          size: 50000
        })
      });
      expect(response.status).toBe(201);
    }

    const blocked = await fetch(`${base}/api/uploads/init`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subjectId: "seller_window_reset",
        tool: "compress",
        filename: "blocked.jpg",
        mime: "image/jpeg",
        size: 50000
      })
    });
    expect(blocked.status).toBe(429);

    currentTime = new Date("2026-02-23T10:01:00.000Z");

    const afterReset = await fetch(`${base}/api/uploads/init`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subjectId: "seller_window_reset",
        tool: "compress",
        filename: "after.jpg",
        mime: "image/jpeg",
        size: 50000
      })
    });
    expect(afterReset.status).toBe(201);
  });

  it("maintains separate quota windows per subject", async () => {
    const { base } = await startTestServer(() => new Date("2026-02-23T00:00:00.000Z"));

    for (let i = 0; i < 6; i++) {
      const response = await fetch(`${base}/api/uploads/init`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subjectId: "seller_separate_1",
          tool: "compress",
          filename: `file${i}.jpg`,
          mime: "image/jpeg",
          size: 50000
        })
      });
      expect(response.status).toBe(201);
    }

    const differentSubject = await fetch(`${base}/api/uploads/init`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subjectId: "seller_separate_2",
        tool: "compress",
        filename: "file.jpg",
        mime: "image/jpeg",
        size: 50000
      })
    });
    expect(differentSubject.status).toBe(201);
  });
});

describe("Edge cases and error handling", () => {
  it("handles malformed JSON in request body", async () => {
    const { base } = await startTestServer(() => new Date("2026-02-23T00:00:00.000Z"));

    const response = await fetch(`${base}/api/uploads/init`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not valid json"
    });

    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it("prunes expired uploads before quota check", async () => {
    let currentTime = new Date("2026-02-23T00:00:00.000Z");
    const now = () => currentTime;
    const { base } = await startTestServer(now);

    await initUpload(base, "seller_prune_quota");
    currentTime = new Date("2026-02-23T00:31:00.000Z");

    const quota = await fetch(`${base}/api/quota/seller_prune_quota`);
    const payload = await quota.json();
    expect(payload.usedCount).toBe(0);
  });

  it("handles concurrent requests to same subject", async () => {
    const { base } = await startTestServer(() => new Date("2026-02-23T00:00:00.000Z"));

    const promises = Array.from({ length: 3 }, () =>
      fetch(`${base}/api/quota/check`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subjectId: "seller_concurrent",
          requestedImages: 3
        })
      })
    );

    const responses = await Promise.all(promises);
    const payloads = await Promise.all(responses.map((r) => r.json()));

    const allowedCount = payloads.filter((p) => p.allowed).length;
    expect(allowedCount).toBeGreaterThanOrEqual(1);
  });
});