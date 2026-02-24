"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useMagnetic } from "../../components/cursor/useMagnetic";
import { onScroll } from "../../lib/lenis";

function isActive(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }
  if (href.startsWith("/#")) {
    return pathname === "/";
  }
  return pathname.startsWith(href);
}

export function EditorialChrome() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [progress, setProgress] = useState(0);
  const ctaRef = useMagnetic(0.3);

  const navItems = useMemo(
    () => [
      { href: "/tools", label: "Tools" },
      { href: "/use-cases/amazon-listings", label: "Use Cases" },
      { href: "/#pricing", label: "Pricing" },
      { href: "/guides/prepare-amazon-main-images", label: "Guides" }
    ],
    []
  );

  useEffect(() => {
    const updateFromScroll = (scrollY: number) => {
      setScrolled(scrollY > 60);
      const maxScroll = document.body.scrollHeight - window.innerHeight;
      const pct = maxScroll > 0 ? Math.min((scrollY / maxScroll) * 100, 100) : 0;
      setProgress(pct);
    };

    const unsubscribe = onScroll(updateFromScroll);
    const onResize = () => updateFromScroll(window.scrollY || window.pageYOffset || 0);
    window.addEventListener("resize", onResize);
    return () => {
      unsubscribe();
      window.removeEventListener("resize", onResize);
    };
  }, []);

  useEffect(() => {
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      return;
    }

    const nodes = Array.from(document.querySelectorAll<HTMLElement>(".editorial-media-inner[data-parallax-speed]"));
    if (nodes.length === 0) {
      return;
    }

    return onScroll(() => {
      nodes.forEach((node) => {
        const wrapper = node.parentElement;
        if (!wrapper) {
          return;
        }
        const rect = wrapper.getBoundingClientRect();
        const center = rect.top + rect.height / 2 - window.innerHeight / 2;
        const speed = Number.parseFloat(node.dataset.parallaxSpeed || "0.12");
        node.style.transform = `translateY(${center * speed}px)`;
      });
    });
  }, [pathname]);

  useEffect(() => {
    const layers = Array.from(document.querySelectorAll<HTMLElement>("[data-mouse-parallax]"));
    if (layers.length === 0) {
      return;
    }

    const cleanup: Array<() => void> = [];

    layers.forEach((layer) => {
      const scope = layer.closest(".hero-section") as HTMLElement | null;
      if (!scope) {
        return;
      }

      const onMove = (event: MouseEvent) => {
        const rect = scope.getBoundingClientRect();
        const x = event.clientX - rect.left - rect.width / 2;
        const y = event.clientY - rect.top - rect.height / 2;
        layer.style.transform = `translate3d(${Math.round(x * 0.018)}px, ${Math.round(y * 0.018)}px, 0)`;
      };

      const onLeave = () => {
        layer.style.transform = "translate3d(0, 0, 0)";
      };

      scope.addEventListener("mousemove", onMove);
      scope.addEventListener("mouseleave", onLeave);
      cleanup.push(() => {
        scope.removeEventListener("mousemove", onMove);
        scope.removeEventListener("mouseleave", onLeave);
      });
    });

    return () => {
      cleanup.forEach((fn) => fn());
    };
  }, [pathname]);

  return (
    <>
      <div className="scroll-progress" style={{ width: `${progress}%` }} />
      <header
        className={`site-header${scrolled ? " scrolled" : ""}`}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 900,
          padding: scrolled ? "15px 52px" : "22px 52px",
          background: scrolled ? "rgba(245,240,232,0.94)" : "transparent",
          backdropFilter: scrolled ? "blur(14px)" : "none",
          borderBottom: scrolled ? "1px solid var(--border)" : "1px solid transparent",
          transition: "all 0.5s ease"
        }}
      >
        <div className="site-header-inner">
          <Link href="/" className="site-logo">
            ImageOps
          </Link>
          <nav className="site-nav" aria-label="Primary">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={isActive(pathname, item.href) ? "active" : undefined}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <Link href="/upload" className="editorial-button primary site-header-cta nav-btn btn-primary" ref={ctaRef as never}>
            <span>Start Free</span>
          </Link>
        </div>
      </header>
    </>
  );
}
