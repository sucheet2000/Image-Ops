import { describe, expect, it } from "vitest";
import { createFakeServices, createTestConfig } from "./helpers/fakes";
import { startApiTestServer } from "./helpers/server";

describe("api write rate limiting", () => {
  it("limits repeated upload init calls by IP within the configured window", async () => {
    const services = createFakeServices();
    const config = {
      ...createTestConfig(),
      apiWriteRateLimitMax: 2,
      apiWriteRateLimitWindowMs: 60_000
    };
    const server = await startApiTestServer({ ...services, config });

    try {
      const requestBody = {
        subjectId: "seller_rl",
        tool: "resize",
        filename: "sample.png",
        mime: "image/png",
        size: 100
      };

      const first = await fetch(`${server.baseUrl}/api/uploads/init`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestBody)
      });
      expect(first.status).toBe(201);

      const second = await fetch(`${server.baseUrl}/api/uploads/init`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestBody)
      });
      expect(second.status).toBe(201);

      const third = await fetch(`${server.baseUrl}/api/uploads/init`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestBody)
      });
      expect(third.status).toBe(429);
      expect(third.headers.get("retry-after")).toBe("60");
      const payload = await third.json();
      expect(payload.error).toBe("RATE_LIMITED");
    } finally {
      await server.close();
    }
  });
});
