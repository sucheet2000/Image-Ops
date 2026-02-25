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

describe("GET /api/jobs/:id", () => {
  it("returns done job with signed download URL", async () => {
    const services = createFakeServices();
    const now = () => new Date("2026-02-23T00:00:00.000Z");

    await services.jobRepo.createJob({
      id: "01JSTATUSDONE",
      subjectId: "seller_1",
      tool: "convert",
      plan: "pro",
      isAdvanced: false,
      watermarkRequired: false,
      inputObjectKey: "tmp/seller_1/input.jpg",
      outputObjectKey: "tmp/seller_1/output.jpg",
      inputMime: "image/jpeg",
      outputMime: "image/webp",
      options: { format: "webp", quality: 80 },
      status: "done",
      createdAt: now().toISOString(),
      updatedAt: now().toISOString()
    });

    const server = await startApiTestServer({ ...services, config: createTestConfig(), now });
    closers.push(server.close);

    const response = await fetch(`${server.baseUrl}/api/jobs/01JSTATUSDONE`, {
      headers: { ...bearerAuthHeaders("seller_1", "pro") }
    });
    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(payload.status).toBe("done");
    expect(payload.downloadUrl).toContain("download");
    expect(payload.downloadUrlExpiresAt).not.toBeNull();
  });

  it("does not return download URL for non-done jobs", async () => {
    const services = createFakeServices();
    const now = () => new Date("2026-02-23T00:00:00.000Z");

    await services.jobRepo.createJob({
      id: "01JSTATUSRUNNING",
      subjectId: "seller_1",
      tool: "compress",
      plan: "free",
      isAdvanced: false,
      watermarkRequired: false,
      inputObjectKey: "tmp/seller_1/input.jpg",
      outputObjectKey: "tmp/seller_1/output.jpg",
      inputMime: "image/jpeg",
      outputMime: "image/jpeg",
      options: { quality: 80 },
      status: "running",
      createdAt: now().toISOString(),
      updatedAt: now().toISOString()
    });

    const server = await startApiTestServer({ ...services, config: createTestConfig(), now });
    closers.push(server.close);

    const response = await fetch(`${server.baseUrl}/api/jobs/01JSTATUSRUNNING`, {
      headers: { ...bearerAuthHeaders("seller_1") }
    });
    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(payload.status).toBe("running");
    expect(payload.downloadUrl).toBeNull();
  });
});
