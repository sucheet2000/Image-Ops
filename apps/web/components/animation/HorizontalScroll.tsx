"use client";

import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { onScroll } from "../../lib/lenis";

type HorizontalScrollProps = {
  children: ReactNode;
  className?: string;
};

export default function HorizontalScroll({ children, className = "" }: HorizontalScrollProps) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReduced) {
      return;
    }

    return onScroll(() => {
      const section = sectionRef.current;
      const track = trackRef.current;
      if (!section || !track) {
        return;
      }

      const rect = section.getBoundingClientRect();
      const sectionHeight = section.offsetHeight;
      const progress = Math.max(0, Math.min(1, -rect.top / (sectionHeight - window.innerHeight * 0.5)));
      const maxShift = track.scrollWidth - section.offsetWidth + 104;
      track.style.transform = `translateX(${-progress * maxShift}px)`;
    });
  }, []);

  return (
    <div ref={sectionRef} className={className} style={{ overflow: "hidden" }}>
      <div
        ref={trackRef}
        style={{
          display: "flex",
          width: "max-content",
          willChange: "transform",
          transition: "none"
        }}
      >
        {children}
      </div>
    </div>
  );
}
