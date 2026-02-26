import { afterEach, describe, expect, it } from 'vitest';
import { bearerAuthHeaders } from './helpers/auth';
import { createFakeServices, createTestConfig } from './helpers/fakes';
import { startApiTestServer } from './helpers/server';

const closers: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (closers.length > 0) {
    const close = closers.pop();
    if (close) {
      await close();
    }
  }
});

describe('POST /api/cleanup', () => {
  it('deletes objects idempotently', async () => {
    const services = createFakeServices();
    services.storage.setObject('tmp/seller_1/input1.jpg', 'image/jpeg');

    const server = await startApiTestServer({ ...services, config: createTestConfig() });
    closers.push(server.close);

    const first = await fetch(`${server.baseUrl}/api/cleanup`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'cleanup-key-1',
        ...bearerAuthHeaders('seller_1'),
      },
      body: JSON.stringify({
        objectKeys: ['tmp/seller_1/input1.jpg'],
        reason: 'page_exit',
      }),
    });

    expect(first.status).toBe(202);
    const firstPayload = await first.json();
    expect(firstPayload.cleaned).toBe(1);

    const replay = await fetch(`${server.baseUrl}/api/cleanup`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'cleanup-key-1',
        ...bearerAuthHeaders('seller_1'),
      },
      body: JSON.stringify({
        objectKeys: ['tmp/seller_1/input1.jpg'],
        reason: 'page_exit',
      }),
    });

    expect(replay.status).toBe(202);
    expect(replay.headers.get('x-idempotent-replay')).toBe('true');
    const replayPayload = await replay.json();
    expect(replayPayload.cleaned).toBe(1);

    const audits = await services.jobRepo.listDeletionAudit(10);
    expect(audits.length).toBe(1);
    expect(audits[0]?.reason).toBe('page_exit');
  });

  it('returns conflict when idempotency key is reused with different payload', async () => {
    const services = createFakeServices();
    services.storage.setObject('tmp/seller_1/a.jpg', 'image/jpeg');
    services.storage.setObject('tmp/seller_1/b.jpg', 'image/jpeg');

    const server = await startApiTestServer({ ...services, config: createTestConfig() });
    closers.push(server.close);

    await fetch(`${server.baseUrl}/api/cleanup`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'cleanup-key-2',
        ...bearerAuthHeaders('seller_1'),
      },
      body: JSON.stringify({ objectKeys: ['tmp/seller_1/a.jpg'], reason: 'manual' }),
    });

    const conflict = await fetch(`${server.baseUrl}/api/cleanup`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'cleanup-key-2',
        ...bearerAuthHeaders('seller_1'),
      },
      body: JSON.stringify({ objectKeys: ['tmp/seller_1/b.jpg'], reason: 'manual' }),
    });

    expect(conflict.status).toBe(409);
    const payload = await conflict.json();
    expect(payload.error).toBe('IDEMPOTENCY_KEY_CONFLICT');
  });

  it('tracks missing keys as not_found', async () => {
    const services = createFakeServices();
    const server = await startApiTestServer({ ...services, config: createTestConfig() });
    closers.push(server.close);

    const response = await fetch(`${server.baseUrl}/api/cleanup`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'cleanup-key-3',
        ...bearerAuthHeaders('seller_1'),
      },
      body: JSON.stringify({
        objectKeys: ['tmp/seller_1/missing.jpg'],
        reason: 'manual',
      }),
    });

    expect(response.status).toBe(202);
    const payload = await response.json();
    expect(payload.notFound).toBe(1);

    const audits = await services.jobRepo.listDeletionAudit(10);
    expect(audits[0]?.result).toBe('not_found');
  });

  it('rejects traversal-like cleanup keys', async () => {
    const services = createFakeServices();
    const server = await startApiTestServer({ ...services, config: createTestConfig() });
    closers.push(server.close);

    const response = await fetch(`${server.baseUrl}/api/cleanup`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'cleanup-key-4',
        ...bearerAuthHeaders('seller_1'),
      },
      body: JSON.stringify({
        objectKeys: ['tmp/../secrets/env'],
        reason: 'manual',
      }),
    });

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.error).toBe('invalid_key');
  });
});
