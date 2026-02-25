import {
  isPaidPlan,
  toSafeSubjectId,
  type BillingCheckoutSession,
  type BillingWebhookEvent,
  type SubjectProfile,
} from '@imageops/core';
import { ulid } from 'ulid';
import { z } from 'zod';
import type { Router } from 'express';
import type { ApiConfig } from '../config';
import { asyncHandler } from '../lib/async-handler';
import { logInfo } from '../lib/log';
import type { BillingService } from '../services/billing';
import type { JobRepository } from '../services/job-repo';

const checkoutSchema = z.object({
  subjectId: z.string().min(1),
  plan: z.enum(['pro', 'team']),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
});

const reconcileSchema = z.object({
  limit: z.number().int().positive().max(1000).default(200),
});

const billingSummaryParamSchema = z.object({
  subjectId: z.string().min(1),
});

const billingSubscriptionSchema = z.object({
  subjectId: z.string().min(1),
  action: z.enum(['cancel', 'reactivate']),
});

const PLAN_RANK: Record<SubjectProfile['plan'], number> = {
  free: 0,
  pro: 1,
  team: 2,
};
const BILLING_RECONCILE_IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;

function buildManageUrl(portalBaseUrl: string | undefined, subjectId: string): string | null {
  if (!portalBaseUrl) {
    return null;
  }

  const url = new URL(portalBaseUrl);
  url.searchParams.set('subjectId', subjectId);
  return url.toString();
}

export function registerBillingRoutes(
  router: Router,
  deps: {
    config: ApiConfig;
    jobRepo: JobRepository;
    billing: BillingService;
    now: () => Date;
  }
): void {
  router.post(
    '/api/billing/checkout',
    asyncHandler(async (req, res) => {
      const parsed = checkoutSchema.safeParse(req.body);
      if (!parsed.success) {
        res
          .status(400)
          .json({ error: 'INVALID_BILLING_CHECKOUT_REQUEST', details: parsed.error.flatten() });
        return;
      }

      const now = deps.now();
      const nowIso = now.toISOString();
      const subjectId = toSafeSubjectId(parsed.data.subjectId);

      const profile = await deps.jobRepo.getSubjectProfile(subjectId);
      if (!profile) {
        const initialProfile: SubjectProfile = {
          subjectId,
          plan: 'free',
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        await deps.jobRepo.upsertSubjectProfile(initialProfile);
      }

      const checkout = await deps.billing.createCheckoutSession({
        subjectId,
        plan: parsed.data.plan,
        successUrl: parsed.data.successUrl,
        cancelUrl: parsed.data.cancelUrl,
        now,
        ttlSeconds: deps.config.billingCheckoutTtlSeconds,
      });

      const session: BillingCheckoutSession = {
        id: checkout.providerSessionId,
        subjectId,
        plan: parsed.data.plan,
        status: 'created',
        checkoutUrl: checkout.checkoutUrl,
        successUrl: parsed.data.successUrl,
        cancelUrl: parsed.data.cancelUrl,
        expiresAt: checkout.expiresAt,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      await deps.jobRepo.createBillingCheckoutSession(
        session,
        deps.config.billingCheckoutTtlSeconds
      );

      logInfo('billing.checkout.created', {
        checkoutSessionId: session.id,
        subjectId,
        plan: session.plan,
      });

      res.status(201).json({
        checkoutSessionId: session.id,
        checkoutUrl: session.checkoutUrl,
        expiresAt: session.expiresAt,
        status: session.status,
      });
    })
  );

  router.post(
    '/api/webhooks/billing',
    asyncHandler(async (req, res) => {
      const signatureHeader =
        deps.config.billingProvider === 'stripe' ? 'stripe-signature' : 'x-billing-signature';
      const signature = String(req.header(signatureHeader) || '').trim();
      if (!signature) {
        res.status(400).json({
          error: 'INVALID_SIGNATURE',
          message: `${signatureHeader} header is required.`,
        });
        return;
      }

      if (!Buffer.isBuffer(req.body)) {
        res.status(400).json({
          error: 'INVALID_SIGNATURE',
          message: 'Webhook payload must be a raw request body.',
        });
        return;
      }
      const payloadText = req.body.toString('utf8');

      if (!deps.billing.verifyWebhookSignature(payloadText, signature)) {
        res.status(400).json({ error: 'INVALID_SIGNATURE', message: 'Webhook signature invalid' });
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

      const checkoutSession = await deps.jobRepo.getBillingCheckoutSession(
        eventInput.checkoutSessionId
      );
      if (!checkoutSession) {
        res
          .status(404)
          .json({
            error: 'CHECKOUT_SESSION_NOT_FOUND',
            message: 'Checkout session does not exist.',
          });
        return;
      }

      if (
        checkoutSession.subjectId !== toSafeSubjectId(eventInput.subjectId) ||
        checkoutSession.plan !== eventInput.plan
      ) {
        res
          .status(409)
          .json({
            error: 'CHECKOUT_SUBJECT_MISMATCH',
            message: 'Webhook payload does not match checkout session.',
          });
        return;
      }

      const nowIso = deps.now().toISOString();

      await deps.jobRepo.updateBillingCheckoutStatus(checkoutSession.id, eventInput.status, nowIso);

      if (eventInput.status === 'paid') {
        const existingProfile = await deps.jobRepo.getSubjectProfile(checkoutSession.subjectId);
        const nextPlan = isPaidPlan(eventInput.plan) ? eventInput.plan : 'free';

        const updatedProfile: SubjectProfile = {
          subjectId: checkoutSession.subjectId,
          plan: nextPlan,
          createdAt: existingProfile?.createdAt || nowIso,
          updatedAt: nowIso,
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
        createdAt: nowIso,
      };

      await deps.jobRepo.appendBillingWebhookEvent(event);

      logInfo('billing.webhook.accepted', {
        eventId: event.providerEventId,
        subjectId: event.subjectId,
        status: event.status,
        plan: event.plan,
      });

      res.status(200).json({ accepted: true, replay: false });
    })
  );

  router.post(
    '/api/billing/reconcile',
    asyncHandler(async (req, res) => {
      const idempotencyHeader = String(req.header('idempotency-key') || '').trim();
      const authSubjectId = toSafeSubjectId(
        String((req as { auth?: { sub?: string } }).auth?.sub || 'anonymous')
      );
      const idempotencyScopeKey = idempotencyHeader ? `${authSubjectId}:${idempotencyHeader}` : '';
      if (idempotencyScopeKey) {
        const cached = await deps.jobRepo.getBillingReconcileIdempotency(idempotencyScopeKey);
        if (cached) {
          res.status(200).json(cached);
          return;
        }
      }

      const parsed = reconcileSchema.safeParse(req.body || {});
      if (!parsed.success) {
        res
          .status(400)
          .json({ error: 'INVALID_BILLING_RECONCILE_REQUEST', details: parsed.error.flatten() });
        return;
      }

      const nowIso = deps.now().toISOString();
      const sessions = await deps.jobRepo.listBillingCheckoutSessions(parsed.data.limit);

      let corrected = 0;
      let paidSessions = 0;

      for (const session of sessions) {
        if (session.status !== 'paid' || !isPaidPlan(session.plan)) {
          continue;
        }
        paidSessions += 1;

        const profile = await deps.jobRepo.getSubjectProfile(session.subjectId);
        if (profile && PLAN_RANK[profile.plan] >= PLAN_RANK[session.plan]) {
          continue;
        }

        const nextProfile: SubjectProfile = {
          subjectId: session.subjectId,
          plan: session.plan,
          createdAt: profile?.createdAt || nowIso,
          updatedAt: nowIso,
        };
        await deps.jobRepo.upsertSubjectProfile(nextProfile);
        corrected += 1;
      }

      const payload = {
        scanned: sessions.length,
        paidSessions,
        corrected,
      };
      if (idempotencyScopeKey) {
        await deps.jobRepo.setBillingReconcileIdempotency(
          idempotencyScopeKey,
          payload,
          BILLING_RECONCILE_IDEMPOTENCY_TTL_SECONDS
        );
      }

      res.status(200).json(payload);
    })
  );

  router.get(
    '/api/billing/summary/:subjectId',
    asyncHandler(async (req, res) => {
      const parsed = billingSummaryParamSchema.safeParse(req.params);
      if (!parsed.success) {
        res
          .status(400)
          .json({ error: 'INVALID_BILLING_SUMMARY_REQUEST', details: parsed.error.flatten() });
        return;
      }

      const subjectId = toSafeSubjectId(parsed.data.subjectId);
      const profile = await deps.jobRepo.getSubjectProfile(subjectId);
      const sessions = await deps.jobRepo.listBillingCheckoutSessionsForSubject(subjectId, 500);
      const latest = sessions[0] || null;
      const latestPaid = sessions.find((session) => session.status === 'paid') || null;

      res.status(200).json({
        subjectId,
        plan: profile?.plan || 'free',
        latestCheckoutStatus: latest?.status || null,
        latestCheckoutPlan: latest?.plan || null,
        latestPaidPlan: latestPaid?.plan || null,
        latestPaidAt: latestPaid?.updatedAt || null,
        manageUrl: buildManageUrl(deps.config.billingPortalBaseUrl, subjectId),
        actions: {
          canCancel: (profile?.plan || 'free') !== 'free',
          canReactivate: Boolean(latestPaid) && (profile?.plan || 'free') === 'free',
        },
      });
    })
  );

  router.post(
    '/api/billing/subscription',
    asyncHandler(async (req, res) => {
      const parsed = billingSubscriptionSchema.safeParse(req.body || {});
      if (!parsed.success) {
        res
          .status(400)
          .json({ error: 'INVALID_BILLING_SUBSCRIPTION_REQUEST', details: parsed.error.flatten() });
        return;
      }

      const nowIso = deps.now().toISOString();
      const subjectId = toSafeSubjectId(parsed.data.subjectId);
      const existing = await deps.jobRepo.getSubjectProfile(subjectId);
      const currentPlan = existing?.plan || 'free';

      let nextPlan: SubjectProfile['plan'] = currentPlan;
      if (parsed.data.action === 'cancel') {
        nextPlan = 'free';
      } else {
        const sessions = await deps.jobRepo.listBillingCheckoutSessionsForSubject(subjectId, 500);
        const latestPaid = sessions.find((session) => session.status === 'paid');
        if (!latestPaid) {
          res.status(409).json({
            error: 'NO_PAID_SUBSCRIPTION',
            message: 'No paid checkout session found for reactivation.',
          });
          return;
        }
        nextPlan = latestPaid.plan;
      }

      const changed = nextPlan !== currentPlan;
      if (changed || !existing) {
        await deps.jobRepo.upsertSubjectProfile({
          subjectId,
          plan: nextPlan,
          createdAt: existing?.createdAt || nowIso,
          updatedAt: nowIso,
        });
      }

      logInfo('billing.subscription.updated', {
        subjectId,
        action: parsed.data.action,
        previousPlan: currentPlan,
        plan: nextPlan,
        changed,
      });

      res.status(200).json({
        subjectId,
        action: parsed.data.action,
        previousPlan: currentPlan,
        plan: nextPlan,
        changed,
        manageUrl: buildManageUrl(deps.config.billingPortalBaseUrl, subjectId),
      });
    })
  );
}
