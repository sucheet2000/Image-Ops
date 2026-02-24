import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
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
    <main className="container">
      <h1>{page.title}</h1>
      <p className="subhead">{page.summary}</p>

      <section className="card">
        <h2>Recommended Workflow</h2>
        <ol>
          {page.recommendedTools.map((tool) => (
            <li key={tool}>
              <Link href={`/tools/${tool}`}>{tool}</Link>
            </li>
          ))}
        </ol>
      </section>

      <section className="card">
        <h2>FAQ</h2>
        {page.faq.map((item) => (
          <article key={item.question}>
            <h3>{item.question}</h3>
            <p>{item.answer}</p>
          </article>
        ))}
      </section>

      <section className="card">
        <h2>More SEO Pages</h2>
        <ul>
          <li><Link href="/guides/prepare-amazon-main-images">Guide: Prepare Amazon Main Images</Link></li>
          <li><Link href="/use-cases/amazon-listings">Use case: Amazon Listings</Link></li>
          <li><Link href="/compare/jpg-vs-png">Compare: JPG vs PNG</Link></li>
        </ul>
      </section>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(howToSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
    </main>
  );
}
