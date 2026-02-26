import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import FadeReveal from '../../../components/animation/FadeReveal';
import WipeText from '../../../components/animation/WipeText';
import { JsonLd } from '../../components/json-ld';
import { findGuide, getBaseUrl, GUIDE_PAGES } from '../../lib/seo-data';

type GuidePageProps = {
  params: Promise<{ topic: string }>;
};

export const revalidate = 86400;

export function generateStaticParams() {
  return GUIDE_PAGES.map((guide) => ({ topic: guide.topic }));
}

export async function generateMetadata({ params }: GuidePageProps): Promise<Metadata> {
  const resolved = await params;
  const guide = findGuide(resolved.topic);
  if (!guide) {
    return { title: 'Guide Not Found | Image Ops' };
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
      type: 'article',
      url,
    },
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
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: guide.title,
    description: guide.summary,
    url,
    step: guide.steps.map((step, index) => ({
      '@type': 'HowToStep',
      position: index + 1,
      name: step,
    })),
  };

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: guide.faq.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };

  return (
    <>
      <section className="full-bleed-section editorial-page-hero" style={{ minHeight: '62vh' }}>
        <div className="section-inner">
          <FadeReveal as="span" className="section-label" delay={0}>
            Guide
          </FadeReveal>
          <WipeText as="h1" triggerOnMount>
            {guide.title}
          </WipeText>
          <FadeReveal delay={180}>
            <p className="section-lead">{guide.summary}</p>
          </FadeReveal>
        </div>
      </section>

      <section className="editorial-page-grid">
        <div className="editorial-page-copy">
          <FadeReveal as="span" className="section-label" delay={0}>
            Step Sequence
          </FadeReveal>
          <WipeText as="h2">Follow this order.</WipeText>
          <ol className="editorial-list" style={{ marginTop: '1rem' }}>
            {guide.steps.map((step, index) => (
              <FadeReveal key={step} as="li" delay={180 + index * 80} y={10}>
                <span className="editorial-list-number">{String(index + 1).padStart(2, '0')}</span>
                <span>{step}</span>
              </FadeReveal>
            ))}
          </ol>
        </div>

        <aside className="editorial-page-side">
          <FadeReveal as="span" className="section-label" delay={0}>
            Related Tools
          </FadeReveal>
          <ul className="editorial-page-list">
            {guide.relatedTools.map((tool) => (
              <FadeReveal key={tool} as="li" delay={100}>
                <Link href={`/tools/${tool}`}>{tool}</Link>
              </FadeReveal>
            ))}
          </ul>
          <div className="editorial-card" style={{ marginTop: '1rem' }}>
            <p className="section-label">More Reading</p>
            <p style={{ marginTop: '0.5rem' }}>
              <Link href="/compare/jpg-vs-png">Compare: JPG vs PNG</Link>
            </p>
            <p>
              <Link href="/for/amazon/main-image-compliance">
                Workflow: Amazon Main Image Compliance
              </Link>
            </p>
            <p>
              <Link href="/use-cases/amazon-listings">Use case: Amazon Listings</Link>
            </p>
          </div>
        </aside>
      </section>

      <section className="full-bleed-section" style={{ background: 'var(--parchment)' }}>
        <div className="section-inner editorial-card-row">
          {guide.faq.map((item, index) => (
            <FadeReveal key={item.question} delay={index * 80}>
              <article className="editorial-card">
                <span className="section-label">FAQ</span>
                <h3 style={{ marginTop: '0.6rem' }}>{item.question}</h3>
                <p style={{ marginTop: '0.45rem', color: 'var(--muted)' }}>{item.answer}</p>
              </article>
            </FadeReveal>
          ))}
        </div>
      </section>

      <JsonLd data={howToSchema} />
      <JsonLd data={faqSchema} />
    </>
  );
}
