"use client";

import Link from "next/link";
import type { ReactNode } from "react";

type EditorialPanel = {
  id: string;
  number: string;
  label: string;
  title: string;
  accent: string;
  body: string;
  features: string[];
  statLabel: string;
  statValue: string;
  statUnit: string;
  statCaption: string;
  mediaTag: string;
  mediaVariant?: "alt-green" | "alt-violet";
  flip?: boolean;
};

const marqueeItems = [
  "Background Removal",
  "Lossless Compression",
  "Smart Resize",
  "Format Conversion",
  "Marketplace Presets",
  "Batch Exports"
];

const editorialPanels: EditorialPanel[] = [
  {
    id: "background",
    number: "01",
    label: "Remove Backgrounds",
    title: "Clean cuts.",
    accent: "Every time.",
    body: "Detect edges, isolate products, and deliver transparent outputs tuned for marketplace standards.",
    features: [
      "AI-powered edge detection with transparent or custom background output",
      "Fine-detail treatment for product outlines, straps, and soft edges",
      "Consistent cutout quality across large catalog batches"
    ],
    statLabel: "Processing Time",
    statValue: "3.2",
    statUnit: "S",
    statCaption: "Average per image",
    mediaTag: "Smart Cutout"
  },
  {
    id: "compression",
    number: "02",
    label: "Compress Images",
    title: "Smaller files.",
    accent: "Faster stores.",
    body: "Perceptual compression removes wasted bytes while preserving the look that converts on listing pages.",
    features: [
      "Perceptual quality algorithm, not blind bitrate crushing",
      "Supports JPG, PNG, and WEBP output targets",
      "Side-by-side quality review before publishing"
    ],
    statLabel: "Average Size Reduction",
    statValue: "84",
    statUnit: "%",
    statCaption: "Without visible quality loss",
    mediaTag: "Smart Compression",
    mediaVariant: "alt-green",
    flip: true
  },
  {
    id: "resize",
    number: "03",
    label: "Resize & Reformat",
    title: "Every platform.",
    accent: "Perfect fit.",
    body: "Apply one trusted preset and ship dimensions for Etsy, Amazon, Shopify, and social channels without rework.",
    features: [
      "40+ marketplace-ready size presets across major channels",
      "Smart crop options keep the product centered",
      "Preserve metadata when needed, or strip it for privacy"
    ],
    statLabel: "Platform Presets",
    statValue: "40",
    statUnit: "+",
    statCaption: "Etsy, Amazon, Shopify & more",
    mediaTag: "Smart Resize",
    mediaVariant: "alt-violet"
  }
];

const toolCells = [
  {
    number: "01",
    name: "Background Removal",
    summary: "AI-powered edge detection with transparent or custom background output.",
    href: "/tools/background-remove",
    plan: "free" as const
  },
  {
    number: "02",
    name: "Smart Compress",
    summary: "Perceptual compression tuned for quality-retaining size reduction.",
    href: "/tools/compress",
    plan: "free" as const
  },
  {
    number: "03",
    name: "Platform Resize",
    summary: "Channel-safe dimensions and framing for marketplace catalogs.",
    href: "/tools/resize",
    plan: "free" as const
  },
  {
    number: "04",
    name: "Format Convert",
    summary: "Convert JPG, PNG, and WEBP for compatibility without loss of control.",
    href: "/tools/convert",
    plan: "free" as const
  },
  {
    number: "05",
    name: "Brand Watermark",
    summary: "Protect creative assets with repeatable watermark overlays and brand marks.",
    href: "/upload",
    plan: "pro" as const
  },
  {
    number: "06",
    name: "Bulk Export",
    summary: "Run high-volume transformations and grouped downloads in one queue.",
    href: "/upload",
    plan: "pro" as const
  }
];

const statRows = [
  { value: "12", unit: "K+", label: "Active Sellers" },
  { value: "2.4", unit: "M", label: "Images Processed" },
  { value: "84", unit: "%", label: "Avg Size Reduction" },
  { value: "3.2", unit: "S", label: "Avg Processing Time" }
];

const pricingTiers = [
  {
    name: "Free Forever",
    price: "$0",
    cycle: "",
    summary: "6 images per rolling 10 hours. Perfect for occasional use.",
    features: ["All 4 core tools", "6 images / 10 hours", "PNG & JPG output", "Watermark on advanced tools"],
    cta: "Start Free",
    href: "/upload"
  },
  {
    name: "Pro",
    price: "$12",
    cycle: "/mo",
    summary: "Unlimited images, all tools, and no watermarking for serious sellers.",
    features: ["All tools including batch workflows", "Unlimited image processing", "No watermark overlays", "Priority processing"],
    cta: "Upgrade to Pro",
    href: "/billing",
    highlight: true
  },
  {
    name: "Team",
    price: "$29",
    cycle: "/mo",
    summary: "5 seats, governance controls, and API access for growing teams.",
    features: ["Everything in Pro", "5 team seats", "REST API access", "Dedicated support"],
    cta: "Start Team Trial",
    href: "/billing"
  }
];

function renderPanel(panel: EditorialPanel) {
  const textContent = (
    <div className="editorial-text">
      <span className="section-label reveal-el" data-delay="0">{panel.number} - {panel.label}</span>
      <h2 className="reveal-el" data-delay="100">
        {panel.title} <span className="accent-italic">{panel.accent}</span>
      </h2>
      <p className="section-lead reveal-el" data-delay="200">{panel.body}</p>
      <ol className="editorial-list reveal-el" data-delay="300">
        {panel.features.map((feature, index) => (
          <li key={feature}>
            <span className="editorial-list-number">{String(index + 1).padStart(2, "0")}</span>
            <span>{feature}</span>
          </li>
        ))}
      </ol>
    </div>
  );

  const mediaContent = (
    <div className="editorial-media">
      <div
        className={`editorial-media-inner${panel.mediaVariant ? ` ${panel.mediaVariant}` : ""}`}
        data-parallax-speed="0.12"
      />
      <span className="vertical-tag">{panel.mediaTag}</span>
      <article className="stat-card reveal-el" data-delay="120">
        <span className="stat-label">{panel.statLabel}</span>
        <p className="stat-value">
          {panel.statValue}
          <span className="unit">{panel.statUnit}</span>
        </p>
        <p className="stat-caption">{panel.statCaption}</p>
      </article>
    </div>
  );

  return panel.flip ? (
    <section key={panel.id} className="editorial-panel">
      {textContent}
      {mediaContent}
    </section>
  ) : (
    <section key={panel.id} className="editorial-panel">
      {mediaContent}
      {textContent}
    </section>
  );
}

export function HomeShell(): ReactNode {
  const duplicatedMarquee = [...marqueeItems, ...marqueeItems];

  return (
    <>
      <section className="full-bleed-section hero-section">
        <div className="hero-background" data-mouse-parallax />
        <span className="hero-deco" aria-hidden="true">01</span>
        <div className="section-inner">
          <div className="hero-grid">
            <div>
              <span className="section-label hero-kicker reveal-el" data-delay="0">
                Professional Image Tools - For Marketplace Sellers
              </span>
              <h1 className="reveal-el" data-delay="80">
                Your images, <span className="accent-italic">elevated.</span>
              </h1>
              <div className="scroll-hint reveal-el" data-delay="160">Scroll to Explore</div>
            </div>
            <div>
              <p className="hero-copy reveal-el" data-delay="100">
                Remove backgrounds, resize, compress, and convert product images with deliberate precision.
                Built for sellers who care how every listing looks before first click.
              </p>
              <div className="hero-actions reveal-el" data-delay="180">
                <Link href="/upload" className="editorial-button accent editorial-button-large">
                  Start Free - No Account Needed
                </Link>
                <Link href="/tools" className="editorial-button ghost editorial-button-large">
                  See All Tools
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="full-bleed-section marquee-strip">
        <div className="marquee-track" aria-hidden="true">
          {duplicatedMarquee.map((item, index) => (
            <span key={`${item}-${index}`} className="marquee-item">
              {item} {index !== duplicatedMarquee.length - 1 ? <span className="marquee-dot">•</span> : null}
            </span>
          ))}
        </div>
      </section>

      <section className="full-bleed-section pull-quote-section">
        <div className="section-inner pull-quote-wrap">
          <p className="pull-quote reveal-el" data-delay="0">
            <span className="pull-quote-mark">“</span>
            My product photos went from amateur to professional in seconds. My Etsy conversion rate jumped 34% in the first month.
            <span className="pull-quote-mark">”</span>
          </p>
          <span className="pull-quote-attribution reveal-el" data-delay="120">
            - Maria S., Etsy Top Seller · 2,400+ Monthly Sales
          </span>
        </div>
      </section>

      {editorialPanels.map((panel) => renderPanel(panel))}

      <section className="full-bleed-section stats-row">
        <div className="section-inner">
          <div className="stats-grid">
            {statRows.map((item, index) => (
              <div key={item.label} className="stats-cell reveal-el" data-delay={String(index * 80)}>
                <p className="stats-number">
                  {item.value}
                  <span className="unit">{item.unit}</span>
                </p>
                <p className="stats-label">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="full-bleed-section tools-section" id="tools">
        <div className="section-inner">
          <div className="tools-head">
            <h2 className="reveal-el" data-delay="0">
              Everything your images <span className="accent-italic">need.</span>
            </h2>
            <p className="section-lead reveal-el" data-delay="100">
              Six professional-grade workflows built for the demands of marketplace selling at scale.
            </p>
          </div>
          <div className="tools-grid">
            {toolCells.map((tool, index) => (
              <article key={tool.number} className="tool-cell reveal-el" data-delay={String(index * 80)}>
                <span className={`badge ${tool.plan} tool-cell-badge`}>{tool.plan}</span>
                <span className="tool-cell-number">{tool.number}</span>
                <h3 className="tool-cell-title">{tool.name}</h3>
                <p className="tool-cell-copy">{tool.summary}</p>
                <Link href={tool.href} className="ui-link tool-cell-link">
                  Try Tool →
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="full-bleed-section pricing-section" id="pricing">
        <div className="section-inner">
          <div className="pricing-head">
            <h2 className="reveal-el" data-delay="0">
              Simple, <span className="accent-italic">honest</span> pricing.
            </h2>
            <p className="section-lead reveal-el" data-delay="100">
              Start free. Upgrade when ready. No hidden fees and no locked features that disappear.
            </p>
          </div>
          <div className="pricing-grid">
            {pricingTiers.map((tier, index) => (
              <article
                key={tier.name}
                className={`pricing-card${tier.highlight ? " highlight" : ""} reveal-el`}
                data-delay={String(index * 80)}
              >
                {tier.highlight ? <span className="popular-tag">Most Popular</span> : null}
                <span className="section-label">{tier.name}</span>
                <p className="price">
                  <span className="price-currency">$</span>
                  {tier.price.replace("$", "")}
                  {tier.cycle ? <span className="price-cycle">{tier.cycle}</span> : null}
                </p>
                <p>{tier.summary}</p>
                <ul>
                  {tier.features.map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
                <Link href={tier.href} className={`editorial-button ${tier.highlight ? "accent" : "primary"}`}>
                  {tier.cta}
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="full-bleed-section cta-section">
        <div className="section-inner">
          <span className="section-label reveal-el" data-delay="0">Get Started Today</span>
          <h2 className="reveal-el" data-delay="100">
            Your first 6 images are <span className="accent-italic">on us.</span>
          </h2>
          <div className="cta-actions reveal-el" data-delay="200">
            <Link href="/upload" className="editorial-button accent editorial-button-large">
              Upload Your First Image
            </Link>
            <Link href="/billing" className="editorial-button ghost editorial-button-large">
              See Pricing →
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
