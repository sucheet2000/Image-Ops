import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import FadeReveal from '../../../components/animation/FadeReveal';
import WipeText from '../../../components/animation/WipeText';
import { JsonLd } from '../../components/json-ld';
import { findUseCase, getBaseUrl, USE_CASE_PAGES } from '../../lib/seo-data';

type UseCasePageProps = {
  params: Promise<{ slug: string }>;
};

export const revalidate = 86400;

export function generateStaticParams() {
  return USE_CASE_PAGES.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: UseCasePageProps): Promise<Metadata> {
  const resolved = await params;
  const useCase = findUseCase(resolved.slug);
  if (!useCase) {
    return { title: 'Use Case Not Found | Image Ops' };
  }

  const baseUrl = getBaseUrl();
  const title = `${useCase.title} | Image Ops`;

  return {
    title,
    description: useCase.summary,
    alternates: {
      canonical: `${baseUrl}/use-cases/${useCase.slug}`,
    },
    openGraph: {
      title,
      description: useCase.summary,
      type: 'article',
      url: `${baseUrl}/use-cases/${useCase.slug}`,
    },
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
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: useCase.title,
    description: useCase.summary,
    url: `${baseUrl}/use-cases/${useCase.slug}`,
    step: useCase.recommendedTools.map((tool, index) => ({
      '@type': 'HowToStep',
      position: index + 1,
      name: `Run ${tool}`,
    })),
  };

  return (
    <>
      <section className="full-bleed-section editorial-page-hero" style={{ minHeight: '58vh' }}>
        <div className="section-inner">
          <FadeReveal as="span" className="section-label" delay={0}>
            Use Case
          </FadeReveal>
          <WipeText as="h1" triggerOnMount>
            {useCase.title}
          </WipeText>
          <FadeReveal delay={180}>
            <p className="section-lead">{useCase.summary}</p>
          </FadeReveal>
        </div>
      </section>

      <section className="editorial-page-grid">
        <div className="editorial-page-copy">
          <FadeReveal as="span" className="section-label" delay={0}>
            Recommended Sequence
          </FadeReveal>
          <WipeText as="h2">Execute in this order.</WipeText>
          <ol className="editorial-list" style={{ marginTop: '1rem' }}>
            {useCase.recommendedTools.map((tool, index) => (
              <FadeReveal key={tool} as="li" delay={200 + index * 80} y={10}>
                <span className="editorial-list-number">{String(index + 1).padStart(2, '0')}</span>
                <span>
                  <Link href={`/tools/${tool}`}>{tool}</Link>
                </span>
              </FadeReveal>
            ))}
          </ol>
        </div>

        <aside className="editorial-page-side">
          {useCase.relatedGuides.length > 0 ? (
            <>
              <FadeReveal as="span" className="section-label" delay={0}>
                Related Guides
              </FadeReveal>
              <ul className="editorial-page-list">
                {useCase.relatedGuides.map((item) => (
                  <FadeReveal key={item.href} as="li" delay={100}>
                    <Link href={item.href}>{item.title}</Link>
                  </FadeReveal>
                ))}
              </ul>
            </>
          ) : null}

          {useCase.relatedComparisons.length > 0 ? (
            <>
              <FadeReveal
                as="span"
                className="section-label"
                delay={160}
                style={{ marginTop: '1.1rem' }}
              >
                Format References
              </FadeReveal>
              <ul className="editorial-page-list">
                {useCase.relatedComparisons.map((item) => (
                  <FadeReveal key={item.href} as="li" delay={220}>
                    <Link href={item.href}>{item.title}</Link>
                  </FadeReveal>
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
