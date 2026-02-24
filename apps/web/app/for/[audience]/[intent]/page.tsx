import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "../../../components/json-ld";
import { AUDIENCE_INTENT_PAGES, findAudienceIntent, getBaseUrl } from "../../../lib/seo-data";

type AudienceIntentPageProps = {
  params: Promise<{ audience: string; intent: string }>;
};

export function generateStaticParams() {
  return AUDIENCE_INTENT_PAGES.map((item) => ({
    audience: item.audience,
    intent: item.intent
  }));
}

export async function generateMetadata({ params }: AudienceIntentPageProps): Promise<Metadata> {
  const resolved = await params;
  const page = findAudienceIntent(resolved.audience, resolved.intent);
  if (!page) {
    return { title: "Workflow Not Found | Image Ops" };
  }

  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/for/${page.audience}/${page.intent}`;

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

export default async function AudienceIntentPage({ params }: AudienceIntentPageProps) {
  const resolved = await params;
  const page = findAudienceIntent(resolved.audience, resolved.intent);
  if (!page) {
    notFound();
  }

  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/for/${page.audience}/${page.intent}`;

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: page.faq.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer
      }
    }))
  };

  const howToSchema = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: page.title,
    description: page.summary,
    url,
    step: page.recommendedTools.map((tool, index) => ({
      "@type": "HowToStep",
      position: index + 1,
      name: `Run ${tool}`,
      url: `${baseUrl}/tools/${tool}`
    }))
  };

  return (
    <>
      <section className="full-bleed-section editorial-page-hero" style={{ minHeight: "56vh" }}>
        <div className="section-inner">
          <span className="section-label reveal-el" data-delay="0">Workflow / {page.audience}</span>
          <h1 className="reveal-el" data-delay="100">{page.title}</h1>
          <p className="section-lead reveal-el" data-delay="180">{page.summary}</p>
        </div>
      </section>

      <section className="editorial-page-grid">
        <div className="editorial-page-copy">
          <span className="section-label reveal-el" data-delay="0">Recommended Flow</span>
          <h2 className="reveal-el" data-delay="100">Execute this sequence.</h2>
          <ol className="editorial-list reveal-el" data-delay="200" style={{ marginTop: "1rem" }}>
            {page.recommendedTools.map((tool, index) => (
              <li key={tool}>
                <span className="editorial-list-number">{String(index + 1).padStart(2, "0")}</span>
                <span>
                  <Link href={`/tools/${tool}`}>{tool}</Link>
                </span>
              </li>
            ))}
          </ol>
        </div>

        <aside className="editorial-page-side">
          <span className="section-label reveal-el" data-delay="80">FAQ</span>
          <div className="editorial-card-row" style={{ marginTop: "0.8rem" }}>
            {page.faq.map((item, index) => (
              <article key={item.question} className="editorial-card reveal-el" data-delay={String(120 + index * 80)}>
                <h3>{item.question}</h3>
                <p style={{ marginTop: "0.45rem", color: "var(--muted)" }}>{item.answer}</p>
              </article>
            ))}
          </div>
          <div className="editorial-card" style={{ marginTop: "1rem" }}>
            <p className="section-label">More SEO Pages</p>
            <p style={{ marginTop: "0.5rem" }}><Link href="/guides/prepare-amazon-main-images">Guide: Prepare Amazon Main Images</Link></p>
            <p><Link href="/use-cases/amazon-listings">Use case: Amazon Listings</Link></p>
            <p><Link href="/compare/jpg-vs-png">Compare: JPG vs PNG</Link></p>
          </div>
        </aside>
      </section>

      <JsonLd data={howToSchema} />
      <JsonLd data={faqSchema} />
    </>
  );
}
