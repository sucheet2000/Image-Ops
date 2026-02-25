import { PLAN_KEY, SUBJECT_KEY, TOKEN_KEY } from './storage-keys';

export type ViewerPlan = 'free' | 'pro' | 'team';
export type ViewerSession = {
  subjectId: string | null;
  plan: ViewerPlan;
  isAuthenticated: boolean;
};

function parseBase64Url(input: string): string | null {
  try {
    const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
    const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
    return atob(`${normalized}${pad}`);
  } catch {
    return null;
  }
}

function parseClaimsFromToken(token: string): { sub?: string; plan?: ViewerPlan } | null {
  const parts = token.split('.');
  if (parts.length < 2) {
    return null;
  }

  const payloadRaw = parseBase64Url(parts[1] || '');
  if (!payloadRaw) {
    return null;
  }

  try {
    const payload = JSON.parse(payloadRaw) as { sub?: string; plan?: string };
    const plan =
      payload.plan === 'free' || payload.plan === 'pro' || payload.plan === 'team'
        ? payload.plan
        : undefined;
    const sub = typeof payload.sub === 'string' && payload.sub.length > 0 ? payload.sub : undefined;
    return { sub, plan };
  } catch {
    return null;
  }
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

function readStoredSubjectId(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const value = safeStorageGet(localStorage, SUBJECT_KEY);
  return value && value.length > 0 ? value : null;
}

function readApiToken(): string | null {
  return safeStorageGet(sessionStorage, TOKEN_KEY) || safeStorageGet(localStorage, TOKEN_KEY);
}

export function getViewerSession(): ViewerSession {
  if (typeof window === 'undefined') {
    return { subjectId: null, plan: 'free', isAuthenticated: false };
  }

  const subjectId = readStoredSubjectId();
  const explicitPlan = safeStorageGet(localStorage, PLAN_KEY);
  const token = readApiToken();
  if (!token) {
    const plan =
      explicitPlan === 'free' || explicitPlan === 'pro' || explicitPlan === 'team'
        ? explicitPlan
        : 'free';
    return { subjectId, plan, isAuthenticated: false };
  }

  const claims = parseClaimsFromToken(token);
  const plan =
    claims?.plan ||
    (explicitPlan === 'free' || explicitPlan === 'pro' || explicitPlan === 'team'
      ? explicitPlan
      : 'free');
  return {
    subjectId: claims?.sub || subjectId,
    plan,
    isAuthenticated: Boolean(claims?.sub),
  };
}

export function getViewerPlan(): ViewerPlan {
  return getViewerSession().plan;
}

export function setViewerPlan(plan: ViewerPlan): void {
  if (typeof window === 'undefined') {
    return;
  }
  safeStorageSet(localStorage, PLAN_KEY, plan);
}

export function setViewerSubjectId(subjectId: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  const trimmed = subjectId.trim();
  if (!trimmed) {
    return;
  }
  safeStorageSet(localStorage, SUBJECT_KEY, trimmed);
}
