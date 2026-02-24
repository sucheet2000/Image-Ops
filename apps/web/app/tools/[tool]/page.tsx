import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { findTool, getBaseUrl, TOOL_PAGES, USE_CASE_PAGES } from "../../lib/seo-data";

type ToolPageProps = {
  params: Promise<{ tool: string }>;
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
    <main className="container">
      <h1>{tool.name}</h1>
      <p className="subhead">{tool.summary}</p>
      <section className="card">
        <h2>When to use</h2>
        <p>Use this tool when your marketplace channel requires fast, clean product imagery at scale.</p>
      </section>
      <section className="card">
        <h2>Keywords</h2>
        <p>{tool.keywords.join(" · ")}</p>
      </section>

      <section className="card">
        <h2>Common Questions</h2>
        {tool.faq.map((item) => (
          <article key={item.question}>
            <h3>{item.question}</h3>
            <p>{item.answer}</p>
          </article>
        ))}
      </section>

      <section className="card">
        <h2>Related Pages</h2>
        <ul>
          <li><Link href="/guides/prepare-amazon-main-images">Guide: Prepare Amazon Main Images</Link></li>
          {relatedUseCases.map((item) => (
            <li key={item.slug}>
              <Link href={`/use-cases/${item.slug}`}>{item.title}</Link>
            </li>
          ))}
          <li><Link href="/compare/jpg-vs-png">Compare: JPG vs PNG</Link></li>
        </ul>
      </section>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
    </main>
  );
}
