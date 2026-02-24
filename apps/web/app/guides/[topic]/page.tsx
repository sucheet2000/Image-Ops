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
    <main className="container">
      <h1>{guide.title}</h1>
      <p className="subhead">{guide.summary}</p>

      <section className="card">
        <h2>Steps</h2>
        <ol>
          {guide.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>

      <section className="card">
        <h2>Related Tools</h2>
        <ul>
          {guide.relatedTools.map((tool) => (
            <li key={tool}>
              <Link href={`/tools/${tool}`}>{tool}</Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>More Reading</h2>
        <ul>
          <li><Link href="/compare/jpg-vs-png">Compare: JPG vs PNG</Link></li>
          <li><Link href="/for/amazon/main-image-compliance">Workflow: Amazon Main Image Compliance</Link></li>
          <li><Link href="/use-cases/amazon-listings">Use case: Amazon Listings</Link></li>
        </ul>
      </section>

      <section className="card">
        <h2>FAQ</h2>
        {guide.faq.map((item) => (
          <article key={item.question}>
            <h3>{item.question}</h3>
            <p>{item.answer}</p>
          </article>
        ))}
      </section>

      <JsonLd data={howToSchema} />
      <JsonLd data={faqSchema} />
    </main>
  );
}
