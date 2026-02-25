import { afterEach, describe, expect, it } from 'vitest';
import { HmacBillingService, StripeBillingService } from '../src/services/billing';
import { bearerAuthHeaders } from './helpers/auth';
import { createFakeServices, createTestConfig } from './helpers/fakes';
import { startApiTestServer } from './helpers/server';

const closers: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (closers.length > 0) {
    const close = closers.pop();
    if (close) {
      await close();
    }
  }
});

describe('billing routes', () => {
  it('creates checkout session', async () => {
    const services = createFakeServices();
    const config = createTestConfig();
    const server = await startApiTestServer({ ...services, config });
    closers.push(server.close);

    const response = await fetch(`${server.baseUrl}/api/billing/checkout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...bearerAuthHeaders('seller_1') },
      body: JSON.stringify({
        subjectId: 'seller_1',
        plan: 'pro',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
      }),
    });

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.checkoutSessionId).toContain('chk_');
    expect(payload.checkoutUrl).toContain('/billing/checkout');

    const stored = await services.jobRepo.getBillingCheckoutSession(payload.checkoutSessionId);
    expect(stored?.status).toBe('created');
    expect(stored?.plan).toBe('pro');
  });

  it('rejects checkout when authenticated subject does not match body subjectId', async () => {
    const services = createFakeServices();
    const config = createTestConfig();
    const server = await startApiTestServer({ ...services, config });
    closers.push(server.close);

    const response = await fetch(`${server.baseUrl}/api/billing/checkout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...bearerAuthHeaders('seller_auth') },
      body: JSON.stringify({
        subjectId: 'seller_other',
        plan: 'pro',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
      }),
    });

    expect(response.status).toBe(403);
    const payload = await response.json();
    expect(payload.error).toBe('BILLING_SUBJECT_FORBIDDEN');
  });

  it('accepts paid webhook and upgrades plan', async () => {
    const services = createFakeServices();
    const config = createTestConfig();
    const server = await startApiTestServer({ ...services, config });
    closers.push(server.close);

    const checkoutResponse = await fetch(`${server.baseUrl}/api/billing/checkout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...bearerAuthHeaders('seller_2') },
      body: JSON.stringify({
        subjectId: 'seller_2',
        plan: 'pro',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
      }),
    });

    expect(checkoutResponse.status).toBe(201);
    const checkoutPayload = await checkoutResponse.json();

    const webhookPayload = {
      eventId: 'evt_paid_1',
      checkoutSessionId: checkoutPayload.checkoutSessionId,
      subjectId: 'seller_2',
      plan: 'pro',
      status: 'paid',
    };

    const billing = new HmacBillingService({
      publicBaseUrl: config.billingPublicBaseUrl,
      providerSecret: config.billingProviderSecret,
      webhookSecret: config.billingWebhookSecret,
    });

    const signature = billing.signWebhookPayload(JSON.stringify(webhookPayload));

    const webhookResponse = await fetch(`${server.baseUrl}/api/webhooks/billing`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-billing-signature': signature,
      },
      body: JSON.stringify(webhookPayload),
    });

    expect(webhookResponse.status).toBe(200);
    const webhookBody = await webhookResponse.json();
    expect(webhookBody.accepted).toBe(true);
    expect(webhookBody.replay).toBe(false);

    const profile = await services.jobRepo.getSubjectProfile('seller_2');
    expect(profile?.plan).toBe('pro');

    const checkout = await services.jobRepo.getBillingCheckoutSession(
      checkoutPayload.checkoutSessionId
    );
    expect(checkout?.status).toBe('paid');

    const event = await services.jobRepo.getBillingWebhookEvent('evt_paid_1');
    expect(event?.status).toBe('paid');
  });

  it('rejects webhook with invalid signature', async () => {
    const services = createFakeServices();
    const server = await startApiTestServer({ ...services, config: createTestConfig() });
    closers.push(server.close);

    const response = await fetch(`${server.baseUrl}/api/webhooks/billing`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-billing-signature': 'invalid',
      },
      body: JSON.stringify({
        eventId: 'evt_bad_1',
        checkoutSessionId: 'chk_x',
        subjectId: 'seller_3',
        plan: 'pro',
        status: 'paid',
      }),
    });

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.error).toBe('INVALID_SIGNATURE');
  });

  it('treats repeated provider events as idempotent replays', async () => {
    const services = createFakeServices();
    const config = createTestConfig();
    const server = await startApiTestServer({ ...services, config });
    closers.push(server.close);

    const checkoutResponse = await fetch(`${server.baseUrl}/api/billing/checkout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...bearerAuthHeaders('seller_4') },
      body: JSON.stringify({
        subjectId: 'seller_4',
        plan: 'team',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
      }),
    });
    expect(checkoutResponse.status).toBe(201);
    const checkoutPayload = await checkoutResponse.json();

    const webhookPayload = {
      eventId: 'evt_replay_1',
      checkoutSessionId: checkoutPayload.checkoutSessionId,
      subjectId: 'seller_4',
      plan: 'team',
      status: 'paid',
    };

    const billing = new HmacBillingService({
      publicBaseUrl: config.billingPublicBaseUrl,
      providerSecret: config.billingProviderSecret,
      webhookSecret: config.billingWebhookSecret,
    });

    const signature = billing.signWebhookPayload(JSON.stringify(webhookPayload));

    const first = await fetch(`${server.baseUrl}/api/webhooks/billing`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-billing-signature': signature,
      },
      body: JSON.stringify(webhookPayload),
    });
    expect(first.status).toBe(200);
    expect((await first.json()).replay).toBe(false);

    const second = await fetch(`${server.baseUrl}/api/webhooks/billing`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-billing-signature': signature,
      },
      body: JSON.stringify(webhookPayload),
    });
    expect(second.status).toBe(200);
    expect((await second.json()).replay).toBe(true);
  });

  it('reconciles paid checkout sessions back into subject plans', async () => {
    const services = createFakeServices();
    const config = createTestConfig();
    const server = await startApiTestServer({ ...services, config });
    closers.push(server.close);

    const checkoutResponse = await fetch(`${server.baseUrl}/api/billing/checkout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...bearerAuthHeaders('seller_5') },
      body: JSON.stringify({
        subjectId: 'seller_5',
        plan: 'pro',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
      }),
    });
    expect(checkoutResponse.status).toBe(201);
    const checkoutPayload = await checkoutResponse.json();

    const webhookPayload = {
      eventId: 'evt_paid_reconcile_1',
      checkoutSessionId: checkoutPayload.checkoutSessionId,
      subjectId: 'seller_5',
      plan: 'pro',
      status: 'paid',
    };

    const billing = new HmacBillingService({
      publicBaseUrl: config.billingPublicBaseUrl,
      providerSecret: config.billingProviderSecret,
      webhookSecret: config.billingWebhookSecret,
    });
    const signature = billing.signWebhookPayload(JSON.stringify(webhookPayload));

    const webhookResponse = await fetch(`${server.baseUrl}/api/webhooks/billing`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-billing-signature': signature,
      },
      body: JSON.stringify(webhookPayload),
    });
    expect(webhookResponse.status).toBe(200);

    // Simulate drift (e.g. manual mistake or partial failure) before reconcile.
    await services.jobRepo.upsertSubjectProfile({
      subjectId: 'seller_5',
      plan: 'free',
      createdAt: '2026-02-23T00:00:00.000Z',
      updatedAt: '2026-02-23T00:00:00.000Z',
    });

    const reconcileResponse = await fetch(`${server.baseUrl}/api/billing/reconcile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...bearerAuthHeaders('seller_5') },
      body: JSON.stringify({ limit: 100 }),
    });

    expect(reconcileResponse.status).toBe(200);
    const reconcilePayload = await reconcileResponse.json();
    expect(reconcilePayload.corrected).toBe(1);

    const profile = await services.jobRepo.getSubjectProfile('seller_5');
    expect(profile?.plan).toBe('pro');
  });

  it('replays billing reconcile responses for identical idempotency key', async () => {
    const services = createFakeServices();
    const config = createTestConfig();
    const server = await startApiTestServer({ ...services, config });
    closers.push(server.close);

    const checkoutResponse = await fetch(`${server.baseUrl}/api/billing/checkout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...bearerAuthHeaders('seller_5') },
      body: JSON.stringify({
        subjectId: 'seller_5',
        plan: 'pro',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
      }),
    });
    expect(checkoutResponse.status).toBe(201);
    const checkoutPayload = await checkoutResponse.json();

    const webhookPayload = {
      eventId: 'evt_paid_reconcile_2',
      checkoutSessionId: checkoutPayload.checkoutSessionId,
      subjectId: 'seller_5',
      plan: 'pro',
      status: 'paid',
    };
    const billing = new HmacBillingService({
      publicBaseUrl: config.billingPublicBaseUrl,
      providerSecret: config.billingProviderSecret,
      webhookSecret: config.billingWebhookSecret,
    });
    const signature = billing.signWebhookPayload(JSON.stringify(webhookPayload));
    const webhookResponse = await fetch(`${server.baseUrl}/api/webhooks/billing`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-billing-signature': signature,
      },
      body: JSON.stringify(webhookPayload),
    });
    expect(webhookResponse.status).toBe(200);

    await services.jobRepo.upsertSubjectProfile({
      subjectId: 'seller_5',
      plan: 'free',
      createdAt: '2026-02-23T00:00:00.000Z',
      updatedAt: '2026-02-23T00:00:00.000Z',
    });

    const first = await fetch(`${server.baseUrl}/api/billing/reconcile`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'reconcile-seller5',
        ...bearerAuthHeaders('seller_5'),
      },
      body: JSON.stringify({ limit: 100 }),
    });
    expect(first.status).toBe(200);
    const firstPayload = await first.json();
    expect(firstPayload.corrected).toBe(1);
    const afterFirst = await services.jobRepo.getSubjectProfile('seller_5');
    expect(afterFirst?.plan).toBe('pro');

    await services.jobRepo.upsertSubjectProfile({
      subjectId: 'seller_5',
      plan: 'free',
      createdAt: '2026-02-23T00:00:00.000Z',
      updatedAt: '2026-02-24T00:00:00.000Z',
    });

    const second = await fetch(`${server.baseUrl}/api/billing/reconcile`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'reconcile-seller5',
        ...bearerAuthHeaders('seller_5'),
      },
      body: JSON.stringify({ limit: 100 }),
    });
    expect(second.status).toBe(200);
    const secondPayload = await second.json();
    expect(secondPayload).toEqual(firstPayload);

    const afterSecond = await services.jobRepo.getSubjectProfile('seller_5');
    expect(afterSecond?.plan).toBe('free');
  });

  it('rejects reconcile idempotency key that exceeds max length', async () => {
    const services = createFakeServices();
    const config = createTestConfig();
    const server = await startApiTestServer({ ...services, config });
    closers.push(server.close);

    const response = await fetch(`${server.baseUrl}/api/billing/reconcile`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'k'.repeat(129),
        ...bearerAuthHeaders('seller_5'),
      },
      body: JSON.stringify({ limit: 100 }),
    });

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.error).toBe('INVALID_IDEMPOTENCY_KEY');
  });

  it('returns billing summary and applies cancel/reactivate lifecycle actions', async () => {
    const services = createFakeServices();
    const config = createTestConfig();
    const server = await startApiTestServer({ ...services, config });
    closers.push(server.close);

    const checkoutResponse = await fetch(`${server.baseUrl}/api/billing/checkout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...bearerAuthHeaders('seller_6') },
      body: JSON.stringify({
        subjectId: 'seller_6',
        plan: 'team',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
      }),
    });
    expect(checkoutResponse.status).toBe(201);
    const checkoutPayload = await checkoutResponse.json();

    const webhookPayload = {
      eventId: 'evt_paid_6',
      checkoutSessionId: checkoutPayload.checkoutSessionId,
      subjectId: 'seller_6',
      plan: 'team',
      status: 'paid',
    };

    const billing = new HmacBillingService({
      publicBaseUrl: config.billingPublicBaseUrl,
      providerSecret: config.billingProviderSecret,
      webhookSecret: config.billingWebhookSecret,
    });
    const signature = billing.signWebhookPayload(JSON.stringify(webhookPayload));

    const webhookResponse = await fetch(`${server.baseUrl}/api/webhooks/billing`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-billing-signature': signature,
      },
      body: JSON.stringify(webhookPayload),
    });
    expect(webhookResponse.status).toBe(200);

    const summaryBefore = await fetch(`${server.baseUrl}/api/billing/summary/seller_6`, {
      headers: { ...bearerAuthHeaders('seller_6', 'team') },
    });
    expect(summaryBefore.status).toBe(200);
    const summaryBeforePayload = await summaryBefore.json();
    expect(summaryBeforePayload.plan).toBe('team');
    expect(summaryBeforePayload.actions.canCancel).toBe(true);

    const cancelResponse = await fetch(`${server.baseUrl}/api/billing/subscription`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...bearerAuthHeaders('seller_6', 'team') },
      body: JSON.stringify({
        subjectId: 'seller_6',
        action: 'cancel',
      }),
    });
    expect(cancelResponse.status).toBe(200);
    const canceled = await cancelResponse.json();
    expect(canceled.plan).toBe('free');
    expect(canceled.changed).toBe(true);

    const reactivateResponse = await fetch(`${server.baseUrl}/api/billing/subscription`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...bearerAuthHeaders('seller_6') },
      body: JSON.stringify({
        subjectId: 'seller_6',
        action: 'reactivate',
      }),
    });
    expect(reactivateResponse.status).toBe(200);
    const reactivated = await reactivateResponse.json();
    expect(reactivated.plan).toBe('team');
    expect(reactivated.changed).toBe(true);
  });

  it('rejects subscription updates when authenticated subject does not match body subjectId', async () => {
    const services = createFakeServices();
    const config = createTestConfig();
    const server = await startApiTestServer({ ...services, config });
    closers.push(server.close);

    const response = await fetch(`${server.baseUrl}/api/billing/subscription`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...bearerAuthHeaders('seller_auth', 'team'),
      },
      body: JSON.stringify({
        subjectId: 'seller_other',
        action: 'cancel',
      }),
    });

    expect(response.status).toBe(403);
    const payload = await response.json();
    expect(payload.error).toBe('BILLING_SUBJECT_FORBIDDEN');
  });

  it('rejects invalid Stripe signature and accepts valid Stripe signature for raw webhook body', async () => {
    const services = createFakeServices();
    const config = {
      ...createTestConfig(),
      billingProvider: 'stripe' as const,
    };
    const server = await startApiTestServer({ ...services, config });
    closers.push(server.close);

    const nowIso = new Date('2026-02-23T00:00:00.000Z').toISOString();
    await services.jobRepo.upsertSubjectProfile({
      subjectId: 'seller_stripe_1',
      plan: 'free',
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    const checkoutSessionId = 'cs_test_stripe_1';
    await services.jobRepo.createBillingCheckoutSession(
      {
        id: checkoutSessionId,
        subjectId: 'seller_stripe_1',
        plan: 'pro',
        status: 'created',
        checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_stripe_1',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
        expiresAt: new Date(Date.parse(nowIso) + 900_000).toISOString(),
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      900
    );

    const stripeWebhookPayload = JSON.stringify({
      id: 'evt_stripe_paid_1',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: checkoutSessionId,
          metadata: {
            subjectId: 'seller_stripe_1',
            plan: 'pro',
          },
        },
      },
    });

    const invalidSignatureResponse = await fetch(`${server.baseUrl}/api/webhooks/billing`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': 't=123,v1=invalid',
      },
      body: stripeWebhookPayload,
    });
    expect(invalidSignatureResponse.status).toBe(400);
    const invalidPayload = await invalidSignatureResponse.json();
    expect(invalidPayload.error).toBe('INVALID_SIGNATURE');

    const stripeSigner = new StripeBillingService({
      secretKey: config.stripeSecretKey || 'sk_test_example',
      webhookSecret: config.stripeWebhookSecret || 'whsec_example',
      webhookToleranceSeconds: config.stripeWebhookToleranceSeconds,
      priceIdByPlan: {
        pro: config.stripePriceIdPro || 'price_pro',
        team: config.stripePriceIdTeam || 'price_team',
      },
    });
    const validSignature = stripeSigner.signWebhookPayload(stripeWebhookPayload);

    const validSignatureResponse = await fetch(`${server.baseUrl}/api/webhooks/billing`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': validSignature,
      },
      body: stripeWebhookPayload,
    });
    expect(validSignatureResponse.status).toBe(200);
    const validPayload = await validSignatureResponse.json();
    expect(validPayload.accepted).toBe(true);
    expect(validPayload.replay).toBe(false);
  });
});
