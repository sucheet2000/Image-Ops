import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestConfig, createFakeServices } from "./helpers/fakes";
import { bearerAuthHeaders } from "./helpers/auth";
import { logError, logInfo, resetLogBuffer } from "../src/lib/log";
import { startApiTestServer } from "./helpers/server";

describe("observability routes", () => {
  afterEach(() => {
    resetLogBuffer();
  });

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
      const previousMetricsToken = process.env.METRICS_TOKEN;
      try {
        process.env.METRICS_TOKEN = "test-metrics-token";

        await fetch(`${server.baseUrl}/health`);
        await fetch(`${server.baseUrl}/ready`);

        const unauthorizedResponse = await fetch(`${server.baseUrl}/metrics`);
        expect(unauthorizedResponse.status).toBe(401);
        expect(unauthorizedResponse.headers.get("www-authenticate")).toBe('Bearer realm="metrics", error="invalid_token"');

        const response = await fetch(`${server.baseUrl}/metrics`, {
          headers: {
            authorization: `Bearer ${process.env.METRICS_TOKEN}`
          }
        });
        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toContain("text/plain");

        const metrics = await response.text();
        expect(metrics).toContain("image_ops_up 1");
        expect(metrics).toContain("image_ops_http_requests_total{method=\"GET\",path=\"/health\",status_code=\"200\"} 1");
        expect(metrics).toContain("image_ops_http_requests_total{method=\"GET\",path=\"/ready\",status_code=\"200\"} 1");
        expect(metrics).toMatch(/image_ops_http_in_flight_requests [1-9]\d*/);
      } finally {
        if (previousMetricsToken === undefined) {
          delete process.env.METRICS_TOKEN;
        } else {
          process.env.METRICS_TOKEN = previousMetricsToken;
        }
      }
    } finally {
      await server.close();
    }
  });

  it("returns 401 for an invalid metrics bearer token", async () => {
    const config = createTestConfig();
    const services = createFakeServices();
    const server = await startApiTestServer({ config, ...services });

    try {
      const previousMetricsToken = process.env.METRICS_TOKEN;
      try {
        process.env.METRICS_TOKEN = "test-metrics-token";

        const response = await fetch(`${server.baseUrl}/metrics`, {
          headers: {
            authorization: "Bearer test-metrics-tokfn"
          }
        });

        expect(response.status).toBe(401);
        expect(response.headers.get("www-authenticate")).toBe('Bearer realm="metrics", error="invalid_token"');
      } finally {
        if (previousMetricsToken === undefined) {
          delete process.env.METRICS_TOKEN;
        } else {
          process.env.METRICS_TOKEN = previousMetricsToken;
        }
      }
    } finally {
      await server.close();
    }
  });

  it("returns buffered logs for watch tower with counts", async () => {
    const config = createTestConfig();
    const services = createFakeServices();
    const server = await startApiTestServer({ config, ...services });

    try {
      logInfo("watchtower.info", { phase: "boot" });
      logError("watchtower.error", { issue: "queue stalled" });

      const response = await fetch(`${server.baseUrl}/api/observability/logs?limit=10`, {
        headers: { ...bearerAuthHeaders("observer_1") }
      });
      expect(response.status).toBe(200);

      const body = await response.json() as {
        summary: { total: number; info: number; error: number };
        logs: Array<{ level: "info" | "error"; event: string; payload: Record<string, unknown> }>;
      };
      expect(body.summary.total).toBeGreaterThanOrEqual(2);
      expect(body.summary.info).toBeGreaterThanOrEqual(1);
      expect(body.summary.error).toBeGreaterThanOrEqual(1);
      expect(body.logs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            level: "info",
            event: "watchtower.info",
            payload: expect.objectContaining({ phase: "boot" })
          }),
          expect.objectContaining({
            level: "error",
            event: "watchtower.error",
            payload: expect.objectContaining({ issue: "queue stalled" })
          })
        ])
      );
    } finally {
      await server.close();
    }
  });

  it("filters watch tower logs by severity", async () => {
    const config = createTestConfig();
    const services = createFakeServices();
    const server = await startApiTestServer({ config, ...services });

    try {
      logInfo("watchtower.info", { phase: "boot" });
      logError("watchtower.error", { issue: "queue stalled" });

      const response = await fetch(`${server.baseUrl}/api/observability/logs?level=error&limit=10`, {
        headers: { ...bearerAuthHeaders("observer_1") }
      });
      expect(response.status).toBe(200);

      const body = await response.json() as {
        logs: Array<{ level: "info" | "error"; event: string }>;
      };
      expect(body.logs.length).toBeGreaterThan(0);
      expect(body.logs.every((entry) => entry.level === "error")).toBe(true);
      expect(body.logs.some((entry) => entry.event === "watchtower.error")).toBe(true);
      expect(body.logs.some((entry) => entry.event === "watchtower.info")).toBe(false);
    } finally {
      await server.close();
    }
  });
});
