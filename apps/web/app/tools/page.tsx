import type { Metadata } from "next";
import Link from "next/link";
import { TOOL_PAGES, getBaseUrl } from "../lib/seo-data";

export const metadata: Metadata = {
  title: "Image Tools | Image Ops",
  description: "Run resize, compress, convert, and background-remove workflows from one place.",
  alternates: {
    canonical: `${getBaseUrl()}/tools`
  }
};

export default function ToolsIndexPage() {
  return (
    <>
      <section className="full-bleed-section editorial-page-hero" style={{ minHeight: "62vh" }}>
        <div className="section-inner">
          <span className="section-label reveal-el" data-delay="0">Tool Catalog</span>
          <h1 className="reveal-el" data-delay="100">
            Every workflow. <span className="accent-italic">One studio.</span>
          </h1>
          <p className="section-lead reveal-el" data-delay="180">
            Select a tool and execute a full upload, process, download, and cleanup loop in-browser.
          </p>
        </div>
      </section>

      <section className="full-bleed-section tools-section">
        <div className="section-inner">
          <div className="tools-grid">
            {TOOL_PAGES.map((tool, index) => (
              <article key={tool.slug} className="tool-cell reveal-el" data-delay={String(index * 80)}>
                <span className={`badge ${tool.slug === "background-remove" ? "pro" : "free"} tool-cell-badge`}>
                  {tool.slug === "background-remove" ? "pro" : "free"}
                </span>
                <span className="tool-cell-number">{String(index + 1).padStart(2, "0")}</span>
                <h2 className="tool-cell-title">{tool.name}</h2>
                <p className="tool-cell-copy">{tool.summary}</p>
                <Link href={`/tools/${tool.slug}`} className="ui-link tool-cell-link">
                  Open Tool →
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="full-bleed-section cta-section">
        <div className="section-inner">
          <span className="section-label reveal-el" data-delay="0">Need end-to-end runs?</span>
          <h2 className="reveal-el" data-delay="100">
            Launch the unified <span className="accent-italic">upload studio.</span>
          </h2>
          <div className="cta-actions reveal-el" data-delay="180">
            <Link href="/upload" className="editorial-button accent editorial-button-large">
              Open Upload
            </Link>
            <Link href="/dashboard" className="editorial-button ghost editorial-button-large">
              View Dashboard
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
