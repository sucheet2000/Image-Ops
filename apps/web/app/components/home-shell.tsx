"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import FadeReveal from "../../components/animation/FadeReveal";
import HorizontalScroll from "../../components/animation/HorizontalScroll";
import ScrambleNumber from "../../components/animation/ScrambleNumber";
import WipeText from "../../components/animation/WipeText";
import { useMagnetic } from "../../components/cursor/useMagnetic";
import { onScroll } from "../../lib/lenis";

type EditorialPanel = {
  id: string;
  number: string;
  label: string;
  title: string;
  accent: string;
  body: string;
  features: string[];
  statLabel: string;
  statValue: number;
  statUnit: string;
  statDecimals: number;
  statCaption: string;
  mediaTag: string;
  mediaVariant?: "alt-green" | "alt-violet";
  flip?: boolean;
};

type ToolCell = {
  number: string;
  name: string;
  summary: string;
  href: string;
  plan: "free" | "pro";
};

type StatRow = {
  value: number;
  suffix: string;
  decimals: number;
  label: string;
  desc: string;
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
    statValue: 3.2,
    statUnit: "S",
    statDecimals: 1,
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
    statValue: 84,
    statUnit: "%",
    statDecimals: 0,
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
    statValue: 40,
    statUnit: "+",
    statDecimals: 0,
    statCaption: "Etsy, Amazon, Shopify & more",
    mediaTag: "Smart Resize",
    mediaVariant: "alt-violet"
  }
];

const toolCells: ToolCell[] = [
  {
    number: "01",
    name: "Background Removal",
    summary: "AI-powered edge detection with transparent or custom background output.",
    href: "/tools/background-remove",
    plan: "free"
  },
  {
    number: "02",
    name: "Smart Compress",
    summary: "Perceptual compression tuned for quality-retaining size reduction.",
    href: "/tools/compress",
    plan: "free"
  },
  {
    number: "03",
    name: "Platform Resize",
    summary: "Channel-safe dimensions and framing for marketplace catalogs.",
    href: "/tools/resize",
    plan: "free"
  },
  {
    number: "04",
    name: "Format Convert",
    summary: "Convert JPG, PNG, and WEBP for compatibility without loss of control.",
    href: "/tools/convert",
    plan: "free"
  },
  {
    number: "05",
    name: "Brand Watermark",
    summary: "Protect creative assets with repeatable watermark overlays and brand marks.",
    href: "/upload",
    plan: "pro"
  },
  {
    number: "06",
    name: "Bulk Export",
    summary: "Run high-volume transformations and grouped downloads in one queue.",
    href: "/upload",
    plan: "pro"
  }
];

const stats: StatRow[] = [
  {
    value: 12,
    suffix: "K+",
    decimals: 0,
    label: "Active Sellers",
    desc: "Marketplace sellers across Etsy, Amazon, and Shopify trust ImageOps daily."
  },
  {
    value: 2.4,
    suffix: "M",
    decimals: 1,
    label: "Images Processed",
    desc: "Over 2.4 million product images processed in the last 90 days."
  },
  {
    value: 84,
    suffix: "%",
    decimals: 0,
    label: "Avg Size Reduction",
    desc: "Average file size reduction without any perceptible quality loss."
  },
  {
    value: 3.2,
    suffix: "s",
    decimals: 1,
    label: "Processing Time",
    desc: "Average time from upload to download, including background removal."
  },
  {
    value: 40,
    suffix: "+",
    decimals: 0,
    label: "Platform Presets",
    desc: "Ready-to-use dimensions for every major marketplace and social platform."
  },
  {
    value: 99.9,
    suffix: "%",
    decimals: 1,
    label: "Uptime SLA",
    desc: "Enterprise-grade infrastructure. We do not go down when you need us."
  }
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

function HomeToolCard({ tool, index }: { tool: ToolCell; index: number }) {
  const cardRef = useMagnetic(0.2);

  return (
    <article ref={cardRef as never} className="tool-cell tool-card">
      <span className={`badge ${tool.plan} tool-cell-badge`}>{tool.plan}</span>
      <FadeReveal as="span" className="tool-cell-number" delay={index * 80}>
        {tool.number}
      </FadeReveal>
      <FadeReveal as="h3" className="tool-cell-title" delay={80 + index * 80}>
        {tool.name}
      </FadeReveal>
      <FadeReveal as="p" className="tool-cell-copy tool-desc" delay={140 + index * 80}>
        {tool.summary}
      </FadeReveal>
      <FadeReveal as="div" delay={200 + index * 80}>
        <Link href={tool.href} className="ui-link tool-cell-link">
          Try Tool <span className="tool-arrow-icon">→</span>
        </Link>
      </FadeReveal>
    </article>
  );
}

function EditorialMediaPanel({ panel }: { panel: EditorialPanel }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      return;
    }

    return onScroll(() => {
      const wrapper = wrapperRef.current;
      const inner = innerRef.current;
      if (!wrapper || !inner) {
        return;
      }
      const rect = wrapper.getBoundingClientRect();
      const center = rect.top + rect.height / 2 - window.innerHeight / 2;
      inner.style.transform = `translateY(${center * 0.1}px)`;
    });
  }, []);

  return (
    <div className="editorial-media" ref={wrapperRef}>
      <div
        ref={innerRef}
        className={`editorial-media-inner${panel.mediaVariant ? ` ${panel.mediaVariant}` : ""}`}
        style={{ willChange: "transform" }}
      />
      <span className="vertical-tag">{panel.mediaTag}</span>
      <FadeReveal delay={400} y={20}>
        <article className="stat-card">
          <span className="stat-label">{panel.statLabel}</span>
          <p className="stat-value">
            <ScrambleNumber value={panel.statValue} decimals={panel.statDecimals} />
            <span className="unit">{panel.statUnit}</span>
          </p>
          <p className="stat-caption">{panel.statCaption}</p>
        </article>
      </FadeReveal>
    </div>
  );
}

function EditorialStoryPanel({ panel }: { panel: EditorialPanel }) {
  const textContent = (
    <div className="editorial-text">
      <FadeReveal x={-12} y={0} delay={0}>
        <span className="section-label">
          {panel.number} - {panel.label}
        </span>
      </FadeReveal>
      <WipeText as="h2">{panel.title}</WipeText>
      <WipeText as="h2" delay={100}>
        <span className="accent-italic">{panel.accent}</span>
      </WipeText>
      <FadeReveal delay={180}>
        <p className="section-lead">{panel.body}</p>
      </FadeReveal>
      <ol className="editorial-list">
        {panel.features.map((feature, index) => (
          <FadeReveal key={feature} as="li" delay={index * 80} y={10}>
            <span className="editorial-list-number">{String(index + 1).padStart(2, "0")}</span>
            <span>{feature}</span>
          </FadeReveal>
        ))}
      </ol>
    </div>
  );

  const mediaContent = <EditorialMediaPanel panel={panel} />;

  return (
    <section className="editorial-panel">
      {panel.flip ? (
        <>
          {textContent}
          {mediaContent}
        </>
      ) : (
        <>
          {mediaContent}
          {textContent}
        </>
      )}
    </section>
  );
}

export function HomeShell() {
  const heroDecoRef = useRef<HTMLSpanElement>(null);
  const heroPrimaryCtaRef = useMagnetic(0.3);
  const heroSecondaryCtaRef = useMagnetic(0.3);

  useEffect(() => {
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      return;
    }

    return onScroll((scroll) => {
      if (heroDecoRef.current) {
        heroDecoRef.current.style.transform = `translateY(${scroll * 0.04}px)`;
      }
    });
  }, []);

  const duplicatedMarquee = [...marqueeItems, ...marqueeItems];

  return (
    <>
      <section className="full-bleed-section hero-section">
        <div className="hero-background" data-mouse-parallax />
        <span ref={heroDecoRef} className="hero-deco" aria-hidden="true">
          01
        </span>
        <div className="section-inner">
          <div className="hero-grid">
            <div>
              <FadeReveal as="span" className="section-label hero-kicker" delay={100}>
                Professional Image Tools - For Marketplace Sellers
              </FadeReveal>
              <WipeText as="h1" triggerOnMount>
                Your images,
              </WipeText>
              <WipeText as="h1" triggerOnMount delay={120}>
                <span className="accent-italic">elevated.</span>
              </WipeText>
              <FadeReveal className="scroll-hint" delay={900}>
                Scroll to Explore
              </FadeReveal>
            </div>
            <div>
              <FadeReveal delay={700}>
                <p className="hero-copy">
                  Remove backgrounds, resize, compress, and convert product images with deliberate precision. Built for
                  sellers who care how every listing looks before first click.
                </p>
              </FadeReveal>
              <FadeReveal className="hero-actions" delay={900}>
                <Link
                  href="/upload"
                  ref={heroPrimaryCtaRef as never}
                  className="editorial-button accent editorial-button-large btn-primary"
                >
                  <span>Start Free - No Account Needed</span>
                </Link>
                <Link
                  href="/tools"
                  ref={heroSecondaryCtaRef as never}
                  className="editorial-button ghost editorial-button-large btn-cream"
                >
                  <span>See All Tools</span>
                </Link>
              </FadeReveal>
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
          <FadeReveal delay={0}>
            <p className="pull-quote">
              <span className="pull-quote-mark">“</span>
              My product photos went from amateur to professional in seconds. My Etsy conversion rate jumped 34% in the
              first month.
              <span className="pull-quote-mark">”</span>
            </p>
          </FadeReveal>
          <FadeReveal as="span" className="pull-quote-attribution" delay={120}>
            - Maria S., Etsy Top Seller · 2,400+ Monthly Sales
          </FadeReveal>
        </div>
      </section>

      {editorialPanels.map((panel) => (
        <EditorialStoryPanel key={panel.id} panel={panel} />
      ))}

      <section className="full-bleed-section stats-row">
        <div className="section-inner">
          <HorizontalScroll className="hscroll-section">
            {stats.map((stat, index) => (
              <article key={stat.label} className="hstat-card">
                <p className="hstat-num">
                  <ScrambleNumber value={stat.value} suffix={stat.suffix} decimals={stat.decimals} />
                </p>
                <p className="hstat-label">{stat.label}</p>
                <p className="hstat-desc">{stat.desc}</p>
                <span className="hstat-index">{String(index + 1).padStart(2, "0")}</span>
              </article>
            ))}
          </HorizontalScroll>
        </div>
      </section>

      <section className="full-bleed-section tools-section" id="tools">
        <div className="section-inner">
          <div className="tools-head">
            <WipeText as="h2">
              Everything your images <span className="accent-italic">need.</span>
            </WipeText>
            <FadeReveal delay={100}>
              <p className="section-lead">
                Six professional-grade workflows built for the demands of marketplace selling at scale.
              </p>
            </FadeReveal>
          </div>
          <div className="tools-grid">
            {toolCells.map((tool, index) => (
              <HomeToolCard key={tool.number} tool={tool} index={index} />
            ))}
          </div>
        </div>
      </section>

      <section className="full-bleed-section pricing-section" id="pricing">
        <div className="section-inner">
          <div className="pricing-head">
            <WipeText as="h2">
              Simple, <span className="accent-italic">honest</span> pricing.
            </WipeText>
            <FadeReveal delay={100}>
              <p className="section-lead">
                Start free. Upgrade when ready. No hidden fees and no locked features that disappear.
              </p>
            </FadeReveal>
          </div>
          <div className="pricing-grid">
            {pricingTiers.map((tier, index) => (
              <article key={tier.name} className={`pricing-card${tier.highlight ? " highlight" : ""}`}>
                {tier.highlight ? <span className="popular-tag">Most Popular</span> : null}
                <FadeReveal as="span" className="section-label" delay={index * 80}>
                  {tier.name}
                </FadeReveal>
                <FadeReveal as="p" className="price" delay={80 + index * 80}>
                  <span className="price-currency">$</span>
                  {tier.price.replace("$", "")}
                  {tier.cycle ? <span className="price-cycle">{tier.cycle}</span> : null}
                </FadeReveal>
                <FadeReveal delay={140 + index * 80}>
                  <p>{tier.summary}</p>
                </FadeReveal>
                <ul>
                  {tier.features.map((feature, featureIndex) => (
                    <FadeReveal as="li" key={feature} delay={200 + featureIndex * 60 + index * 40} y={8}>
                      {feature}
                    </FadeReveal>
                  ))}
                </ul>
                <FadeReveal delay={220 + index * 80}>
                  <Link href={tier.href} className={`editorial-button ${tier.highlight ? "accent" : "primary"} plan-btn`}>
                    <span>{tier.cta}</span>
                  </Link>
                </FadeReveal>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="full-bleed-section cta-section">
        <div className="section-inner">
          <FadeReveal as="span" className="section-label" delay={0}>
            Get Started Today
          </FadeReveal>
          <WipeText as="h2" delay={100}>
            Your first 6 images are <span className="accent-italic">on us.</span>
          </WipeText>
          <FadeReveal className="cta-actions" delay={200}>
            <Link href="/upload" className="editorial-button accent editorial-button-large btn-primary">
              <span>Upload Your First Image</span>
            </Link>
            <Link href="/billing" className="editorial-button ghost editorial-button-large btn-cream">
              <span>See Pricing →</span>
            </Link>
          </FadeReveal>
        </div>
      </section>
    </>
  );
}
