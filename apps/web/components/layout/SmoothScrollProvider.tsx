'use client';

import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { destroyLenis, initLenis } from '../../lib/lenis';

export default function SmoothScrollProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    initLenis();
    return () => destroyLenis();
  }, []);

  return <>{children}</>;
}
