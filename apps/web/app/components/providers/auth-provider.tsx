"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { getApiBaseUrl, refreshApiToken } from "../../lib/api-client";
import { setViewerPlan, setViewerSubjectId } from "../../lib/session";

const GUARDED_PATH_PREFIXES = ["/upload", "/dashboard", "/billing"];

function shouldGuardPath(pathname: string | null): boolean {
  if (!pathname) {
    return false;
  }
  return GUARDED_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const apiBaseUrl = useMemo(() => getApiBaseUrl(), []);
  const guarded = shouldGuardPath(pathname);
  const [ready, setReady] = useState(!guarded);

  useEffect(() => {
    if (!guarded) {
      setReady(true);
      return;
    }

    let cancelled = false;
    setReady(false);

    void (async () => {
      try {
        const payload = await refreshApiToken(apiBaseUrl);
        if (cancelled || !payload) {
          return;
        }
        if (payload.profile?.subjectId) {
          setViewerSubjectId(payload.profile.subjectId);
        }
        if (payload.profile?.plan) {
          setViewerPlan(payload.profile.plan);
        }
      } finally {
        if (!cancelled) {
          setReady(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, guarded]);

  if (!ready) {
    return (
      <main className="app-page">
        <section className="page-shell">
          <p className="workbench-meta">Restoring secure session...</p>
        </section>
      </main>
    );
  }

  return <>{children}</>;
}
