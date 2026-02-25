'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { apiFetch, getApiBaseUrl } from '../lib/api-client';
import { getViewerSession, setViewerPlan, type ViewerSession } from '../lib/session';

type CheckoutPlan = 'pro' | 'team';

type BillingCheckoutResponse = {
  checkoutUrl: string;
};

type BillingReconcileResponse = {
  scanned: number;
  paidSessions: number;
  corrected: number;
};

type BillingSummaryResponse = {
  subjectId: string;
  plan: 'free' | 'pro' | 'team';
  latestCheckoutStatus: 'created' | 'paid' | 'canceled' | 'expired' | null;
  latestCheckoutPlan: 'pro' | 'team' | null;
  latestPaidPlan: 'pro' | 'team' | null;
  latestPaidAt: string | null;
  manageUrl: string | null;
  actions: {
    canCancel: boolean;
    canReactivate: boolean;
  };
};

type BillingSubscriptionResponse = {
  subjectId: string;
  action: 'cancel' | 'reactivate';
  previousPlan: 'free' | 'pro' | 'team';
  plan: 'free' | 'pro' | 'team';
};

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { message?: string; error?: string };
    return payload.message || payload.error || `Request failed with status ${response.status}.`;
  } catch {
    return `Request failed with status ${response.status}.`;
  }
}

export function BillingShell() {
  const [viewer, setViewer] = useState<ViewerSession>({
    subjectId: null,
    plan: 'free',
    isAuthenticated: false,
  });
  const [checkoutPending, setCheckoutPending] = useState<CheckoutPlan | null>(null);
  const [reconcilePending, setReconcilePending] = useState(false);
  const [subscriptionPending, setSubscriptionPending] = useState<'cancel' | 'reactivate' | null>(
    null
  );
  const [message, setMessage] = useState<string>('');
  const [reconcileSummary, setReconcileSummary] = useState<BillingReconcileResponse | null>(null);
  const [billingSummary, setBillingSummary] = useState<BillingSummaryResponse | null>(null);

  const apiBaseUrl = useMemo(() => getApiBaseUrl(), []);
  const reconcileEnabled = process.env.NEXT_PUBLIC_ENABLE_BILLING_RECONCILE === 'true';

  async function loadBillingSummary(subject: string): Promise<void> {
    const response = await apiFetch(
      `${apiBaseUrl}/api/billing/summary/${encodeURIComponent(subject)}`,
      {
        method: 'GET',
      }
    );
    if (!response.ok) {
      return;
    }

    const payload = (await response.json()) as BillingSummaryResponse;
    setBillingSummary(payload);
    setViewer((previous) => ({ ...previous, plan: payload.plan }));
    setViewerPlan(payload.plan);
  }

  useEffect(() => {
    const currentViewer = getViewerSession();
    setViewer(currentViewer);
    if (currentViewer.subjectId) {
      void loadBillingSummary(currentViewer.subjectId);
    }

    const search = new URLSearchParams(window.location.search);
    const checkout = search.get('checkout');
    const plan = search.get('plan');
    if (checkout === 'success' && (plan === 'pro' || plan === 'team')) {
      setMessage(
        `Checkout complete for ${plan.toUpperCase()}. Plan sync happens after payment webhook.`
      );
    }
    if (checkout === 'cancel') {
      setMessage('Checkout canceled. You can retry when ready.');
    }
  }, []);

  async function beginCheckout(plan: CheckoutPlan): Promise<void> {
    if (!viewer.subjectId) {
      setMessage('Please log in first to start checkout.');
      return;
    }

    setCheckoutPending(plan);
    setMessage('');

    try {
      const origin = window.location.origin;
      const response = await apiFetch(`${apiBaseUrl}/api/billing/checkout`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          subjectId: viewer.subjectId,
          plan,
          successUrl: `${origin}/billing?checkout=success&plan=${plan}`,
          cancelUrl: `${origin}/billing?checkout=cancel&plan=${plan}`,
        }),
      });

      if (!response.ok) {
        setMessage(await readErrorMessage(response));
        return;
      }

      const payload = (await response.json()) as BillingCheckoutResponse;
      if (!payload.checkoutUrl) {
        setMessage('Checkout URL missing from API response.');
        return;
      }

      window.location.assign(payload.checkoutUrl);
    } catch (error) {
      setMessage(
        `Checkout request failed: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      setCheckoutPending(null);
    }
  }

  async function runReconcile(): Promise<void> {
    setReconcilePending(true);
    setMessage('');

    try {
      const response = await apiFetch(`${apiBaseUrl}/api/billing/reconcile`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ limit: 200 }),
      });

      if (!response.ok) {
        setMessage(await readErrorMessage(response));
        return;
      }

      const payload = (await response.json()) as BillingReconcileResponse;
      setReconcileSummary(payload);
      setMessage(`Reconcile done. Corrected ${payload.corrected} subject profile(s).`);
    } catch (error) {
      setMessage(
        `Reconcile request failed: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      setReconcilePending(false);
    }
  }

  async function updateSubscription(action: 'cancel' | 'reactivate'): Promise<void> {
    if (!viewer.subjectId) {
      setMessage('Login is required to update subscription.');
      return;
    }

    setSubscriptionPending(action);
    setMessage('');
    try {
      const response = await apiFetch(`${apiBaseUrl}/api/billing/subscription`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          subjectId: viewer.subjectId,
          action,
        }),
      });

      if (!response.ok) {
        setMessage(await readErrorMessage(response));
        return;
      }

      const payload = (await response.json()) as BillingSubscriptionResponse;
      setViewer((previous) => ({ ...previous, plan: payload.plan }));
      setViewerPlan(payload.plan);
      setMessage(
        action === 'cancel'
          ? 'Subscription canceled. Plan moved to FREE.'
          : `Subscription reactivated. Plan moved to ${payload.plan.toUpperCase()}.`
      );
      await loadBillingSummary(payload.subjectId);
    } catch (error) {
      setMessage(
        `Subscription update failed: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      setSubscriptionPending(null);
    }
  }

  const isPro = viewer.plan === 'pro';
  const isTeam = viewer.plan === 'team';

  return (
    <main className="app-page">
      <section className="page-shell">
        <header className="page-head">
          <span className="section-label reveal-el" data-delay="0">
            Billing
          </span>
          <h1 className="reveal-el" data-delay="100">
            Plan management with <span className="accent-italic">full control.</span>
          </h1>
          <p className="reveal-el" data-delay="180">
            Launch checkout, manage active plans, and keep your subscription state synchronized.
          </p>
        </header>

        <div className="editorial-card-row">
          <section className="editorial-card reveal-el" data-delay="0">
            <span className="section-label">Current Session</span>
            <p>Authenticated: {viewer.isAuthenticated ? 'YES' : 'NO'}</p>
            <p>Subject: {viewer.subjectId || 'not available'}</p>
            <p>Plan: {viewer.plan.toUpperCase()}</p>
            {!viewer.isAuthenticated ? (
              <p style={{ marginTop: '0.75rem' }}>
                Login is required for checkout. <Link href="/login">Go to login</Link>
              </p>
            ) : null}
          </section>

          <section className="editorial-card reveal-el" data-delay="80">
            <span className="section-label">Upgrade Options</span>
            <div className="workbench-actions" style={{ marginTop: '0.75rem' }}>
              <button
                type="button"
                className="editorial-button accent"
                onClick={() => void beginCheckout('pro')}
                disabled={!viewer.isAuthenticated || isPro || isTeam || checkoutPending !== null}
              >
                {checkoutPending === 'pro'
                  ? 'Starting PRO...'
                  : isPro || isTeam
                    ? 'PRO Active'
                    : 'Upgrade to PRO'}
              </button>
              <button
                type="button"
                className="editorial-button primary"
                onClick={() => void beginCheckout('team')}
                disabled={!viewer.isAuthenticated || isTeam || checkoutPending !== null}
              >
                {checkoutPending === 'team'
                  ? 'Starting TEAM...'
                  : isTeam
                    ? 'TEAM Active'
                    : 'Upgrade to TEAM'}
              </button>
            </div>
          </section>

          <section className="editorial-card reveal-el" data-delay="160">
            <span className="section-label">Subscription Management</span>
            <p style={{ marginTop: '0.6rem' }}>
              Latest checkout: {billingSummary?.latestCheckoutStatus || 'none'}
              {billingSummary?.latestCheckoutPlan
                ? ` (${billingSummary.latestCheckoutPlan.toUpperCase()})`
                : ''}
            </p>
            <div className="workbench-actions" style={{ marginTop: '0.75rem' }}>
              <button
                type="button"
                className="editorial-button ghost"
                disabled={
                  !viewer.isAuthenticated ||
                  !billingSummary?.actions.canCancel ||
                  subscriptionPending !== null
                }
                onClick={() => void updateSubscription('cancel')}
              >
                {subscriptionPending === 'cancel' ? 'Canceling...' : 'Cancel Subscription'}
              </button>
              <button
                type="button"
                className="editorial-button ghost"
                disabled={
                  !viewer.isAuthenticated ||
                  !billingSummary?.actions.canReactivate ||
                  subscriptionPending !== null
                }
                onClick={() => void updateSubscription('reactivate')}
              >
                {subscriptionPending === 'reactivate' ? 'Reactivating...' : 'Reactivate Plan'}
              </button>
              {billingSummary?.manageUrl ? (
                <a
                  className="editorial-button primary"
                  href={billingSummary.manageUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open Billing Portal
                </a>
              ) : null}
            </div>
          </section>
        </div>

        {reconcileEnabled ? (
          <section className="editorial-card" style={{ marginTop: '1rem' }}>
            <span className="section-label">Plan Reconcile</span>
            <p style={{ marginTop: '0.65rem' }}>
              Internal control to repair plan drift after delayed webhooks.
            </p>
            <div className="workbench-actions">
              <button
                type="button"
                className="editorial-button ghost"
                onClick={() => void runReconcile()}
                disabled={reconcilePending || !viewer.isAuthenticated}
              >
                {reconcilePending ? 'Running...' : 'Run Reconcile'}
              </button>
            </div>
            {reconcileSummary ? (
              <p style={{ marginTop: '0.75rem' }}>
                Scanned {reconcileSummary.scanned}, paid sessions {reconcileSummary.paidSessions},
                corrected {reconcileSummary.corrected}.
              </p>
            ) : null}
          </section>
        ) : null}

        {message ? (
          <section
            className="editorial-card"
            style={{ marginTop: '1rem', borderColor: 'var(--terracotta)' }}
          >
            {message}
          </section>
        ) : null}
      </section>
    </main>
  );
}
