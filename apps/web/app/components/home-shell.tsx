"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { AdConsentBanner, useAdConsent } from "./ad-consent-banner";
import { AdSlot } from "./ad-slot";
import { getViewerPlan, type ViewerPlan } from "../lib/session";

export function HomeShell(): ReactNode {
  const [plan, setPlan] = useState<ViewerPlan>("free");
  const [consent, setConsent] = useAdConsent();

  useEffect(() => {
    setPlan(getViewerPlan());
  }, []);

  return (
    <main className="container">
      <h1>Image Ops</h1>
      <p className="subhead">Marketplace-ready image tools with strict deletion policies.</p>

      <section className="card">
        <h2>Free Plan</h2>
        <p>6 images per rolling 10 hours.</p>
        <p>Watermark applies to advanced tools on free usage.</p>
      </section>

      <section className="card trust">
        <h2>Privacy</h2>
        <p>
          Your images are processed temporarily and automatically deleted. We do not store your uploaded
          images in our database after you leave the page.
        </p>
      </section>

      <section className="card">
        <h2>Session</h2>
        <p>Detected plan: <strong>{plan.toUpperCase()}</strong></p>
        <p><Link href="/billing">Open billing</Link> · <Link href="/login">Login</Link></p>
      </section>

      <section className="card">
        <h2>Explore</h2>
        <ul>
          <li><Link href="/tools/resize">Tool pages</Link></li>
          <li><Link href="/use-cases/amazon-listings">Use-case pages</Link></li>
          <li><Link href="/for/amazon/main-image-compliance">Audience workflows</Link></li>
          <li><Link href="/guides/prepare-amazon-main-images">Guides</Link></li>
          <li><Link href="/compare/jpg-vs-png">Comparisons</Link></li>
        </ul>
      </section>

      <AdConsentBanner
        consent={consent}
        onAccept={() => setConsent("accepted")}
        onReject={() => setConsent("rejected")}
      />

      <AdSlot plan={plan} consent={consent} placement="homepage-top" />
      <AdSlot plan={plan} consent={consent} placement="homepage-bottom" />
    </main>
  );
}
