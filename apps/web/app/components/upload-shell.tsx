"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import FadeReveal from "../../components/animation/FadeReveal";
import WipeText from "../../components/animation/WipeText";
import { useMagnetic } from "../../components/cursor/useMagnetic";
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

function UploadToolButton({
  option,
  selectedTool,
  onSelect
}: {
  option: ToolOption;
  selectedTool: ToolOption["slug"];
  onSelect: (value: ToolOption["slug"]) => void;
}) {
  const cardRef = useMagnetic(0.2);

  return (
    <button
      ref={cardRef as never}
      key={option.slug}
      type="button"
      className={`editorial-button ghost tool-tab tool-card${selectedTool === option.slug ? " active" : ""}`}
      onClick={() => onSelect(option.slug)}
      role="tab"
      aria-selected={selectedTool === option.slug}
    >
      <span>{option.label}</span>
    </button>
  );
}

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
          <FadeReveal as="span" className="section-label" delay={0}>
            Upload Studio
          </FadeReveal>
          <WipeText as="h1" triggerOnMount>
            Process images with <span className="accent-italic">editorial precision.</span>
          </WipeText>
          <FadeReveal delay={200}>
            <p>Select a workflow, upload source files, and run an end-to-end pipeline from upload init through cleanup.</p>
          </FadeReveal>
        </header>

        <FadeReveal className="tool-tabs" delay={280} role="tablist" aria-label="Tool selector">
          {toolOptions.map((option) => (
            <UploadToolButton
              key={option.slug}
              option={option}
              selectedTool={selectedTool}
              onSelect={setSelectedTool}
            />
          ))}
        </FadeReveal>
      </section>

      <AnimatePresence mode="wait">
        <motion.div
          key={selected.slug}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        >
          <ToolWorkbench tool={selected.slug} title={`Run ${selected.label} Workflow`} intro={selected.summary} />
        </motion.div>
      </AnimatePresence>
    </main>
  );
}
