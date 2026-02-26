'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { getApiBaseUrl, refreshApiToken } from '../../lib/api-client';
import {
  getViewerSession,
  setViewerName,
  setViewerPlan,
  setViewerSubjectId,
} from '../../lib/session';

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
  const [needsName, setNeedsName] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [nameError, setNameError] = useState('');

  useEffect(() => {
    if (!guarded) {
      setAuthorized(true);
      setNeedsName(false);
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
        const viewer = getViewerSession();
        const missingName = !(viewer.firstName && viewer.lastName);
        setNeedsName(missingName);
        setFirstName(viewer.firstName || '');
        setLastName(viewer.lastName || '');
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

  if (guarded && authorized && needsName) {
    const onSubmit = (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const first = firstName.trim();
      const last = lastName.trim();
      if (!first || !last) {
        setNameError('Please enter both first and last name.');
        return;
      }
      setViewerName(first, last);
      setNameError('');
      setNeedsName(false);
    };

    return (
      <main className="app-page">
        <section className="page-shell">
          <header className="page-head">
            <span className="section-label">Welcome</span>
            <h1>How should we address you?</h1>
            <p>Tell us your first and last name to personalize your workspace.</p>
          </header>
          <section className="editorial-card" style={{ marginTop: '1rem' }}>
            <form onSubmit={onSubmit} className="field-grid">
              <div className="field">
                <label htmlFor="viewer-first-name">First name</label>
                <input
                  id="viewer-first-name"
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  autoComplete="given-name"
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="viewer-last-name">Last name</label>
                <input
                  id="viewer-last-name"
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  autoComplete="family-name"
                  required
                />
              </div>
              <div className="workbench-actions" style={{ marginTop: '1rem' }}>
                <button type="submit" className="editorial-button accent btn-primary">
                  <span>Continue</span>
                </button>
              </div>
            </form>
            {nameError ? (
              <p style={{ marginTop: '0.75rem', color: 'var(--terra-dark)' }}>{nameError}</p>
            ) : null}
          </section>
        </section>
      </main>
    );
  }

  return <>{children}</>;
}
