"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { AdConsentBanner, useAdConsent } from "./ad-consent-banner";
import { AdSlot } from "./ad-slot";
import { TOOL_PAGES, USE_CASE_PAGES } from "../lib/seo-data";
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
        <h2>Tool Pages</h2>
        <ul>
          {TOOL_PAGES.map((tool) => (
            <li key={tool.slug}>
              <Link href={`/tools/${tool.slug}`}>{tool.name}</Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>Use Cases</h2>
        <ul>
          {USE_CASE_PAGES.map((item) => (
            <li key={item.slug}>
              <Link href={`/use-cases/${item.slug}`}>{item.title}</Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>Session</h2>
        <p>Detected plan: <strong>{plan.toUpperCase()}</strong></p>
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
