"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

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
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 60);
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      const next = max > 0 ? Math.min(1, Math.max(0, y / max)) : 0;
      setProgress(next);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  useEffect(() => {
    const revealElements = Array.from(document.querySelectorAll<HTMLElement>(".reveal-el"));
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
          }
        });
      },
      { threshold: 0.15 }
    );

    revealElements.forEach((element) => {
      const delayMs = Number.parseInt(element.dataset.delay || "0", 10);
      if (Number.isFinite(delayMs) && delayMs > 0) {
        element.style.transitionDelay = `${delayMs}ms`;
      }
      observer.observe(element);
    });

    return () => {
      observer.disconnect();
    };
  }, [pathname]);

  useEffect(() => {
    const parallaxNodes = Array.from(document.querySelectorAll<HTMLElement>(".editorial-media-inner[data-parallax-speed]"));
    if (parallaxNodes.length === 0) {
      return;
    }

    const updateParallax = () => {
      const viewportCenter = window.innerHeight / 2;
      parallaxNodes.forEach((node) => {
        const parent = node.parentElement;
        if (!parent) {
          return;
        }
        const rect = parent.getBoundingClientRect();
        const elementCenter = rect.top + rect.height / 2;
        const delta = viewportCenter - elementCenter;
        const speed = Number.parseFloat(node.dataset.parallaxSpeed || "0.12");
        node.style.transform = `translate3d(0, ${Math.round(delta * speed)}px, 0)`;
      });
    };

    updateParallax();
    window.addEventListener("scroll", updateParallax, { passive: true });
    window.addEventListener("resize", updateParallax);

    return () => {
      window.removeEventListener("scroll", updateParallax);
      window.removeEventListener("resize", updateParallax);
    };
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
      <div className="scroll-progress" style={{ transform: `scaleX(${progress})` }} />
      <header className={`site-header${scrolled ? " scrolled" : ""}`}>
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
          <Link href="/upload" className="editorial-button primary site-header-cta">
            Start Free
          </Link>
        </div>
      </header>
    </>
  );
}
