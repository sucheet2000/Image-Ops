const REDACT_KEYS = [/authorization/i, /token/i, /secret/i, /signedurl/i, /url/i];

function shouldRedact(key: string): boolean {
  return REDACT_KEYS.some((pattern) => pattern.test(key));
}

export function redact(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redact(item));
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).map(([key, field]) => {
      if (shouldRedact(key)) {
        return [key, '[REDACTED]'];
      }
      return [key, redact(field)];
    });

    return Object.fromEntries(entries);
  }

  return value;
}

export function audit(event: string, payload: Record<string, unknown>): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), event, payload: redact(payload) });
  // eslint-disable-next-line no-console
  console.log(line);
}
