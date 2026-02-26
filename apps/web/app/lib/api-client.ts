import type { ImagePlan } from '@imageops/core';
import { TOKEN_KEY } from './storage-keys';

type RefreshPayload = {
  token: string;
  profile?: {
    subjectId?: string;
    plan?: ImagePlan;
  };
};

const refreshTimeoutOverride = Number.parseInt(
  process.env.NEXT_PUBLIC_API_REFRESH_TIMEOUT_MS || '',
  10
);
const REFRESH_TIMEOUT_MS =
  Number.isFinite(refreshTimeoutOverride) && refreshTimeoutOverride > 0
    ? refreshTimeoutOverride
    : 8_000;

export function getApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';
}

function safeStorageGet(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeStorageSet(storage: Storage, key: string, value: string): void {
  try {
    storage.setItem(key, value);
  } catch {
    // Ignore storage write failures in restrictive/private browsing modes.
  }
}

function safeStorageRemove(storage: Storage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // Ignore storage write failures in restrictive/private browsing modes.
  }
}

export function getApiToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return safeStorageGet(sessionStorage, TOKEN_KEY) ?? null;
}

export function setApiToken(token: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  safeStorageSet(sessionStorage, TOKEN_KEY, token);
}

export function clearApiToken(): void {
  if (typeof window === 'undefined') {
    return;
  }

  safeStorageRemove(sessionStorage, TOKEN_KEY);
}

export async function refreshApiToken(
  apiBaseUrl = getApiBaseUrl()
): Promise<RefreshPayload | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REFRESH_TIMEOUT_MS);

  try {
    const response = await fetch(`${apiBaseUrl}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      signal: controller.signal,
    });
    if (!response.ok) {
      clearApiToken();
      return null;
    }

    const payload = (await response.json()) as RefreshPayload;
    if (!payload.token) {
      clearApiToken();
      return null;
    }

    setApiToken(payload.token);
    return payload;
  } catch {
    clearApiToken();
    return null;
  } finally {
    clearTimeout(timer);
  }
}

let isRefreshing = false;
let refreshQueue: Array<(token: string | null) => void> = [];

function flushRefreshQueue(token: string | null): void {
  const queued = refreshQueue;
  refreshQueue = [];
  for (const resolve of queued) {
    resolve(token);
  }
}

export async function apiFetch(
  input: string,
  init: RequestInit = {},
  retryOnUnauthorized = true
): Promise<Response> {
  const token = getApiToken();
  const headers = new Headers(init.headers || {});
  if (token) {
    headers.set('authorization', `Bearer ${token}`);
  }

  const response = await fetch(input, {
    ...init,
    credentials: init.credentials || 'include',
    headers,
  });

  if (response.status !== 401 || !retryOnUnauthorized) {
    return response;
  }

  if (isRefreshing) {
    return new Promise<Response>((resolve, reject) => {
      refreshQueue.push((queuedToken) => {
        if (!queuedToken) {
          resolve(response);
          return;
        }

        const retryHeaders = new Headers(init.headers || {});
        retryHeaders.set('authorization', `Bearer ${queuedToken}`);
        fetch(input, {
          ...init,
          credentials: init.credentials || 'include',
          headers: retryHeaders,
        })
          .then(resolve)
          .catch(reject);
      });
    });
  }

  isRefreshing = true;
  try {
    const refreshed = await refreshApiToken(getApiBaseUrl());
    const refreshedToken = refreshed?.token || null;
    flushRefreshQueue(refreshedToken);

    if (!refreshedToken) {
      return response;
    }

    const retryHeaders = new Headers(init.headers || {});
    retryHeaders.set('authorization', `Bearer ${refreshedToken}`);
    return fetch(input, {
      ...init,
      credentials: init.credentials || 'include',
      headers: retryHeaders,
    });
  } finally {
    isRefreshing = false;
  }
}
