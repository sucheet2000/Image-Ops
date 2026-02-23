import { afterEach, describe, expect, it } from "vitest";
import { HmacBillingService } from "../src/services/billing";
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

describe("billing routes", () => {
  it("creates checkout session", async () => {
    const services = createFakeServices();
    const config = createTestConfig();
    const server = await startApiTestServer({ ...services, config });
    closers.push(server.close);

    const response = await fetch(`${server.baseUrl}/api/billing/checkout`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subjectId: "seller_1",
        plan: "pro",
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel"
      })
    });

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.checkoutSessionId).toContain("chk_");
    expect(payload.checkoutUrl).toContain("/billing/checkout");

    const stored = await services.jobRepo.getBillingCheckoutSession(payload.checkoutSessionId);
    expect(stored?.status).toBe("created");
    expect(stored?.plan).toBe("pro");
  });

  it("accepts paid webhook and upgrades plan", async () => {
    const services = createFakeServices();
    const config = createTestConfig();
    const server = await startApiTestServer({ ...services, config });
    closers.push(server.close);

    const checkoutResponse = await fetch(`${server.baseUrl}/api/billing/checkout`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subjectId: "seller_2",
        plan: "pro",
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel"
      })
    });

    expect(checkoutResponse.status).toBe(201);
    const checkoutPayload = await checkoutResponse.json();

    const webhookPayload = {
      eventId: "evt_paid_1",
      checkoutSessionId: checkoutPayload.checkoutSessionId,
      subjectId: "seller_2",
      plan: "pro",
      status: "paid"
    };

    const billing = new HmacBillingService({
      publicBaseUrl: config.billingPublicBaseUrl,
      providerSecret: config.billingProviderSecret,
      webhookSecret: config.billingWebhookSecret
    });

    const signature = billing.signWebhookPayload(JSON.stringify(webhookPayload));

    const webhookResponse = await fetch(`${server.baseUrl}/api/webhooks/billing`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-billing-signature": signature
      },
      body: JSON.stringify(webhookPayload)
    });

    expect(webhookResponse.status).toBe(200);
    const webhookBody = await webhookResponse.json();
    expect(webhookBody.accepted).toBe(true);
    expect(webhookBody.replay).toBe(false);

    const profile = await services.jobRepo.getSubjectProfile("seller_2");
    expect(profile?.plan).toBe("pro");

    const checkout = await services.jobRepo.getBillingCheckoutSession(checkoutPayload.checkoutSessionId);
    expect(checkout?.status).toBe("paid");

    const event = await services.jobRepo.getBillingWebhookEvent("evt_paid_1");
    expect(event?.status).toBe("paid");
  });

  it("rejects webhook with invalid signature", async () => {
    const services = createFakeServices();
    const server = await startApiTestServer({ ...services, config: createTestConfig() });
    closers.push(server.close);

    const response = await fetch(`${server.baseUrl}/api/webhooks/billing`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-billing-signature": "invalid"
      },
      body: JSON.stringify({
        eventId: "evt_bad_1",
        checkoutSessionId: "chk_x",
        subjectId: "seller_3",
        plan: "pro",
        status: "paid"
      })
    });

    expect(response.status).toBe(401);
    const payload = await response.json();
    expect(payload.error).toBe("INVALID_BILLING_SIGNATURE");
  });
});
