'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { getApiBaseUrl, refreshApiToken } from '../../lib/api-client';
import { setViewerPlan, setViewerSubjectId } from '../../lib/session';

const GUARDED_PATH_PREFIXES = ['/upload', '/dashboard', '/billing'];

function shouldGuardPath(pathname: string | null): boolean {
  if (!pathname) {
    return false;
  }
  return GUARDED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const apiBaseUrl = useMemo(() => getApiBaseUrl(), []);
  const guarded = shouldGuardPath(pathname);
  const [ready, setReady] = useState(!guarded);
  const [authorized, setAuthorized] = useState(!guarded);

  useEffect(() => {
    if (!guarded) {
      setAuthorized(true);
      setReady(true);
      return;
    }

    let cancelled = false;
    setReady(false);
    setAuthorized(false);

    void (async () => {
      try {
        const payload = await refreshApiToken(apiBaseUrl);
        if (cancelled) {
          return;
        }

        if (!payload) {
          setViewerPlan('free');
          router.replace(`/login?next=${encodeURIComponent(pathname || '/')}`);
          return;
        }

        if (payload.profile?.subjectId) {
          setViewerSubjectId(payload.profile.subjectId);
        }
        if (payload.profile?.plan) {
          setViewerPlan(payload.profile.plan);
        }
        setAuthorized(true);
      } finally {
        if (!cancelled) {
          setReady(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, guarded, pathname, router]);

  if (!ready || (guarded && !authorized)) {
    return (
      <main className="app-page">
        <section className="page-shell">
          <p className="workbench-meta">{guarded ? 'Restoring secure session...' : 'Loading...'}</p>
        </section>
      </main>
    );
  }

  return <>{children}</>;
}
