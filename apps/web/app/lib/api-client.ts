import { TOKEN_KEY } from "./storage-keys";

export function getApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";
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
  if (typeof window === "undefined") {
    return null;
  }

  return safeStorageGet(sessionStorage, TOKEN_KEY) || safeStorageGet(localStorage, TOKEN_KEY);
}

export function setApiToken(token: string): void {
  if (typeof window === "undefined") {
    return;
  }

  safeStorageSet(sessionStorage, TOKEN_KEY, token);
  safeStorageRemove(localStorage, TOKEN_KEY);
}

export function clearApiToken(): void {
  if (typeof window === "undefined") {
    return;
  }

  safeStorageRemove(sessionStorage, TOKEN_KEY);
  safeStorageRemove(localStorage, TOKEN_KEY);
}

async function refreshApiToken(): Promise<string | null> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/api/auth/refresh`, {
      method: "POST",
      credentials: "include"
    });
    if (!response.ok) {
      clearApiToken();
      return null;
    }

    const payload = await response.json() as { token?: string };
    if (!payload.token) {
      clearApiToken();
      return null;
    }

    setApiToken(payload.token);
    return payload.token;
  } catch {
    clearApiToken();
    return null;
  }
}

export async function apiFetch(input: string, init: RequestInit = {}, retryOnUnauthorized = true): Promise<Response> {
  const token = getApiToken();
  const headers = new Headers(init.headers || {});
  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  }

  const response = await fetch(input, {
    ...init,
    credentials: init.credentials || "include",
    headers
  });

  if (response.status !== 401 || !retryOnUnauthorized) {
    return response;
  }

  const refreshed = await refreshApiToken();
  if (!refreshed) {
    return response;
  }

  const retryHeaders = new Headers(init.headers || {});
  retryHeaders.set("authorization", `Bearer ${refreshed}`);
  return fetch(input, {
    ...init,
    credentials: init.credentials || "include",
    headers: retryHeaders
  });
}
