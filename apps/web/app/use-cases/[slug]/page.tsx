import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { findUseCase, getBaseUrl, USE_CASE_PAGES } from "../../lib/seo-data";

type UseCasePageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return USE_CASE_PAGES.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: UseCasePageProps): Promise<Metadata> {
  const resolved = await params;
  const useCase = findUseCase(resolved.slug);
  if (!useCase) {
    return { title: "Use Case Not Found | Image Ops" };
  }

  const baseUrl = getBaseUrl();
  const title = `${useCase.title} | Image Ops`;

  return {
    title,
    description: useCase.summary,
    alternates: {
      canonical: `${baseUrl}/use-cases/${useCase.slug}`
    },
    openGraph: {
      title,
      description: useCase.summary,
      type: "article",
      url: `${baseUrl}/use-cases/${useCase.slug}`
    }
  };
}

export default async function UseCasePage({ params }: UseCasePageProps) {
  const resolved = await params;
  const useCase = findUseCase(resolved.slug);
  if (!useCase) {
    notFound();
  }

  const baseUrl = getBaseUrl();
  const schema = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: useCase.title,
    description: useCase.summary,
    url: `${baseUrl}/use-cases/${useCase.slug}`,
    step: useCase.recommendedTools.map((tool, index) => ({
      "@type": "HowToStep",
      position: index + 1,
      name: `Run ${tool}`
    }))
  };

  return (
    <main className="container">
      <h1>{useCase.title}</h1>
      <p className="subhead">{useCase.summary}</p>
      <section className="card">
        <h2>Recommended Tool Sequence</h2>
        <ol>
          {useCase.recommendedTools.map((tool) => (
            <li key={tool}>{tool}</li>
          ))}
        </ol>
      </section>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
    </main>
  );
}
