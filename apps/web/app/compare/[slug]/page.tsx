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
    <main className="container">
      <h1>{page.title}</h1>
      <p className="subhead">{page.summary}</p>

      <section className="card">
        <h2>Winner When</h2>
        <p>{page.winnerWhen}</p>
        <h2>But Consider</h2>
        <p>{page.winnerBut}</p>
      </section>

      <section className="card">
        <h2>Decision Checklist</h2>
        <ul>
          {page.decisionChecklist.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>Related Pages</h2>
        <ul>
          <li><Link href="/tools/convert">Tool: Convert</Link></li>
          <li><Link href="/guides/batch-convert-marketplace-images">Guide: Batch Convert Marketplace Images</Link></li>
          <li><Link href="/for/shopify/ad-creative-prep">Workflow: Shopify Ad Creative Prep</Link></li>
        </ul>
      </section>

      <JsonLd data={articleSchema} />
    </main>
  );
}
