import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpBackgroundRemoveProvider, NonRetryableProviderError } from "../src/providers/bg-remove-provider";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("HttpBackgroundRemoveProvider", () => {
  it("returns processed bytes on success", async () => {
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

    global.fetch = vi.fn(async () =>
      new Response(pngBytes, {
        status: 200,
        headers: { "content-type": "image/png" }
      })
    ) as typeof fetch;

    const provider = new HttpBackgroundRemoveProvider({
      endpointUrl: "https://bg-provider.test/remove",
      timeoutMs: 1000,
      maxRetries: 1
    });

    const result = await provider.removeBackground({
      bytes: Buffer.from("input"),
      contentType: "image/jpeg"
    });

    expect(result.contentType).toBe("image/png");
    expect(result.bytes.length).toBeGreaterThan(0);
  });

  it("retries on transient failures", async () => {
    let attempts = 0;
    global.fetch = vi.fn(async () => {
      attempts += 1;
      if (attempts < 3) {
        return new Response("fail", { status: 500 });
      }
      return new Response(Buffer.from("ok"), {
        status: 200,
        headers: { "content-type": "image/png" }
      });
    }) as typeof fetch;

    const provider = new HttpBackgroundRemoveProvider({
      endpointUrl: "https://bg-provider.test/remove",
      timeoutMs: 1000,
      maxRetries: 3
    });

    const result = await provider.removeBackground({
      bytes: Buffer.from("input"),
      contentType: "image/jpeg"
    });

    expect(result.contentType).toBe("image/png");
    expect(attempts).toBe(3);
  });

  it("throws after max retries", async () => {
    global.fetch = vi.fn(async () => new Response("fail", { status: 500 })) as typeof fetch;

    const provider = new HttpBackgroundRemoveProvider({
      endpointUrl: "https://bg-provider.test/remove",
      timeoutMs: 1000,
      maxRetries: 1
    });

    await expect(
      provider.removeBackground({
        bytes: Buffer.from("input"),
        contentType: "image/jpeg"
      })
    ).rejects.toThrow(/after retries/i);
  });

  it("does not retry on non-retryable 4xx responses", async () => {
    let attempts = 0;
    global.fetch = vi.fn(async () => {
      attempts += 1;
      return new Response("bad request", { status: 400 });
    }) as typeof fetch;

    const provider = new HttpBackgroundRemoveProvider({
      endpointUrl: "https://bg-provider.test/remove",
      timeoutMs: 1000,
      maxRetries: 3
    });

    await expect(
      provider.removeBackground({
        bytes: Buffer.from("input"),
        contentType: "image/jpeg"
      })
    ).rejects.toBeInstanceOf(NonRetryableProviderError);
    expect(attempts).toBe(1);
  });

  it("retries rate-limited responses and emits retry telemetry", async () => {
    let attempts = 0;
    const retries: string[] = [];
    global.fetch = vi.fn(async () => {
      attempts += 1;
      if (attempts < 3) {
        return new Response("rate limited", { status: 429 });
      }
      return new Response(Buffer.from("ok"), {
        status: 200,
        headers: { "content-type": "image/png" }
      });
    }) as typeof fetch;

    const provider = new HttpBackgroundRemoveProvider({
      endpointUrl: "https://bg-provider.test/remove",
      timeoutMs: 1000,
      maxRetries: 3,
      backoffBaseMs: 1,
      backoffMaxMs: 2,
      onRetry: ({ reason }) => retries.push(reason)
    });

    const result = await provider.removeBackground({
      bytes: Buffer.from("input"),
      contentType: "image/jpeg"
    });

    expect(result.contentType).toBe("image/png");
    expect(attempts).toBe(3);
    expect(retries.length).toBe(2);
    expect(retries[0]).toContain("429");
  });
});
