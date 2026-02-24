import { describe, expect, it, vi } from "vitest";
import { createTestConfig, createFakeServices } from "./helpers/fakes";
import { startApiTestServer } from "./helpers/server";

describe("observability routes", () => {
  it("returns ready when storage and repository probes succeed", async () => {
    const config = createTestConfig();
    const services = createFakeServices();
    const server = await startApiTestServer({ config, ...services });

    try {
      const response = await fetch(`${server.baseUrl}/ready`);
      expect(response.status).toBe(200);

      const body = await response.json() as {
        status: string;
        checks: {
          storage: { status: string };
          jobRepo: { status: string };
        };
      };

      expect(body.status).toBe("ready");
      expect(body.checks.storage.status).toBe("ok");
      expect(body.checks.jobRepo.status).toBe("ok");
    } finally {
      await server.close();
    }
  });

  it("returns degraded when a dependency probe fails", async () => {
    const config = createTestConfig();
    const services = createFakeServices();
    vi.spyOn(services.storage, "headObject").mockRejectedValueOnce(new Error("storage unavailable"));
    const server = await startApiTestServer({ config, ...services });

    try {
      const response = await fetch(`${server.baseUrl}/ready`);
      expect(response.status).toBe(503);

      const body = await response.json() as {
        status: string;
        checks: {
          storage: { status: string; message?: string };
          jobRepo: { status: string };
        };
      };

      expect(body.status).toBe("degraded");
      expect(body.checks.storage.status).toBe("error");
      expect(body.checks.storage.message).toContain("storage unavailable");
      expect(body.checks.jobRepo.status).toBe("ok");
    } finally {
      await server.close();
    }
  });

  it("exports Prometheus-style metrics", async () => {
    const config = createTestConfig();
    const services = createFakeServices();
    const server = await startApiTestServer({ config, ...services });

    try {
      await fetch(`${server.baseUrl}/health`);
      await fetch(`${server.baseUrl}/ready`);

      const response = await fetch(`${server.baseUrl}/metrics`);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/plain");

      const metrics = await response.text();
      expect(metrics).toContain("image_ops_up 1");
      expect(metrics).toContain("image_ops_http_requests_total{method=\"GET\",path=\"/health\",status_code=\"200\"} 1");
      expect(metrics).toContain("image_ops_http_requests_total{method=\"GET\",path=\"/ready\",status_code=\"200\"} 1");
      expect(metrics).toMatch(/image_ops_http_in_flight_requests [1-9]\d*/);
    } finally {
      await server.close();
    }
  });
});
