"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetch, getApiBaseUrl } from "../lib/api-client";
import { getViewerSession, type ViewerSession } from "../lib/session";

type CheckoutPlan = "pro" | "team";

type BillingCheckoutResponse = {
  checkoutSessionId: string;
  checkoutUrl: string;
  expiresAt: string;
  status: string;
};

type BillingReconcileResponse = {
  scanned: number;
  paidSessions: number;
  corrected: number;
};

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const payload = await response.json() as { message?: string; error?: string };
    return payload.message || payload.error || `Request failed with status ${response.status}.`;
  } catch {
    return `Request failed with status ${response.status}.`;
  }
}

export function BillingShell() {
  const [viewer, setViewer] = useState<ViewerSession>({
    subjectId: null,
    plan: "free",
    isAuthenticated: false
  });
  const [checkoutPending, setCheckoutPending] = useState<CheckoutPlan | null>(null);
  const [reconcilePending, setReconcilePending] = useState(false);
  const [message, setMessage] = useState<string>("");
  const [reconcileSummary, setReconcileSummary] = useState<BillingReconcileResponse | null>(null);

  const apiBaseUrl = useMemo(() => getApiBaseUrl(), []);
  const reconcileEnabled = process.env.NEXT_PUBLIC_ENABLE_BILLING_RECONCILE === "true";

  useEffect(() => {
    setViewer(getViewerSession());

    const search = new URLSearchParams(window.location.search);
    const checkout = search.get("checkout");
    const plan = search.get("plan");
    if (checkout === "success" && (plan === "pro" || plan === "team")) {
      setMessage(`Checkout complete for ${plan.toUpperCase()}. Plan sync happens after payment webhook.`);
    }
    if (checkout === "cancel") {
      setMessage("Checkout canceled. You can retry when ready.");
    }
  }, []);

  async function beginCheckout(plan: CheckoutPlan): Promise<void> {
    if (!viewer.subjectId) {
      setMessage("Please log in first to start checkout.");
      return;
    }

    setCheckoutPending(plan);
    setMessage("");

    try {
      const origin = window.location.origin;
      const response = await apiFetch(`${apiBaseUrl}/api/billing/checkout`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subjectId: viewer.subjectId,
          plan,
          successUrl: `${origin}/billing?checkout=success&plan=${plan}`,
          cancelUrl: `${origin}/billing?checkout=cancel&plan=${plan}`
        })
      });

      if (!response.ok) {
        setMessage(await readErrorMessage(response));
        return;
      }

      const payload = await response.json() as BillingCheckoutResponse;
      if (!payload.checkoutUrl) {
        setMessage("Checkout URL missing from API response.");
        return;
      }

      window.location.assign(payload.checkoutUrl);
    } catch (error) {
      setMessage(`Checkout request failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setCheckoutPending(null);
    }
  }

  async function runReconcile(): Promise<void> {
    setReconcilePending(true);
    setMessage("");

    try {
      const response = await apiFetch(`${apiBaseUrl}/api/billing/reconcile`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ limit: 200 })
      });

      if (!response.ok) {
        setMessage(await readErrorMessage(response));
        return;
      }

      const payload = await response.json() as BillingReconcileResponse;
      setReconcileSummary(payload);
      setMessage(`Reconcile done. Corrected ${payload.corrected} subject profile(s).`);
    } catch (error) {
      setMessage(`Reconcile request failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setReconcilePending(false);
    }
  }

  const isPro = viewer.plan === "pro";
  const isTeam = viewer.plan === "team";

  return (
    <main className="container">
      <h1>Billing</h1>
      <p className="subhead">Upgrade plans, launch checkout, and verify billing synchronization.</p>

      <section className="card">
        <h2>Current Session</h2>
        <p>Authenticated: <strong>{viewer.isAuthenticated ? "YES" : "NO"}</strong></p>
        <p>Subject: <strong>{viewer.subjectId || "not available"}</strong></p>
        <p>Plan: <strong>{viewer.plan.toUpperCase()}</strong></p>
        {!viewer.isAuthenticated ? (
          <p className="billing-note">
            Login is required for checkout. <Link href="/login">Go to login</Link>
          </p>
        ) : null}
      </section>

      <section className="card">
        <h2>Upgrade Options</h2>
        <div className="billing-actions">
          <button
            type="button"
            onClick={() => beginCheckout("pro")}
            disabled={!viewer.isAuthenticated || isPro || isTeam || checkoutPending !== null}
          >
            {checkoutPending === "pro" ? "Starting PRO checkout..." : isPro || isTeam ? "PRO active" : "Upgrade to PRO"}
          </button>
          <button
            type="button"
            onClick={() => beginCheckout("team")}
            disabled={!viewer.isAuthenticated || isTeam || checkoutPending !== null}
          >
            {checkoutPending === "team" ? "Starting TEAM checkout..." : isTeam ? "TEAM active" : "Upgrade to TEAM"}
          </button>
        </div>
      </section>

      {reconcileEnabled ? (
        <section className="card">
          <h2>Plan Reconcile</h2>
          <p className="billing-note">Internal control to repair plan drift after delayed webhooks.</p>
          <button type="button" onClick={runReconcile} disabled={reconcilePending || !viewer.isAuthenticated}>
            {reconcilePending ? "Running reconcile..." : "Run reconcile"}
          </button>
          {reconcileSummary ? (
            <p className="billing-note">
              Scanned {reconcileSummary.scanned}, paid sessions {reconcileSummary.paidSessions}, corrected {reconcileSummary.corrected}.
            </p>
          ) : null}
        </section>
      ) : null}

      {message ? <section className="card billing-status">{message}</section> : null}

      <p>
        <Link href="/">Back to home</Link>
      </p>
    </main>
  );
}
