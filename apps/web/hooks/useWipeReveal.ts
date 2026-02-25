'use client';

import { useEffect, useRef, useState } from 'react';

type WipeState = 'hidden' | 'wiping' | 'revealed';

type WipeRevealOptions = {
  delay?: number;
  triggerOnMount?: boolean;
};

export function useWipeReveal(options: WipeRevealOptions = {}) {
  const { delay = 0, triggerOnMount = false } = options;
  const ref = useRef<HTMLElement>(null);
  const [state, setState] = useState<WipeState>('hidden');

  useEffect(() => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReduced) {
      setState('revealed');
      return;
    }

    if (triggerOnMount) {
      const begin = window.setTimeout(() => setState('wiping'), delay);
      const end = window.setTimeout(() => setState('revealed'), delay + 50);
      return () => {
        window.clearTimeout(begin);
        window.clearTimeout(end);
      };
    }

    let begin = 0;
    let end = 0;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) {
          return;
        }

        begin = window.setTimeout(() => setState('wiping'), delay);
        end = window.setTimeout(() => setState('revealed'), delay + 50);
        observer.disconnect();
      },
      { threshold: 0.2 }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => {
      window.clearTimeout(begin);
      window.clearTimeout(end);
      observer.disconnect();
    };
  }, [delay, triggerOnMount]);

  return { ref, state };
}
