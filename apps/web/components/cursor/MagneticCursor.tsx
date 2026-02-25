'use client';

import { useEffect, useRef, useState } from 'react';

type CursorState = 'default' | 'hover' | 'text';

export default function MagneticCursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const mouse = useRef({ x: 0, y: 0 });
  const ring = useRef({ x: 0, y: 0 });
  const [state, setState] = useState<CursorState>('default');
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(pointer: coarse)').matches) {
      setEnabled(false);
      return;
    }
    setEnabled(true);
  }, []);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      return;
    }

    document.body.style.cursor = 'none';

    const onMove = (event: MouseEvent) => {
      mouse.current = { x: event.clientX, y: event.clientY };
      if (dotRef.current) {
        dotRef.current.style.left = `${event.clientX}px`;
        dotRef.current.style.top = `${event.clientY}px`;
      }
    };
    document.addEventListener('mousemove', onMove);

    let raf = 0;
    const animate = () => {
      ring.current.x += (mouse.current.x - ring.current.x) * 0.1;
      ring.current.y += (mouse.current.y - ring.current.y) * 0.1;
      if (ringRef.current) {
        ringRef.current.style.left = `${ring.current.x}px`;
        ringRef.current.style.top = `${ring.current.y}px`;
      }
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);

    const onEnterLink = () => setState('hover');
    const onLeaveLink = () => setState('default');
    const onEnterText = () => setState('text');
    const onLeaveText = () => setState('default');

    const attachTo = (selector: string, enter: () => void, leave: () => void, key: string) => {
      document.querySelectorAll(selector).forEach((node) => {
        const element = node as HTMLElement;
        const attr = `data-cursor-${key}-bound`;
        if (element.getAttribute(attr) === '1') {
          return;
        }
        element.addEventListener('mouseenter', enter);
        element.addEventListener('mouseleave', leave);
        element.setAttribute(attr, '1');
      });
    };

    const detachFrom = (selector: string, enter: () => void, leave: () => void, key: string) => {
      document.querySelectorAll(selector).forEach((node) => {
        const element = node as HTMLElement;
        const attr = `data-cursor-${key}-bound`;
        if (element.getAttribute(attr) !== '1') {
          return;
        }
        element.removeEventListener('mouseenter', enter);
        element.removeEventListener('mouseleave', leave);
        element.removeAttribute(attr);
      });
    };

    const attach = () => {
      attachTo("a, button, [data-cursor='hover']", onEnterLink, onLeaveLink, 'hover');
      attachTo("p, li, blockquote, [data-cursor='text']", onEnterText, onLeaveText, 'text');
    };
    attach();

    const observer = new MutationObserver(attach);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('mousemove', onMove);
      document.body.style.cursor = '';
      observer.disconnect();
      detachFrom("a, button, [data-cursor='hover']", onEnterLink, onLeaveLink, 'hover');
      detachFrom("p, li, blockquote, [data-cursor='text']", onEnterText, onLeaveText, 'text');
    };
  }, [enabled]);

  if (!enabled) {
    return null;
  }

  const dotStyle: React.CSSProperties = {
    position: 'fixed',
    zIndex: 9998,
    pointerEvents: 'none',
    width: state === 'hover' ? '0px' : state === 'text' ? '3px' : '8px',
    height: state === 'hover' ? '0px' : state === 'text' ? '3px' : '8px',
    borderRadius: '50%',
    background: 'var(--terracotta)',
    transform: 'translate(-50%, -50%)',
    transition: 'width .3s ease, height .3s ease',
    opacity: state === 'hover' ? 0 : 1,
    left: 0,
    top: 0,
    willChange: 'left, top',
  };

  const ringStyle: React.CSSProperties = {
    position: 'fixed',
    zIndex: 9997,
    pointerEvents: 'none',
    width: state === 'hover' ? '56px' : state === 'text' ? '80px' : '36px',
    height: state === 'hover' ? '56px' : state === 'text' ? '56px' : '36px',
    borderRadius: state === 'text' ? '4px' : '50%',
    border: '1px solid',
    borderColor: state === 'hover' ? 'var(--terracotta)' : 'rgba(196, 113, 74, 0.45)',
    background: state === 'hover' ? 'rgba(196,113,74,0.06)' : 'transparent',
    transform: 'translate(-50%, -50%)',
    transition:
      'width .4s ease, height .4s ease, border-color .3s ease, border-radius .4s ease, background .3s ease',
    left: 0,
    top: 0,
    willChange: 'left, top',
  };

  return (
    <>
      <div ref={dotRef} style={dotStyle} />
      <div ref={ringRef} style={ringStyle} />
    </>
  );
}
