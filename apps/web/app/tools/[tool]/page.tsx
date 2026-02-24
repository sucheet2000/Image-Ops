import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "../../components/json-ld";
import { ToolWorkbench } from "../../components/tool-workbench";
import { findTool, getBaseUrl, TOOL_PAGES, USE_CASE_PAGES } from "../../lib/seo-data";

type ToolPageProps = {
  params: Promise<{ tool: string }>;
};

type ToolNarrative = {
  beforeTitle: string;
  beforeCopy: string;
  afterTitle: string;
  afterCopy: string;
  numberedFeatures: string[];
};

const narrativeByTool: Record<string, ToolNarrative> = {
  resize: {
    beforeTitle: "Before: platform mismatch",
    beforeCopy: "Different channels require different dimensions, crops, and frame proportions.",
    afterTitle: "After: one preset, exact fit",
    afterCopy: "Apply platform-safe dimensions and preserve composition with predictable fit modes.",
    numberedFeatures: [
      "Preset dimensions for Amazon, Etsy, Shopify, and social catalogs",
      "Aspect-ratio aware fit modes: contain, cover, fill, inside, outside",
      "Consistent output across repeated batch operations"
    ]
  },
  compress: {
    beforeTitle: "Before: heavy image payloads",
    beforeCopy: "Large files slow listing pages, strain mobile users, and hurt conversion rate.",
    afterTitle: "After: perceptual lightweight outputs",
    afterCopy: "Reduce file size while preserving texture and detail where buyers focus most.",
    numberedFeatures: [
      "Perceptual quality tuning instead of naive byte reduction",
      "Configurable quality controls for storefront-specific targets",
      "Predictable tradeoff between visual detail and payload size"
    ]
  },
  convert: {
    beforeTitle: "Before: incompatible formats",
    beforeCopy: "One platform expects JPG while another needs PNG or WEBP constraints.",
    afterTitle: "After: channel-ready exports",
    afterCopy: "Convert format without losing dimensions, then deliver exactly what each channel needs.",
    numberedFeatures: [
      "JPG, PNG, and WEBP conversion with output-quality control",
      "Dimension-preserving format changes for reliable listing QA",
      "Simple route to create fallback assets for mixed compatibility"
    ]
  },
  "background-remove": {
    beforeTitle: "Before: distracting product scenes",
    beforeCopy: "Busy backgrounds weaken product focus and add friction to listing approvals.",
    afterTitle: "After: clean isolated subjects",
    afterCopy: "Generate transparent cutouts for cleaner thumbnails, ads, and marketplace hero shots.",
    numberedFeatures: [
      "Edge-aware subject extraction for common ecommerce product shapes",
      "Transparent PNG/WEBP outputs for design reuse",
      "Advanced workflow designed for high-impact visual assets"
    ]
  }
};

export function generateStaticParams() {
  return TOOL_PAGES.map((tool) => ({ tool: tool.slug }));
}

export async function generateMetadata({ params }: ToolPageProps): Promise<Metadata> {
  const resolved = await params;
  const tool = findTool(resolved.tool);
  if (!tool) {
    return { title: "Tool Not Found | Image Ops" };
  }

  const baseUrl = getBaseUrl();
  const title = `${tool.name} Tool | Image Ops`;
  const description = tool.summary;

  return {
    title,
    description,
    keywords: tool.keywords,
    alternates: {
      canonical: `${baseUrl}/tools/${tool.slug}`
    },
    openGraph: {
      title,
      description,
      type: "website",
      url: `${baseUrl}/tools/${tool.slug}`
    }
  };
}

export default async function ToolPage({ params }: ToolPageProps) {
  const resolved = await params;
  const tool = findTool(resolved.tool);
  if (!tool) {
    notFound();
  }

  const narrative = narrativeByTool[tool.slug] || narrativeByTool.resize;
  const whenToUse = tool.whenToUse || "Use this tool when you need predictable, marketplace-safe outputs.";
  const baseUrl = getBaseUrl();

  const softwareSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: `Image Ops ${tool.name}`,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: `${baseUrl}/tools/${tool.slug}`,
    description: tool.summary
  };

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: tool.faq.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer
      }
    }))
  };

  const relatedUseCases = USE_CASE_PAGES.filter((item) => item.recommendedTools.includes(tool.slug)).slice(0, 3);

  return (
    <>
      <section className="full-bleed-section editorial-page-hero">
        <div className="section-inner">
          <span className="section-label reveal-el" data-delay="0">Tool / {tool.slug}</span>
          <h1 className="reveal-el" data-delay="100">
            {tool.name.split(" ").map((word, index) => (
              <span key={word + index} style={index === tool.name.split(" ").length - 1 ? { fontStyle: "italic" } : undefined}>
                {word}{" "}
              </span>
            ))}
          </h1>
          <p className="section-lead reveal-el" data-delay="200">{tool.summary}</p>
        </div>
      </section>

      <section className="editorial-panel">
        <div className="editorial-media">
          <div className="editorial-media-inner" data-parallax-speed="0.12" />
          <span className="vertical-tag">Before / After</span>
          <article className="stat-card reveal-el" data-delay="120">
            <span className="stat-label">Average Processing Time</span>
            <p className="stat-value">
              3.2<span className="unit">S</span>
            </p>
            <p className="stat-caption">Per image in standard mode</p>
          </article>
        </div>
        <div className="editorial-text">
          <span className="section-label reveal-el" data-delay="0">{narrative.beforeTitle}</span>
          <h2 className="reveal-el" data-delay="100">{narrative.afterTitle}</h2>
          <p className="section-lead reveal-el" data-delay="180">{narrative.beforeCopy}</p>
          <p className="section-lead reveal-el" data-delay="250">{narrative.afterCopy}</p>
        </div>
      </section>

      <section className="full-bleed-section" style={{ background: "var(--cream)" }}>
        <div className="section-inner">
          <span className="section-label reveal-el" data-delay="0">Feature List</span>
          <h2 className="reveal-el" data-delay="100">What this tool delivers.</h2>
          <p className="section-lead reveal-el" data-delay="160">{whenToUse}</p>
          <ol className="editorial-list reveal-el" data-delay="220">
            {narrative.numberedFeatures.map((feature, index) => (
              <li key={feature}>
                <span className="editorial-list-number">{String(index + 1).padStart(2, "0")}</span>
                <span>{feature}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <ToolWorkbench tool={tool.slug} title={`Run ${tool.name}`} intro="Execute the complete upload-to-download pipeline directly in this page." />

      <section className="full-bleed-section" style={{ background: "var(--parchment)" }}>
        <div className="section-inner editorial-card-row">
          {tool.faq.map((item, index) => (
            <article key={item.question} className="editorial-card reveal-el" data-delay={String(index * 80)}>
              <span className="section-label">FAQ</span>
              <h3 style={{ marginTop: "0.5rem" }}>{item.question}</h3>
              <p style={{ marginTop: "0.45rem", color: "var(--muted)" }}>{item.answer}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="full-bleed-section" style={{ background: "var(--terracotta)", color: "var(--white)" }}>
        <div className="section-inner" style={{ display: "grid", gap: "1rem", alignItems: "center", gridTemplateColumns: "1fr auto" }}>
          <div>
            <span className="section-label" style={{ color: "var(--white)" }}>Continue Workflow</span>
            <h2 style={{ color: "var(--white)" }}>Need a full sequence? Build your image run now.</h2>
          </div>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <Link href="/upload" className="editorial-button primary">
              Open Upload Studio
            </Link>
            <Link href="/tools" className="editorial-button ghost" style={{ borderColor: "rgba(250,250,247,0.35)", color: "var(--white)" }}>
              All Tools
            </Link>
          </div>
        </div>
      </section>

      <section className="full-bleed-section" style={{ background: "var(--cream)" }}>
        <div className="section-inner">
          <span className="section-label">Related Use Cases</span>
          <div className="editorial-card-row" style={{ marginTop: "1rem" }}>
            {relatedUseCases.map((item, index) => (
              <article key={item.slug} className="editorial-card reveal-el" data-delay={String(index * 80)}>
                <h3>{item.title}</h3>
                <p style={{ marginTop: "0.5rem", color: "var(--muted)" }}>{item.summary}</p>
                <Link href={`/use-cases/${item.slug}`} className="ui-link" style={{ marginTop: "0.9rem" }}>
                  Open Use Case →
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <JsonLd data={softwareSchema} />
      <JsonLd data={faqSchema} />
    </>
  );
}
