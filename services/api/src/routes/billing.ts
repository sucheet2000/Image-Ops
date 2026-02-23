import { isPaidPlan, toSafeSubjectId, type BillingCheckoutSession, type BillingWebhookEvent, type SubjectProfile } from "@image-ops/core";
import { ulid } from "ulid";
import { z } from "zod";
import type { Router } from "express";
import type { ApiConfig } from "../config";
import { asyncHandler } from "../lib/async-handler";
import { logInfo } from "../lib/log";
import type { BillingService } from "../services/billing";
import type { JobRepository } from "../services/job-repo";

const checkoutSchema = z.object({
  subjectId: z.string().min(1),
  plan: z.enum(["pro", "team"]),
  successUrl: z.string().url(),
  cancelUrl: z.string().url()
});

export function registerBillingRoutes(
  router: Router,
  deps: {
    config: ApiConfig;
    jobRepo: JobRepository;
    billing: BillingService;
    now: () => Date;
  }
): void {
  router.post("/api/billing/checkout", asyncHandler(async (req, res) => {
    const parsed = checkoutSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "INVALID_BILLING_CHECKOUT_REQUEST", details: parsed.error.flatten() });
      return;
    }

    const now = deps.now();
    const nowIso = now.toISOString();
    const subjectId = toSafeSubjectId(parsed.data.subjectId);

    const profile = await deps.jobRepo.getSubjectProfile(subjectId);
    if (!profile) {
      const initialProfile: SubjectProfile = {
        subjectId,
        plan: "free",
        createdAt: nowIso,
        updatedAt: nowIso
      };
      await deps.jobRepo.upsertSubjectProfile(initialProfile);
    }

    const checkout = await deps.billing.createCheckoutSession({
      subjectId,
      plan: parsed.data.plan,
      successUrl: parsed.data.successUrl,
      cancelUrl: parsed.data.cancelUrl,
      now,
      ttlSeconds: deps.config.billingCheckoutTtlSeconds
    });

    const session: BillingCheckoutSession = {
      id: checkout.providerSessionId,
      subjectId,
      plan: parsed.data.plan,
      status: "created",
      checkoutUrl: checkout.checkoutUrl,
      successUrl: parsed.data.successUrl,
      cancelUrl: parsed.data.cancelUrl,
      expiresAt: checkout.expiresAt,
      createdAt: nowIso,
      updatedAt: nowIso
    };

    await deps.jobRepo.createBillingCheckoutSession(session, deps.config.billingCheckoutTtlSeconds);

    logInfo("billing.checkout.created", {
      checkoutSessionId: session.id,
      subjectId,
      plan: session.plan
    });

    res.status(201).json({
      checkoutSessionId: session.id,
      checkoutUrl: session.checkoutUrl,
      expiresAt: session.expiresAt,
      status: session.status
    });
  }));

  router.post("/api/webhooks/billing", asyncHandler(async (req, res) => {
    const signature = String(req.header("x-billing-signature") || "").trim();
    if (!signature) {
      res.status(401).json({ error: "BILLING_SIGNATURE_REQUIRED", message: "x-billing-signature header is required." });
      return;
    }

    const payloadText = Buffer.isBuffer(req.body)
      ? req.body.toString("utf8")
      : JSON.stringify(req.body || {});

    if (!deps.billing.verifyWebhookSignature(payloadText, signature)) {
      res.status(401).json({ error: "INVALID_BILLING_SIGNATURE", message: "Webhook signature is invalid." });
      return;
    }

    const eventInput = deps.billing.parseWebhookPayload(payloadText);
    if (!eventInput) {
      res.status(200).json({ accepted: false, ignored: true });
      return;
    }

    const existingEvent = await deps.jobRepo.getBillingWebhookEvent(eventInput.eventId);
    if (existingEvent) {
      res.status(200).json({ accepted: true, replay: true });
      return;
    }

    const checkoutSession = await deps.jobRepo.getBillingCheckoutSession(eventInput.checkoutSessionId);
    if (!checkoutSession) {
      res.status(404).json({ error: "CHECKOUT_SESSION_NOT_FOUND", message: "Checkout session does not exist." });
      return;
    }

    if (checkoutSession.subjectId !== toSafeSubjectId(eventInput.subjectId) || checkoutSession.plan !== eventInput.plan) {
      res.status(409).json({ error: "CHECKOUT_SUBJECT_MISMATCH", message: "Webhook payload does not match checkout session." });
      return;
    }

    const nowIso = deps.now().toISOString();

    await deps.jobRepo.updateBillingCheckoutStatus(checkoutSession.id, eventInput.status, nowIso);

    if (eventInput.status === "paid") {
      const existingProfile = await deps.jobRepo.getSubjectProfile(checkoutSession.subjectId);
      const nextPlan = isPaidPlan(eventInput.plan) ? eventInput.plan : "free";

      const updatedProfile: SubjectProfile = {
        subjectId: checkoutSession.subjectId,
        plan: nextPlan,
        createdAt: existingProfile?.createdAt || nowIso,
        updatedAt: nowIso
      };

      await deps.jobRepo.upsertSubjectProfile(updatedProfile);
    }

    const event: BillingWebhookEvent = {
      id: ulid(deps.now().getTime()),
      providerEventId: eventInput.eventId,
      checkoutSessionId: eventInput.checkoutSessionId,
      subjectId: checkoutSession.subjectId,
      plan: checkoutSession.plan,
      status: eventInput.status,
      createdAt: nowIso
    };

    await deps.jobRepo.appendBillingWebhookEvent(event);

    logInfo("billing.webhook.accepted", {
      eventId: event.providerEventId,
      subjectId: event.subjectId,
      status: event.status,
      plan: event.plan
    });

    res.status(200).json({ accepted: true, replay: false });
  }));
}
