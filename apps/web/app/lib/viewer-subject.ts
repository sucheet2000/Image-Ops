import { getApiBaseUrl } from './api-client';
import { SUBJECT_KEY } from './storage-keys';
import { setViewerSubjectId } from './session';

function safeStorageGet(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

export function getStoredViewerSubjectId(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const value = safeStorageGet(localStorage, SUBJECT_KEY);
  return value && value.length > 0 ? value : null;
}

export async function ensureViewerSubjectId(apiBaseUrl = getApiBaseUrl()): Promise<string> {
  const existing = getStoredViewerSubjectId();
  if (existing) {
    return existing;
  }

  const response = await fetch(`${apiBaseUrl}/api/auth/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`Unable to create viewer session (${response.status})`);
  }

  const payload = (await response.json()) as { subjectId?: string; plan?: 'free' | 'pro' | 'team' };
  const subjectId = String(payload.subjectId || '').trim();
  if (!subjectId) {
    throw new Error('Session response missing subjectId');
  }

  setViewerSubjectId(subjectId);
  return subjectId;
}
