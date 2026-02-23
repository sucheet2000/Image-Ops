const TOKEN_KEY = "image_ops_api_token";

export function getApiToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return localStorage.getItem(TOKEN_KEY);
}

export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = getApiToken();
  const headers = new Headers(init.headers || {});
  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  }

  return fetch(input, {
    ...init,
    headers
  });
}
