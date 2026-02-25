'use client';

import type { CSSProperties, ElementType, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';

type FadeRevealProps = {
  children: ReactNode;
  delay?: number;
  y?: number;
  x?: number;
  duration?: number;
  className?: string;
  as?: ElementType;
  once?: boolean;
  style?: CSSProperties;
} & Record<string, unknown>;

export default function FadeReveal({
  children,
  delay = 0,
  y = 20,
  x = 0,
  duration = 700,
  className = '',
  as: Tag = 'div',
  once = true,
  style,
  ...rest
}: FadeRevealProps) {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReduced) {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          if (once) {
            observer.disconnect();
          }
        } else if (!once) {
          setVisible(false);
        }
      },
      { threshold: 0.15 }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, [once]);

  const Component = Tag as ElementType;
  return (
    <Component
      ref={ref}
      className={className}
      {...rest}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translate(0,0)' : `translate(${x}px, ${y}px)`,
        transition: `opacity ${duration}ms ${delay}ms ease, transform ${duration}ms ${delay}ms cubic-bezier(0.16, 1, 0.3, 1)`,
        ...style,
      }}
    >
      {children}
    </Component>
  );
}
