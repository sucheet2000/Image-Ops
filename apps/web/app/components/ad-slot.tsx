"use client";

import type { ViewerPlan } from "../lib/session";
import type { AdConsent } from "./ad-consent-banner";
import type { ReactNode } from "react";

export function AdSlot(props: {
  plan: ViewerPlan;
  consent: AdConsent;
  placement: string;
}): ReactNode {
  if (props.plan !== "free") {
    return (
      <section className="card ad-block ad-block--disabled" aria-label="Ad slot hidden for paid plan">
        <h3>No Ads on Paid Plans</h3>
        <p>Upgrade benefit active. This slot stays disabled for {props.plan.toUpperCase()}.</p>
      </section>
    );
  }

  if (props.consent !== "accepted") {
    return (
      <section className="card ad-block ad-block--disabled" aria-label="Ad slot awaiting consent">
        <h3>Ads Paused</h3>
        <p>Grant consent to render ads in this placement.</p>
      </section>
    );
  }

  return (
    <section className="card ad-block" aria-label={`Ad slot ${props.placement}`}>
      <h3>Sponsored</h3>
      <p>Placement: {props.placement}</p>
      <div className="ad-slot">Ad network script mounts here after consent.</div>
    </section>
  );
}
