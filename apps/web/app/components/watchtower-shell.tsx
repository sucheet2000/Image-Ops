'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch, getApiBaseUrl } from '../lib/api-client';

type LogLevel = 'all' | 'info' | 'error';

type WatchTowerLog = {
  id: number;
  ts: string;
  level: 'info' | 'error';
  event: string;
  payload: Record<string, unknown>;
};

type WatchTowerResponse = {
  generatedAt: string;
  summary: {
    total: number;
    info: number;
    error: number;
    returned: number;
  };
  logs: WatchTowerLog[];
};

function formatPayload(payload: Record<string, unknown>): string {
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return '{}';
  }
}

export function WatchTowerShell() {
  const [level, setLevel] = useState<LogLevel>('all');
  const [eventFilter, setEventFilter] = useState<string>('');
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [logs, setLogs] = useState<WatchTowerLog[]>([]);
  const [summary, setSummary] = useState<WatchTowerResponse['summary']>({
    total: 0,
    info: 0,
    error: 0,
    returned: 0,
  });
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  const apiBaseUrl = useMemo(() => getApiBaseUrl(), []);

  const loadLogs = useCallback(
    async (silent: boolean) => {
      if (!silent) {
        setLoading(true);
      }

      try {
        const params = new URLSearchParams({
          limit: '120',
          level,
        });
        const trimmedFilter = eventFilter.trim();
        if (trimmedFilter.length > 0) {
          params.set('event', trimmedFilter);
        }

        const response = await apiFetch(
          `${apiBaseUrl}/api/observability/logs?${params.toString()}`,
          { method: 'GET' }
        );
        if (!response.ok) {
          setError(`Watch tower request failed (${response.status})`);
          return;
        }

        const payload = (await response.json()) as WatchTowerResponse;
        setLogs(payload.logs);
        setSummary(payload.summary);
        setLastUpdatedAt(payload.generatedAt);
        setError('');
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setLoading(false);
      }
    },
    [apiBaseUrl, eventFilter, level]
  );

  useEffect(() => {
    void loadLogs(false);
  }, [loadLogs]);

  useEffect(() => {
    if (!autoRefresh) {
      return;
    }

    const timer = setInterval(() => {
      void loadLogs(true);
    }, 5000);

    return () => {
      clearInterval(timer);
    };
  }, [autoRefresh, loadLogs]);

  return (
    <main className="app-page">
      <section className="page-shell">
        <header className="page-head">
          <span className="section-label reveal-el" data-delay="0">
            Watch Tower
          </span>
          <h1 className="reveal-el" data-delay="100">
            Live incident console for your <span className="accent-italic">application logs.</span>
          </h1>
          <p className="reveal-el" data-delay="200">
            Filter by severity, isolate failing events, and inspect structured payloads while
            incidents are active.
          </p>
        </header>

        <section className="dashboard-layout reveal-el" data-delay="280">
          <aside className="dashboard-sidebar">
            <p className="section-label">Workspace</p>
            <nav
              className="dashboard-nav"
              aria-label="Dashboard navigation"
              style={{ marginTop: '0.9rem' }}
            >
              <Link href="/dashboard">Overview</Link>
              <Link href="/dashboard/watchtower" className="active">
                Watch Tower
              </Link>
              <Link href="/upload">Upload Studio</Link>
              <Link href="/tools">Tool Catalog</Link>
              <Link href="/billing">Billing</Link>
            </nav>
          </aside>

          <div className="dashboard-content">
            <div className="dashboard-cards">
              <article className="dashboard-card">
                <p className="dashboard-card-label">Buffered Logs</p>
                <p className="dashboard-card-value">{summary.total}</p>
              </article>
              <article className="dashboard-card">
                <p className="dashboard-card-label">Errors</p>
                <p className="dashboard-card-value">{summary.error}</p>
              </article>
              <article className="dashboard-card">
                <p className="dashboard-card-label">Info Events</p>
                <p className="dashboard-card-value">{summary.info}</p>
              </article>
              <article className="dashboard-card">
                <p className="dashboard-card-label">Rendered</p>
                <p className="dashboard-card-value">{summary.returned}</p>
              </article>
            </div>

            <article className="quota-box watchtower-controls">
              <div className="watchtower-control-row">
                <label className="watchtower-control">
                  <span className="jobs-meta">Severity</span>
                  <select
                    value={level}
                    onChange={(event) => setLevel(event.target.value as LogLevel)}
                  >
                    <option value="all">All</option>
                    <option value="error">Error</option>
                    <option value="info">Info</option>
                  </select>
                </label>

                <label className="watchtower-control watchtower-control-wide">
                  <span className="jobs-meta">Event Filter</span>
                  <input
                    type="text"
                    placeholder="billing.webhook, job.enqueued, api.error..."
                    value={eventFilter}
                    onChange={(event) => setEventFilter(event.target.value)}
                  />
                </label>
              </div>

              <div className="watchtower-control-row">
                <button
                  type="button"
                  className="editorial-button ghost"
                  onClick={() => void loadLogs(false)}
                >
                  Refresh Now
                </button>
                <label className="watchtower-toggle">
                  <input
                    type="checkbox"
                    checked={autoRefresh}
                    onChange={(event) => setAutoRefresh(event.target.checked)}
                  />
                  <span>Auto-refresh every 5s</span>
                </label>
                <p className="jobs-meta">
                  Updated {lastUpdatedAt ? new Date(lastUpdatedAt).toLocaleTimeString() : '-'}
                </p>
              </div>
            </article>

            <article style={{ marginTop: '1.2rem' }}>
              <p className="section-label">Log Stream</p>
              <ul className="watchtower-list">
                {loading ? (
                  <li className="watchtower-log-item">Loading logs...</li>
                ) : logs.length === 0 ? (
                  <li className="watchtower-log-item">
                    <p>No logs match your current filters.</p>
                  </li>
                ) : (
                  logs.map((entry) => (
                    <li key={entry.id} className="watchtower-log-item">
                      <div className="watchtower-log-header">
                        <p>{entry.event}</p>
                        <span
                          className={`status-chip ${entry.level === 'error' ? 'failed' : 'info'}`}
                        >
                          {entry.level === 'error' ? 'Error' : 'Info'}
                        </span>
                      </div>
                      <p className="jobs-meta">{new Date(entry.ts).toLocaleString()}</p>
                      <pre className="watchtower-log-payload">{formatPayload(entry.payload)}</pre>
                    </li>
                  ))
                )}
              </ul>
            </article>

            {error ? (
              <p style={{ marginTop: '1rem', color: 'var(--terra-dark)' }}>{error}</p>
            ) : null}
          </div>
        </section>
      </section>
    </main>
  );
}
