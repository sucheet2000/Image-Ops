'use client';

import type { ElementType, ReactNode } from 'react';
import { useWipeReveal } from '../../hooks/useWipeReveal';

type WipeTextProps = {
  children: ReactNode;
  as?: 'h1' | 'h2' | 'h3' | 'span' | 'div';
  delay?: number;
  wipeColor?: string;
  className?: string;
  triggerOnMount?: boolean;
};

export default function WipeText({
  children,
  as: Tag = 'span',
  delay = 0,
  wipeColor = 'var(--terracotta)',
  className = '',
  triggerOnMount = false,
}: WipeTextProps) {
  const { ref, state } = useWipeReveal({ delay, triggerOnMount });
  const Component = Tag as ElementType;

  return (
    <Component
      ref={ref}
      className={className}
      style={{
        display: 'block',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <span
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background: wipeColor,
          transformOrigin: state === 'revealed' ? 'right' : 'left',
          transform:
            state === 'hidden' ? 'scaleX(0)' : state === 'wiping' ? 'scaleX(1)' : 'scaleX(0)',
          transition:
            state === 'hidden'
              ? 'none'
              : state === 'wiping'
                ? 'transform 0.48s cubic-bezier(0.76, 0, 0.24, 1)'
                : 'transform 0.42s 0.44s cubic-bezier(0.76, 0, 0.24, 1)',
          zIndex: 2,
        }}
      />
      <span
        style={{
          display: 'block',
          position: 'relative',
          zIndex: 1,
          transform: state === 'hidden' ? 'translateY(108%)' : 'translateY(0)',
          transition:
            state === 'hidden'
              ? 'none'
              : `transform 0.9s ${delay + 400}ms cubic-bezier(0.16, 1, 0.3, 1)`,
        }}
      >
        {children}
      </span>
    </Component>
  );
}
