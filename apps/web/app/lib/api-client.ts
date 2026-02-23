const TOKEN_KEY = "image_ops_api_token";

function getApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";
}

export function getApiToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
}

export function setApiToken(token: string): void {
  if (typeof window === "undefined") {
    return;
  }

  sessionStorage.setItem(TOKEN_KEY, token);
  localStorage.removeItem(TOKEN_KEY);
}

export function clearApiToken(): void {
  if (typeof window === "undefined") {
    return;
  }

  sessionStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_KEY);
}

async function refreshApiToken(): Promise<string | null> {
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
