import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
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
          <span className="section-label reveal-el" data-delay="0">Comparison</span>
          <h1 className="reveal-el" data-delay="100">{page.title}</h1>
          <p className="section-lead reveal-el" data-delay="180">{page.summary}</p>
        </div>
      </section>

      <section className="editorial-page-grid">
        <div className="editorial-page-copy">
          <span className="section-label reveal-el" data-delay="0">Decision Core</span>
          <h2 className="reveal-el" data-delay="100">Winner When</h2>
          <p className="section-lead reveal-el" data-delay="180">{page.winnerWhen}</p>
          <h3 className="reveal-el" data-delay="230" style={{ marginTop: "1rem" }}>But Consider</h3>
          <p className="section-lead reveal-el" data-delay="280">{page.winnerBut}</p>
        </div>

        <aside className="editorial-page-side">
          <span className="section-label reveal-el" data-delay="80">Checklist</span>
          <ol className="editorial-list reveal-el" data-delay="140">
            {page.decisionChecklist.map((item, index) => (
              <li key={item}>
                <span className="editorial-list-number">{String(index + 1).padStart(2, "0")}</span>
                <span>{item}</span>
              </li>
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
