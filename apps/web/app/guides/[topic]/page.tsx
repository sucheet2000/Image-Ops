import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "../../components/json-ld";
import { findGuide, getBaseUrl, GUIDE_PAGES } from "../../lib/seo-data";

type GuidePageProps = {
  params: Promise<{ topic: string }>;
};

export function generateStaticParams() {
  return GUIDE_PAGES.map((guide) => ({ topic: guide.topic }));
}

export async function generateMetadata({ params }: GuidePageProps): Promise<Metadata> {
  const resolved = await params;
  const guide = findGuide(resolved.topic);
  if (!guide) {
    return { title: "Guide Not Found | Image Ops" };
  }

  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/guides/${guide.topic}`;
  return {
    title: `${guide.title} | Image Ops`,
    description: guide.summary,
    alternates: { canonical: url },
    openGraph: {
      title: `${guide.title} | Image Ops`,
      description: guide.summary,
      type: "article",
      url
    }
  };
}

export default async function GuidePage({ params }: GuidePageProps) {
  const resolved = await params;
  const guide = findGuide(resolved.topic);
  if (!guide) {
    notFound();
  }

  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/guides/${guide.topic}`;
  const howToSchema = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: guide.title,
    description: guide.summary,
    url,
    step: guide.steps.map((step, index) => ({
      "@type": "HowToStep",
      position: index + 1,
      name: step
    }))
  };

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: guide.faq.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer
      }
    }))
  };

  return (
    <>
      <section className="full-bleed-section editorial-page-hero" style={{ minHeight: "62vh" }}>
        <div className="section-inner">
          <span className="section-label reveal-el" data-delay="0">Guide</span>
          <h1 className="reveal-el" data-delay="100">{guide.title}</h1>
          <p className="section-lead reveal-el" data-delay="180">{guide.summary}</p>
        </div>
      </section>

      <section className="editorial-page-grid">
        <div className="editorial-page-copy">
          <span className="section-label reveal-el" data-delay="0">Step Sequence</span>
          <h2 className="reveal-el" data-delay="100">Follow this order.</h2>
          <ol className="editorial-list reveal-el" data-delay="180" style={{ marginTop: "1rem" }}>
            {guide.steps.map((step, index) => (
              <li key={step}>
                <span className="editorial-list-number">{String(index + 1).padStart(2, "0")}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>

        <aside className="editorial-page-side">
          <span className="section-label reveal-el" data-delay="0">Related Tools</span>
          <ul className="editorial-page-list reveal-el" data-delay="100">
            {guide.relatedTools.map((tool) => (
              <li key={tool}>
                <Link href={`/tools/${tool}`}>{tool}</Link>
              </li>
            ))}
          </ul>
          <div className="editorial-card" style={{ marginTop: "1rem" }}>
            <p className="section-label">More Reading</p>
            <p style={{ marginTop: "0.5rem" }}>
              <Link href="/compare/jpg-vs-png">Compare: JPG vs PNG</Link>
            </p>
            <p>
              <Link href="/for/amazon/main-image-compliance">Workflow: Amazon Main Image Compliance</Link>
            </p>
            <p>
              <Link href="/use-cases/amazon-listings">Use case: Amazon Listings</Link>
            </p>
          </div>
        </aside>
      </section>

      <section className="full-bleed-section" style={{ background: "var(--parchment)" }}>
        <div className="section-inner editorial-card-row">
          {guide.faq.map((item, index) => (
            <article key={item.question} className="editorial-card reveal-el" data-delay={String(index * 80)}>
              <span className="section-label">FAQ</span>
              <h3 style={{ marginTop: "0.6rem" }}>{item.question}</h3>
              <p style={{ marginTop: "0.45rem", color: "var(--muted)" }}>{item.answer}</p>
            </article>
          ))}
        </div>
      </section>

      <JsonLd data={howToSchema} />
      <JsonLd data={faqSchema} />
    </>
  );
}
