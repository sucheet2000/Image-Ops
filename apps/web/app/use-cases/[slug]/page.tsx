import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "../../components/json-ld";
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
    <>
      <section className="full-bleed-section editorial-page-hero" style={{ minHeight: "58vh" }}>
        <div className="section-inner">
          <span className="section-label reveal-el" data-delay="0">Use Case</span>
          <h1 className="reveal-el" data-delay="100">{useCase.title}</h1>
          <p className="section-lead reveal-el" data-delay="180">{useCase.summary}</p>
        </div>
      </section>

      <section className="editorial-page-grid">
        <div className="editorial-page-copy">
          <span className="section-label reveal-el" data-delay="0">Recommended Sequence</span>
          <h2 className="reveal-el" data-delay="100">Execute in this order.</h2>
          <ol className="editorial-list reveal-el" data-delay="200" style={{ marginTop: "1rem" }}>
            {useCase.recommendedTools.map((tool, index) => (
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
          {useCase.relatedGuides.length > 0 ? (
            <>
              <span className="section-label reveal-el" data-delay="0">Related Guides</span>
              <ul className="editorial-page-list reveal-el" data-delay="100">
                {useCase.relatedGuides.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href}>{item.title}</Link>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {useCase.relatedComparisons.length > 0 ? (
            <>
              <span className="section-label reveal-el" data-delay="160" style={{ marginTop: "1.1rem" }}>Format References</span>
              <ul className="editorial-page-list reveal-el" data-delay="220">
                {useCase.relatedComparisons.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href}>{item.title}</Link>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </aside>
      </section>

      <JsonLd data={schema} />
    </>
  );
}
