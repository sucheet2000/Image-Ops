import { describe, expect, it } from 'vitest';

const shouldRun = process.env.RUN_INTEGRATION_TESTS === '1';
const apiBaseUrl = process.env.INTEGRATION_API_BASE_URL || 'http://127.0.0.1:4000';

describe.skipIf(!shouldRun)('integration health smoke', () => {
  it('returns healthy status from running API instance', async () => {
    const response = await fetch(`${apiBaseUrl}/health`);
    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(payload.status).toBe('ok');
  });
});
