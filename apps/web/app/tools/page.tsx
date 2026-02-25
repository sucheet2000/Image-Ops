import type { Metadata } from 'next';
import Link from 'next/link';
import FadeReveal from '../../components/animation/FadeReveal';
import WipeText from '../../components/animation/WipeText';
import { TOOL_PAGES, getBaseUrl } from '../lib/seo-data';

export const metadata: Metadata = {
  title: 'Image Tools | Image Ops',
  description: 'Run resize, compress, convert, and background-remove workflows from one place.',
  alternates: {
    canonical: `${getBaseUrl()}/tools`,
  },
};

export default function ToolsIndexPage() {
  return (
    <>
      <section className="full-bleed-section editorial-page-hero" style={{ minHeight: '62vh' }}>
        <div className="section-inner">
          <FadeReveal as="span" className="section-label" delay={0}>
            Tool Catalog
          </FadeReveal>
          <WipeText as="h1" triggerOnMount>
            Every workflow. <span className="accent-italic">One studio.</span>
          </WipeText>
          <FadeReveal delay={180}>
            <p className="section-lead">
              Select a tool and execute a full upload, process, download, and cleanup loop
              in-browser.
            </p>
          </FadeReveal>
        </div>
      </section>

      <section className="full-bleed-section tools-section">
        <div className="section-inner">
          <div className="tools-grid">
            {TOOL_PAGES.map((tool, index) => (
              <article key={tool.slug} className="tool-cell tool-card">
                <span
                  className={`badge ${tool.slug === 'background-remove' ? 'pro' : 'free'} tool-cell-badge`}
                >
                  {tool.slug === 'background-remove' ? 'pro' : 'free'}
                </span>
                <FadeReveal as="span" className="tool-cell-number" delay={index * 80}>
                  {String(index + 1).padStart(2, '0')}
                </FadeReveal>
                <WipeText as="h2" className="tool-cell-title" delay={80 + index * 80}>
                  {tool.name}
                </WipeText>
                <FadeReveal as="p" className="tool-cell-copy tool-desc" delay={120 + index * 80}>
                  {tool.summary}
                </FadeReveal>
                <Link href={`/tools/${tool.slug}`} className="ui-link tool-cell-link">
                  Open Tool <span className="tool-arrow-icon">→</span>
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="full-bleed-section cta-section">
        <div className="section-inner">
          <FadeReveal as="span" className="section-label" delay={0}>
            Need end-to-end runs?
          </FadeReveal>
          <WipeText as="h2" delay={100}>
            Launch the unified <span className="accent-italic">upload studio.</span>
          </WipeText>
          <FadeReveal className="cta-actions" delay={180}>
            <Link
              href="/upload"
              className="editorial-button accent editorial-button-large btn-primary"
            >
              <span>Open Upload</span>
            </Link>
            <Link
              href="/dashboard"
              className="editorial-button ghost editorial-button-large btn-cream"
            >
              <span>View Dashboard</span>
            </Link>
          </FadeReveal>
        </div>
      </section>
    </>
  );
}
