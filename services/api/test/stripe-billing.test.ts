import { describe, expect, it, vi } from "vitest";
import { StripeBillingService } from "../src/services/billing";

describe("StripeBillingService", () => {
  it("creates checkout session using Stripe API", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers || {});
      expect(headers.get("authorization")).toBe("Bearer sk_test_key");
      expect(headers.get("content-type")).toBe("application/x-www-form-urlencoded");

      const body = String(init?.body || "");
      expect(body).toContain("line_items%5B0%5D%5Bprice%5D=price_pro");
      expect(body).toContain("metadata%5BsubjectId%5D=seller_1");
      expect(body).toContain("metadata%5Bplan%5D=pro");

      return new Response(JSON.stringify({
        id: "cs_test_123",
        url: "https://checkout.stripe.com/c/pay/cs_test_123",
        expires_at: 1760000000
      }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    });

    const service = new StripeBillingService({
      secretKey: "sk_test_key",
      webhookSecret: "whsec_test",
      priceIdByPlan: {
        pro: "price_pro",
        team: "price_team"
      },
      fetchImpl: fetchMock as unknown as typeof fetch
    });

    const output = await service.createCheckoutSession({
      subjectId: "seller_1",
      plan: "pro",
      successUrl: "https://example.com/success",
      cancelUrl: "https://example.com/cancel",
      now: new Date("2026-02-23T00:00:00.000Z"),
      ttlSeconds: 900
    });

    expect(output.providerSessionId).toBe("cs_test_123");
    expect(output.checkoutUrl).toContain("checkout.stripe.com");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("verifies and parses checkout.session.completed webhook", () => {
    const service = new StripeBillingService({
      secretKey: "sk_test_key",
      webhookSecret: "whsec_test",
      priceIdByPlan: {
        pro: "price_pro",
        team: "price_team"
      }
    });

    const payload = JSON.stringify({
      id: "evt_1",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_live_1",
          metadata: {
            subjectId: "seller_2",
            plan: "team"
          }
        }
      }
    });

    const signature = service.signWebhookPayload(payload);
    expect(service.verifyWebhookSignature(payload, signature)).toBe(true);

    const parsed = service.parseWebhookPayload(payload);
    expect(parsed).toEqual({
      eventId: "evt_1",
      checkoutSessionId: "cs_live_1",
      subjectId: "seller_2",
      plan: "team",
      status: "paid"
    });
  });

  it("ignores unsupported Stripe events", () => {
    const service = new StripeBillingService({
      secretKey: "sk_test_key",
      webhookSecret: "whsec_test",
      priceIdByPlan: {
        pro: "price_pro",
        team: "price_team"
      }
    });

    const parsed = service.parseWebhookPayload(JSON.stringify({
      id: "evt_2",
      type: "invoice.created",
      data: { object: { id: "in_1" } }
    }));

    expect(parsed).toBeNull();
  });

  it("rejects signatures outside replay tolerance window", () => {
    const issuedAtMs = Date.parse("2026-02-23T00:00:00.000Z");
    const payload = JSON.stringify({
      id: "evt_old",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_live_2",
          metadata: {
            subjectId: "seller_3",
            plan: "pro"
          }
        }
      }
    });

    const signer = new StripeBillingService({
      secretKey: "sk_test_key",
      webhookSecret: "whsec_test",
      webhookToleranceSeconds: 300,
      priceIdByPlan: { pro: "price_pro", team: "price_team" },
      nowProvider: () => issuedAtMs
    });

    const verifier = new StripeBillingService({
      secretKey: "sk_test_key",
      webhookSecret: "whsec_test",
      webhookToleranceSeconds: 300,
      priceIdByPlan: { pro: "price_pro", team: "price_team" },
      nowProvider: () => issuedAtMs + 10 * 60 * 1000
    });

    const signature = signer.signWebhookPayload(payload);
    expect(verifier.verifyWebhookSignature(payload, signature)).toBe(false);
  });
});
