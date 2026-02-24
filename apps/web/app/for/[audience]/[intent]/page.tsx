import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import FadeReveal from "../../../../components/animation/FadeReveal";
import WipeText from "../../../../components/animation/WipeText";
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
          <FadeReveal as="span" className="section-label" delay={0}>
            Workflow / {page.audience}
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
            Recommended Flow
          </FadeReveal>
          <WipeText as="h2">Execute this sequence.</WipeText>
          <ol className="editorial-list" style={{ marginTop: "1rem" }}>
            {page.recommendedTools.map((tool, index) => (
              <FadeReveal key={tool} as="li" delay={200 + index * 80} y={10}>
                <span className="editorial-list-number">{String(index + 1).padStart(2, "0")}</span>
                <span>
                  <Link href={`/tools/${tool}`}>{tool}</Link>
                </span>
              </FadeReveal>
            ))}
          </ol>
        </div>

        <aside className="editorial-page-side">
          <FadeReveal as="span" className="section-label" delay={80}>
            FAQ
          </FadeReveal>
          <div className="editorial-card-row" style={{ marginTop: "0.8rem" }}>
            {page.faq.map((item, index) => (
              <FadeReveal key={item.question} delay={120 + index * 80}>
                <article className="editorial-card">
                <h3>{item.question}</h3>
                <p style={{ marginTop: "0.45rem", color: "var(--muted)" }}>{item.answer}</p>
                </article>
              </FadeReveal>
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
