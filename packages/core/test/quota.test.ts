import { describe, expect, it } from "vitest";
import {
  applyQuota,
  checkAndIncrementQuota,
  cleanupRequestSignature,
  FREE_PLAN_LIMIT,
  FREE_PLAN_WINDOW_HOURS,
  isAdvancedTool,
  normalizeObjectKeys,
  shouldApplyWatermark,
  toStructuredLog
} from "../src";

describe("quota", () => {
  it("allows up to limit within active window", () => {
    const now = new Date("2026-02-23T00:00:00.000Z");
    const result = applyQuota({ windowStartAt: now.toISOString(), usedCount: FREE_PLAN_LIMIT - 1 }, 1, now);
    expect(result.allowed).toBe(true);
    expect(result.window.usedCount).toBe(FREE_PLAN_LIMIT);
  });

  it("blocks requests exceeding free limit", () => {
    const now = new Date("2026-02-23T00:00:00.000Z");
    const result = applyQuota({ windowStartAt: now.toISOString(), usedCount: FREE_PLAN_LIMIT }, 1, now);
    expect(result.allowed).toBe(false);
    expect(result.nextWindowStartAt).toBe("2026-02-23T10:00:00.000Z");
  });

  it("resets quota after 10-hour window expires", () => {
    const start = new Date("2026-02-23T00:00:00.000Z");
    const now = new Date(start.getTime() + (FREE_PLAN_WINDOW_HOURS + 1) * 60 * 60 * 1000);
    const result = applyQuota({ windowStartAt: start.toISOString(), usedCount: FREE_PLAN_LIMIT }, 1, now);

    expect(result.allowed).toBe(true);
    expect(result.window.usedCount).toBe(1);
    expect(result.window.windowStartAt).toBe(now.toISOString());
  });

  it("supports custom quota limits and windows", () => {
    const start = new Date("2026-02-23T00:00:00.000Z");
    const withinWindow = new Date("2026-02-23T23:00:00.000Z");
    const pastWindow = new Date("2026-02-24T01:00:00.000Z");

    const blocked = applyQuota(
      { windowStartAt: start.toISOString(), usedCount: 2 },
      1,
      withinWindow,
      2,
      24
    );
    expect(blocked.allowed).toBe(false);
    expect(blocked.nextWindowStartAt).toBe("2026-02-24T00:00:00.000Z");

    const reset = applyQuota(
      { windowStartAt: start.toISOString(), usedCount: 2 },
      1,
      pastWindow,
      2,
      24
    );
    expect(reset.allowed).toBe(true);
    expect(reset.window.usedCount).toBe(1);
    expect(reset.window.windowStartAt).toBe(pastWindow.toISOString());
  });

  it("rejects negative requestedImages", () => {
    const now = new Date("2026-02-23T00:00:00.000Z");
    expect(() =>
      applyQuota({ windowStartAt: now.toISOString(), usedCount: 1 }, -1, now)
    ).toThrow("requestedImages must be non-negative");
  });

  it("rejects non-positive quota window seconds for Redis quota checks", async () => {
    const redis = {
      script: async () => {
        throw new Error("should not load script for invalid window");
      },
      evalsha: async () => {
        throw new Error("should not eval for invalid window");
      }
    };

    await expect(checkAndIncrementQuota(redis, "seller_invalid", 1, 0)).rejects.toThrow(
      "windowSeconds must be a positive number"
    );
  });
});

describe("watermark", () => {
  it("applies watermark for free advanced tools", () => {
    expect(shouldApplyWatermark("free", true)).toBe(true);
  });

  it("skips watermark for free basic tools", () => {
    expect(shouldApplyWatermark("free", false)).toBe(false);
  });

  it("skips watermark for paid plans", () => {
    expect(shouldApplyWatermark("pro", true)).toBe(false);
  });

  it("marks only background-remove as advanced", () => {
    expect(isAdvancedTool("background-remove")).toBe(true);
    expect(isAdvancedTool("compress")).toBe(false);
  });
});

describe("cleanup helpers", () => {
  it("builds stable request signatures", () => {
    const one = cleanupRequestSignature(["b", "a", "a"]);
    const two = cleanupRequestSignature(["a", "b"]);
    expect(one).toBe(two);
  });

  it("normalizes object key arrays", () => {
    expect(normalizeObjectKeys(["a", " ", "a", "b"])).toEqual(["a", "b"]);
    expect(normalizeObjectKeys(null)).toEqual([]);
  });
});

describe("structured log privacy guards", () => {
  it("redacts secret-like keys and signed-url query values", () => {
    const raw = toStructuredLog("test.event", {
      token: "abc123",
      authToken: "secret-token",
      signedUrl: "https://example.test/file?X-Amz-Signature=abcdef&token=xyz",
      uploadUrl: "https://example.test/file?X-Amz-Signature=abcdef&token=xyz",
      nested: {
        apiKey: "k-12345",
        authorization: "Bearer secret"
      }
    });

    const payload = JSON.parse(raw).payload as Record<string, unknown>;
    expect(payload.token).toBe("[REDACTED]");
    expect(payload.authToken).toBe("[REDACTED]");
    expect(payload.signedUrl).toBe("[REDACTED]");
    expect(payload.uploadUrl).toBe("https://example.test/file?X-Amz-Signature=[REDACTED]&token=[REDACTED]");
    expect(payload.nested).toEqual({
      apiKey: "[REDACTED]",
      authorization: "[REDACTED]"
    });
  });

  it("replaces binary payloads with redacted markers", () => {
    const raw = toStructuredLog("test.binary", {
      bytes: Buffer.from([1, 2, 3, 4]),
      nested: { view: new Uint8Array([5, 6, 7]) }
    });

    const payload = JSON.parse(raw).payload as Record<string, unknown>;
    expect(payload.bytes).toBe("[BINARY_REDACTED length=4]");
    expect(payload.nested).toEqual({ view: "[BINARY_REDACTED length=3]" });
  });
});
