"use client";

import { useMemo, useState } from "react";
import { ToolWorkbench } from "./tool-workbench";

type ToolOption = {
  slug: "resize" | "compress" | "convert" | "background-remove";
  label: string;
  summary: string;
};

const toolOptions: ToolOption[] = [
  {
    slug: "resize",
    label: "Resize",
    summary: "Dimension-safe exports for channel requirements."
  },
  {
    slug: "compress",
    label: "Compress",
    summary: "Lightweight images with retained visual quality."
  },
  {
    slug: "convert",
    label: "Convert",
    summary: "JPG, PNG, and WEBP format conversion flows."
  },
  {
    slug: "background-remove",
    label: "Background",
    summary: "Clean transparent cutouts for product-first imagery."
  }
];

export function UploadShell() {
  const [selectedTool, setSelectedTool] = useState<ToolOption["slug"]>("resize");

  const selected = useMemo(
    () => toolOptions.find((option) => option.slug === selectedTool) || toolOptions[0],
    [selectedTool]
  );

  return (
    <main className="app-page">
      <section className="page-shell">
        <header className="page-head">
          <span className="section-label reveal-el" data-delay="0">Upload Studio</span>
          <h1 className="reveal-el" data-delay="100">
            Process images with <span className="accent-italic">editorial precision.</span>
          </h1>
          <p className="reveal-el" data-delay="200">
            Select a workflow, upload source files, and run an end-to-end pipeline from upload init through cleanup.
          </p>
        </header>

        <div className="tool-tabs reveal-el" data-delay="280" role="tablist" aria-label="Tool selector">
          {toolOptions.map((option) => (
            <button
              key={option.slug}
              type="button"
              className={`editorial-button ghost tool-tab${selectedTool === option.slug ? " active" : ""}`}
              onClick={() => setSelectedTool(option.slug)}
              role="tab"
              aria-selected={selectedTool === option.slug}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <ToolWorkbench
        tool={selected.slug}
        title={`Run ${selected.label} Workflow`}
        intro={selected.summary}
      />
    </main>
  );
}
