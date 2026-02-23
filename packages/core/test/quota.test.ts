import { describe, expect, it } from "vitest";
import {
  applyQuota,
  cleanupRequestSignature,
  FREE_PLAN_LIMIT,
  FREE_PLAN_WINDOW_HOURS,
  isAdvancedTool,
  normalizeObjectKeys,
  shouldApplyWatermark
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
