'use client';

import { useEffect, useRef } from 'react';

export function useMagnetic(strength = 0.28) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || window.matchMedia('(pointer: coarse)').matches) {
      return;
    }

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      return;
    }

    const onMove = (event: MouseEvent) => {
      const rect = element.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const deltaX = (event.clientX - centerX) * strength;
      const deltaY = (event.clientY - centerY) * strength;
      element.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
    };

    const onLeave = () => {
      element.style.transform = '';
      element.style.transition = 'transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)';
      window.setTimeout(() => {
        if (element) {
          element.style.transition = '';
        }
      }, 500);
    };

    const onEnter = () => {
      element.style.transition = 'none';
    };

    element.addEventListener('mousemove', onMove);
    element.addEventListener('mouseleave', onLeave);
    element.addEventListener('mouseenter', onEnter);

    return () => {
      element.removeEventListener('mousemove', onMove);
      element.removeEventListener('mouseleave', onLeave);
      element.removeEventListener('mouseenter', onEnter);
    };
  }, [strength]);

  return ref;
}
