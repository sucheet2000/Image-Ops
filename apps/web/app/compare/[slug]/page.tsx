import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import FadeReveal from "../../../components/animation/FadeReveal";
import WipeText from "../../../components/animation/WipeText";
import { JsonLd } from "../../components/json-ld";
import { COMPARE_PAGES, findCompare, getBaseUrl } from "../../lib/seo-data";

type ComparePageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return COMPARE_PAGES.map((item) => ({ slug: item.slug }));
}

export async function generateMetadata({ params }: ComparePageProps): Promise<Metadata> {
  const resolved = await params;
  const page = findCompare(resolved.slug);
  if (!page) {
    return { title: "Comparison Not Found | Image Ops" };
  }

  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/compare/${page.slug}`;
  return {
    title: `${page.title} | Image Ops`,
    description: page.summary,
    alternates: { canonical: url },
    openGraph: {
      title: `${page.title} | Image Ops`,
      description: page.summary,
      type: "article",
      url
    }
  };
}

export default async function ComparePage({ params }: ComparePageProps) {
  const resolved = await params;
  const page = findCompare(resolved.slug);
  if (!page) {
    notFound();
  }

  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/compare/${page.slug}`;
  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: page.title,
    description: page.summary,
    url
  };

  return (
    <>
      <section className="full-bleed-section editorial-page-hero" style={{ minHeight: "56vh" }}>
        <div className="section-inner">
          <FadeReveal as="span" className="section-label" delay={0}>
            Comparison
          </FadeReveal>
          <WipeText as="h1" triggerOnMount>
            {page.title}
          </WipeText>
          <FadeReveal delay={180}>
            <p className="section-lead">{page.summary}</p>
          </FadeReveal>
        </div>
      </section>

      <section className="editorial-page-grid">
        <div className="editorial-page-copy">
          <FadeReveal as="span" className="section-label" delay={0}>
            Decision Core
          </FadeReveal>
          <WipeText as="h2">Winner When</WipeText>
          <FadeReveal delay={180}>
            <p className="section-lead">{page.winnerWhen}</p>
          </FadeReveal>
          <FadeReveal as="h3" delay={230} style={{ marginTop: "1rem" }}>
            But Consider
          </FadeReveal>
          <FadeReveal delay={280}>
            <p className="section-lead">{page.winnerBut}</p>
          </FadeReveal>
        </div>

        <aside className="editorial-page-side">
          <FadeReveal as="span" className="section-label" delay={80}>
            Checklist
          </FadeReveal>
          <ol className="editorial-list">
            {page.decisionChecklist.map((item, index) => (
              <FadeReveal key={item} as="li" delay={140 + index * 80} y={10}>
                <span className="editorial-list-number">{String(index + 1).padStart(2, "0")}</span>
                <span>{item}</span>
              </FadeReveal>
            ))}
          </ol>
          <div className="editorial-card" style={{ marginTop: "1rem" }}>
            <p className="section-label">Related Pages</p>
            <p style={{ marginTop: "0.5rem" }}><Link href="/tools/convert">Tool: Convert</Link></p>
            <p><Link href="/guides/batch-convert-marketplace-images">Guide: Batch Convert Marketplace Images</Link></p>
            <p><Link href="/for/shopify/ad-creative-prep">Workflow: Shopify Ad Creative Prep</Link></p>
          </div>
        </aside>
      </section>

      <JsonLd data={articleSchema} />
    </>
  );
}
