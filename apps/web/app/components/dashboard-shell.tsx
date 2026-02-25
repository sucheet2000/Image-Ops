'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import FadeReveal from '../../components/animation/FadeReveal';
import ScrambleNumber from '../../components/animation/ScrambleNumber';
import WipeText from '../../components/animation/WipeText';
import { apiFetch, getApiBaseUrl } from '../lib/api-client';
import { getViewerSession } from '../lib/session';
import { JOB_HISTORY_KEY } from '../lib/storage-keys';
import { ensureViewerSubjectId } from '../lib/viewer-subject';

type QuotaPayload = {
  subjectId: string;
  plan: 'free' | 'pro' | 'team';
  limit: number;
  usedCount: number;
  windowHours: number;
  windowResetAt: string;
};

type JobHistoryEntry = {
  id: string;
  tool: string;
  status: 'done' | 'failed';
  createdAt: string;
  outputObjectKey?: string | null;
};

function readHistory(): JobHistoryEntry[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = localStorage.getItem(JOB_HISTORY_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as JobHistoryEntry[];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((item) => item && typeof item.id === 'string' && typeof item.tool === 'string')
      .slice(0, 20);
  } catch {
    return [];
  }
}

function statusClass(status: JobHistoryEntry['status']): 'completed' | 'failed' {
  return status === 'done' ? 'completed' : 'failed';
}

export function DashboardShell() {
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [quota, setQuota] = useState<QuotaPayload | null>(null);
  const [history, setHistory] = useState<JobHistoryEntry[]>([]);
  const [error, setError] = useState<string>('');

  const apiBaseUrl = useMemo(() => getApiBaseUrl(), []);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      try {
        const viewer = getViewerSession();
        const resolvedSubject = viewer.subjectId || (await ensureViewerSubjectId(apiBaseUrl));
        if (cancelled) {
          return;
        }
        setSubjectId(resolvedSubject);

        const response = await apiFetch(
          `${apiBaseUrl}/api/quota/${encodeURIComponent(resolvedSubject)}`,
          {
            method: 'GET',
          }
        );
        if (!response.ok) {
          setError(`Quota request failed (${response.status})`);
          return;
        }

        const payload = (await response.json()) as QuotaPayload;
        if (!cancelled) {
          setQuota(payload);
        }
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      }
    };

    setHistory(readHistory());
    void bootstrap();

    const onStorage = () => {
      setHistory(readHistory());
    };

    window.addEventListener('storage', onStorage);

    return () => {
      cancelled = true;
      window.removeEventListener('storage', onStorage);
    };
  }, [apiBaseUrl]);

  const usedCount = quota?.usedCount || 0;
  const limit = quota?.limit || 0;
  const remaining = Math.max(0, limit - usedCount);
  const quotaPct = limit > 0 ? Math.min(100, Math.round((usedCount / limit) * 100)) : 0;

  return (
    <main className="app-page">
      <section className="page-shell">
        <header className="page-head">
          <FadeReveal as="span" className="section-label" delay={0}>
            Dashboard
          </FadeReveal>
          <WipeText as="h1" triggerOnMount>
            Operational view for your <span className="accent-italic">image pipeline.</span>
          </WipeText>
          <FadeReveal delay={200}>
            <p>
              Track quota usage, view recent jobs, and move between processing workflows without
              leaving this console.
            </p>
          </FadeReveal>
        </header>

        <FadeReveal delay={280}>
          <section className="dashboard-layout">
            <aside className="dashboard-sidebar">
              <p className="section-label">Workspace</p>
              <nav
                className="dashboard-nav"
                aria-label="Dashboard navigation"
                style={{ marginTop: '0.9rem' }}
              >
                <Link href="/dashboard" className="active">
                  Overview
                </Link>
                <Link href="/dashboard/watchtower">Watch Tower</Link>
                <Link href="/upload">Upload Studio</Link>
                <Link href="/tools">Tool Catalog</Link>
                <Link href="/billing">Billing</Link>
              </nav>
            </aside>

            <div className="dashboard-content">
              <div className="dashboard-cards">
                <article className="dashboard-card">
                  <p className="dashboard-card-label">Plan</p>
                  <p className="dashboard-card-value">{quota?.plan?.toUpperCase() || '-'}</p>
                </article>
                <article className="dashboard-card">
                  <p className="dashboard-card-label">Quota Used</p>
                  <p className="dashboard-card-value">
                    <ScrambleNumber value={usedCount} />
                  </p>
                </article>
                <article className="dashboard-card">
                  <p className="dashboard-card-label">Remaining</p>
                  <p className="dashboard-card-value">
                    <ScrambleNumber value={remaining} />
                  </p>
                </article>
                <article className="dashboard-card">
                  <p className="dashboard-card-label">Recent Jobs</p>
                  <p className="dashboard-card-value">
                    <ScrambleNumber value={history.length} />
                  </p>
                </article>
              </div>

              <article className="quota-box">
                <p className="section-label">Quota Window</p>
                <p style={{ marginTop: '0.4rem' }}>
                  Subject {subjectId || 'initializing'} · {usedCount}/{limit || '-'} used over{' '}
                  {quota?.windowHours || '-'}h
                </p>
                <div
                  className="quota-meter"
                  style={{ '--quota-pct': `${quotaPct}%` } as CSSProperties}
                >
                  <div className="quota-meter-fill" />
                </div>
                <p className="jobs-meta" style={{ marginTop: '0.55rem' }}>
                  Resets at{' '}
                  {quota?.windowResetAt ? new Date(quota.windowResetAt).toLocaleString() : '-'}
                </p>
              </article>

              <article style={{ marginTop: '1.2rem' }}>
                <p className="section-label">Quick Actions</p>
                <div className="workbench-actions" style={{ marginTop: '0.7rem' }}>
                  {[
                    { href: '/upload', label: 'Open Upload' },
                    { href: '/tools', label: 'Browse Tools' },
                    { href: '/billing', label: 'Manage Billing' },
                  ].map((action, index) => (
                    <FadeReveal key={action.href} delay={index * 50}>
                      <Link href={action.href} className="editorial-button ghost btn-cream">
                        <span>{action.label}</span>
                      </Link>
                    </FadeReveal>
                  ))}
                </div>
              </article>

              <article style={{ marginTop: '1.2rem' }}>
                <p className="section-label">Recent Jobs</p>
                <ul className="jobs-list">
                  {history.length === 0 ? (
                    <li className="jobs-item">
                      <div>
                        <p>No local job history yet.</p>
                        <p className="jobs-meta">
                          Run a tool from Upload Studio to populate this list.
                        </p>
                      </div>
                    </li>
                  ) : (
                    history.map((item, index) => (
                      <FadeReveal key={item.id} as="li" className="jobs-item" delay={index * 60}>
                        <div>
                          <p>
                            {item.tool} · {item.id}
                          </p>
                          <p className="jobs-meta">{new Date(item.createdAt).toLocaleString()}</p>
                        </div>
                        <span className={`status-chip ${statusClass(item.status)}`}>
                          {item.status === 'done' ? 'Completed' : 'Failed'}
                        </span>
                      </FadeReveal>
                    ))
                  )}
                </ul>
              </article>

              {error ? (
                <p style={{ marginTop: '1rem', color: 'var(--terra-dark)' }}>{error}</p>
              ) : null}
            </div>
          </section>
        </FadeReveal>
      </section>
    </main>
  );
}
