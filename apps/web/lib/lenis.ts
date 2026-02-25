import Lenis from '@studio-freight/lenis';

let lenis: Lenis | null = null;
let rafId = 0;
let nativeScrollCleanup: (() => void) | null = null;
const listeners: Array<(scroll: number) => void> = [];

function notify(scroll: number) {
  listeners.forEach((listener) => listener(scroll));
}

function currentScroll(): number {
  if (typeof window === 'undefined') {
    return 0;
  }
  return window.scrollY || window.pageYOffset || 0;
}

function initNativeScrollEmitter() {
  if (typeof window === 'undefined' || nativeScrollCleanup) {
    return;
  }

  const onNativeScroll = () => notify(currentScroll());
  window.addEventListener('scroll', onNativeScroll, { passive: true });
  window.addEventListener('resize', onNativeScroll);
  onNativeScroll();

  nativeScrollCleanup = () => {
    window.removeEventListener('scroll', onNativeScroll);
    window.removeEventListener('resize', onNativeScroll);
    nativeScrollCleanup = null;
  };
}

export function initLenis(): Lenis | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced) {
    if (lenis) {
      lenis.destroy();
      lenis = null;
    }
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    initNativeScrollEmitter();
    return null;
  }

  if (nativeScrollCleanup) {
    nativeScrollCleanup();
  }

  if (lenis) {
    return lenis;
  }

  lenis = new Lenis({
    duration: 1.4,
    easing: (value: number) => Math.min(1, 1.001 - 2 ** (-10 * value)),
    orientation: 'vertical',
    smoothWheel: true,
    wheelMultiplier: 0.8,
    touchMultiplier: 1.5,
  });

  lenis.on('scroll', ({ scroll }: { scroll: number }) => {
    notify(scroll);
  });

  const raf = (time: number) => {
    if (!lenis) {
      return;
    }
    lenis.raf(time);
    rafId = requestAnimationFrame(raf);
  };

  rafId = requestAnimationFrame(raf);
  notify(currentScroll());

  return lenis;
}

export function destroyLenis() {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
  if (lenis) {
    lenis.destroy();
    lenis = null;
  }
  if (nativeScrollCleanup) {
    nativeScrollCleanup();
  }
}

export function getLenis() {
  return lenis;
}

export function onScroll(listener: (scroll: number) => void) {
  listeners.push(listener);
  listener(currentScroll());
  return () => {
    const index = listeners.indexOf(listener);
    if (index > -1) {
      listeners.splice(index, 1);
    }
  };
}
