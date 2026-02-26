import { DISPLAY_NAME_KEY, PLAN_KEY, SUBJECT_KEY, TOKEN_KEY } from './storage-keys';

export type ViewerPlan = 'free' | 'pro' | 'team';
export type ViewerSession = {
  subjectId: string | null;
  displayName: string | null;
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

function parseClaimsFromToken(
  token: string
): { sub?: string; plan?: ViewerPlan; email?: string; name?: string } | null {
  const parts = token.split('.');
  if (parts.length < 2) {
    return null;
  }

  const payloadRaw = parseBase64Url(parts[1] || '');
  if (!payloadRaw) {
    return null;
  }

  try {
    const payload = JSON.parse(payloadRaw) as {
      sub?: string;
      plan?: string;
      email?: string;
      name?: string;
    };
    const plan =
      payload.plan === 'free' || payload.plan === 'pro' || payload.plan === 'team'
        ? payload.plan
        : undefined;
    const sub = typeof payload.sub === 'string' && payload.sub.length > 0 ? payload.sub : undefined;
    return {
      sub,
      plan,
      email: typeof payload.email === 'string' ? payload.email : undefined,
      name: typeof payload.name === 'string' ? payload.name : undefined,
    };
  } catch {
    return null;
  }
}

function readStoredDisplayName(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const value = safeStorageGet(localStorage, DISPLAY_NAME_KEY);
  return value && value.length > 0 ? value : null;
}

function normalizeDisplayName(value: string | null | undefined): string | null {
  const trimmed = String(value || '').trim();
  return trimmed.length > 0 ? trimmed : null;
}

function deriveDisplayNameFromEmail(email: string | null | undefined): string | null {
  const normalized = String(email || '')
    .trim()
    .toLowerCase();
  if (!normalized.includes('@')) {
    return null;
  }

  const localPart = normalized.split('@')[0] || '';
  const words = localPart
    .split(/[._-]+/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (words.length === 0) {
    return null;
  }

  return words.map((word) => word[0]!.toUpperCase() + word.slice(1)).join(' ');
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
    return { subjectId: null, displayName: null, plan: 'free', isAuthenticated: false };
  }

  const subjectId = readStoredSubjectId();
  const storedDisplayName = readStoredDisplayName();
  const explicitPlan = safeStorageGet(localStorage, PLAN_KEY);
  const token = readApiToken();
  if (!token) {
    const plan =
      explicitPlan === 'free' || explicitPlan === 'pro' || explicitPlan === 'team'
        ? explicitPlan
        : 'free';
    return { subjectId, displayName: storedDisplayName, plan, isAuthenticated: false };
  }

  const claims = parseClaimsFromToken(token);
  const plan =
    claims?.plan ||
    (explicitPlan === 'free' || explicitPlan === 'pro' || explicitPlan === 'team'
      ? explicitPlan
      : 'free');
  return {
    subjectId: claims?.sub || subjectId,
    displayName:
      normalizeDisplayName(claims?.name) ||
      normalizeDisplayName(storedDisplayName) ||
      deriveDisplayNameFromEmail(claims?.email) ||
      null,
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

export function setViewerDisplayName(displayName: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  const trimmed = displayName.trim();
  if (!trimmed) {
    return;
  }
  safeStorageSet(localStorage, DISPLAY_NAME_KEY, trimmed);
}
