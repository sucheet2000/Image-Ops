"use client";

import { useEffect, useRef, useState } from "react";

const CHARS = "0123456789";

export function useScramble(
  finalValue: number,
  suffix = "",
  options: { duration?: number; decimals?: number } = {}
) {
  const { duration = 1400, decimals = 0 } = options;
  const [display, setDisplay] = useState(`0${suffix}`);
  const [triggered, setTriggered] = useState(false);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReduced) {
      setTriggered(true);
      setDisplay(`${decimals > 0 ? finalValue.toFixed(decimals) : finalValue}${suffix}`);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !triggered) {
          setTriggered(true);
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, [triggered, finalValue, suffix, decimals]);

  useEffect(() => {
    if (!triggered) {
      return;
    }

    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReduced) {
      setDisplay(`${decimals > 0 ? finalValue.toFixed(decimals) : finalValue}${suffix}`);
      return;
    }

    const start = performance.now();
    let raf = 0;

    const frame = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - (1 - progress) ** 3;

      if (progress < 0.65) {
        const len = String(finalValue).replace(".", "").length;
        let scrambled = "";
        for (let index = 0; index < len; index += 1) {
          scrambled += CHARS[Math.floor(Math.random() * CHARS.length)];
        }
        if (decimals > 0) {
          scrambled = `${scrambled.slice(0, -decimals)}.${scrambled.slice(-decimals)}`;
        }
        setDisplay(`${scrambled}${suffix}`);
      } else {
        const countProgress = (eased - 0.65) / 0.35;
        const current = finalValue * countProgress;
        setDisplay(`${decimals > 0 ? current.toFixed(decimals) : Math.floor(current)}${suffix}`);
      }

      if (progress < 1) {
        raf = requestAnimationFrame(frame);
      } else {
        setDisplay(`${decimals > 0 ? finalValue.toFixed(decimals) : finalValue}${suffix}`);
      }
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [triggered, finalValue, suffix, duration, decimals]);

  return { display, ref };
}
