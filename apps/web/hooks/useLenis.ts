'use client';

import { useEffect, useState } from 'react';
import { onScroll } from '../lib/lenis';

export function useLenisScroll(callback: (scroll: number) => void) {
  useEffect(() => onScroll(callback), [callback]);
}

export function useScrollY() {
  const [scrollY, setScrollY] = useState(0);
  useLenisScroll(setScrollY);
  return scrollY;
}
