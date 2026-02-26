import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { bearerAuthHeaders } from './helpers/auth';
import { createFakeServices, createTestConfig } from './helpers/fakes';
import { startApiTestServer } from './helpers/server';
import { fakePngBytes } from './utils/image-helpers';

const closers: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (closers.length > 0) {
    const close = closers.pop();
    if (close) {
      await close();
    }
  }
});

async function startServerWithCleanup(services = createFakeServices()) {
  const server = await startApiTestServer({ ...services, config: createTestConfig() });
  closers.push(server.close);
  return { services, server };
}

function sha256Hex(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

describe('POST /api/uploads/complete', () => {
  it('completes upload and returns canonical metadata', async () => {
    const { services, server } = await startServerWithCleanup();

    const objectKey = 'tmp/seller_1/input/2026/02/23/resize/source.jpg';
    const bytes = fakePngBytes('dedup-source');
    services.storage.setObject(objectKey, 'image/png', bytes);

    const response = await fetch(`${server.baseUrl}/api/uploads/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...bearerAuthHeaders('seller_1') },
      body: JSON.stringify({
        subjectId: 'seller_1',
        objectKey,
        sha256: sha256Hex(bytes),
      }),
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.objectKey).toBe(objectKey);
    expect(payload.canonicalObjectKey).toBe(objectKey);
    expect(payload.deduplicated).toBe(false);

    const completion = await services.jobRepo.getUploadCompletion(objectKey);
    expect(completion?.sha256).toBe(payload.sha256);
  });

  it('rejects completion when provided sha256 does not match uploaded bytes', async () => {
    const { services, server } = await startServerWithCleanup();

    const objectKey = 'tmp/seller_1/input/2026/02/23/resize/source-mismatch.jpg';
    const bytes = fakePngBytes('actual-bytes');
    services.storage.setObject(objectKey, 'image/png', bytes);

    const response = await fetch(`${server.baseUrl}/api/uploads/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...bearerAuthHeaders('seller_1') },
      body: JSON.stringify({
        subjectId: 'seller_1',
        objectKey,
        sha256: 'a'.repeat(64),
      }),
    });

    expect(response.status).toBe(422);
    const payload = await response.json();
    expect(payload.error).toBe('integrity_mismatch');

    const completion = await services.jobRepo.getUploadCompletion(objectKey);
    expect(completion).toBeNull();
  });

  it('deduplicates identical uploads to canonical object key', async () => {
    const { services, server } = await startServerWithCleanup();

    const canonicalKey = 'tmp/seller_2/input/2026/02/23/compress/original.jpg';
    const duplicateKey = 'tmp/seller_2/input/2026/02/23/compress/duplicate.jpg';
    const bytes = fakePngBytes('same-content');

    services.storage.setObject(canonicalKey, 'image/png', bytes);
    services.storage.setObject(duplicateKey, 'image/png', bytes);

    const first = await fetch(`${server.baseUrl}/api/uploads/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...bearerAuthHeaders('seller_2') },
      body: JSON.stringify({
        subjectId: 'seller_2',
        objectKey: canonicalKey,
        sha256: sha256Hex(bytes),
      }),
    });
    expect(first.status).toBe(200);

    const second = await fetch(`${server.baseUrl}/api/uploads/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...bearerAuthHeaders('seller_2') },
      body: JSON.stringify({
        subjectId: 'seller_2',
        objectKey: duplicateKey,
        sha256: sha256Hex(bytes),
      }),
    });
    expect(second.status).toBe(200);

    const payload = await second.json();
    expect(payload.deduplicated).toBe(true);
    expect(payload.canonicalObjectKey).toBe(canonicalKey);

    const deletedHead = await services.storage.headObject(duplicateKey);
    expect(deletedHead.exists).toBe(false);
  });

  it('does not deduplicate across different subjects even with identical bytes', async () => {
    const { services, server } = await startServerWithCleanup();

    const subjectAKey = 'tmp/seller_a/input/2026/02/23/resize/source-a.jpg';
    const subjectBKey = 'tmp/seller_b/input/2026/02/23/resize/source-b.jpg';
    const bytes = fakePngBytes('same-cross-subject-content');

    services.storage.setObject(subjectAKey, 'image/png', bytes);
    services.storage.setObject(subjectBKey, 'image/png', bytes);

    const first = await fetch(`${server.baseUrl}/api/uploads/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...bearerAuthHeaders('seller_a') },
      body: JSON.stringify({
        subjectId: 'seller_a',
        objectKey: subjectAKey,
        sha256: sha256Hex(bytes),
      }),
    });
    expect(first.status).toBe(200);

    const second = await fetch(`${server.baseUrl}/api/uploads/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...bearerAuthHeaders('seller_b') },
      body: JSON.stringify({
        subjectId: 'seller_b',
        objectKey: subjectBKey,
        sha256: sha256Hex(bytes),
      }),
    });
    expect(second.status).toBe(200);

    const payload = await second.json();
    expect(payload.deduplicated).toBe(false);
    expect(payload.canonicalObjectKey).toBe(subjectBKey);

    const secondHead = await services.storage.headObject(subjectBKey);
    expect(secondHead.exists).toBe(true);
  });

  it('falls back to byte-compare when hash index candidate differs', async () => {
    const { services, server } = await startServerWithCleanup();

    const sourceKey = 'tmp/seller_3/input/2026/02/23/resize/source.jpg';
    const fakeCandidateKey = 'tmp/seller_3/input/2026/02/23/resize/fake-candidate.jpg';
    const sourceBytes = fakePngBytes('source-bytes');
    const fakeBytes = fakePngBytes('different-bytes');
    const sourceHash = sha256Hex(sourceBytes);

    services.storage.setObject(sourceKey, 'image/png', sourceBytes);
    services.storage.setObject(fakeCandidateKey, 'image/png', fakeBytes);

    await services.jobRepo.finalizeUploadCompletion({
      completion: {
        objectKey: fakeCandidateKey,
        canonicalObjectKey: fakeCandidateKey,
        subjectId: 'seller_3',
        sha256: sourceHash,
        sizeBytes: sourceBytes.length,
        contentType: 'image/png',
        deduplicated: false,
        createdAt: '2026-02-23T00:00:00.000Z',
      },
      dedupRecord: {
        sha256: sourceHash,
        objectKey: fakeCandidateKey,
        sizeBytes: sourceBytes.length,
        contentType: 'image/png',
        createdAt: '2026-02-23T00:00:00.000Z',
      },
    });

    const response = await fetch(`${server.baseUrl}/api/uploads/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...bearerAuthHeaders('seller_3') },
      body: JSON.stringify({ subjectId: 'seller_3', objectKey: sourceKey, sha256: sourceHash }),
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.deduplicated).toBe(false);
    expect(payload.canonicalObjectKey).toBe(sourceKey);
  });
});
