import { afterEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { createFakeServices, createTestConfig } from "./helpers/fakes";
import { startApiTestServer } from "./helpers/server";

const closers: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (closers.length > 0) {
    const close = closers.pop();
    if (close) {
      await close();
    }
  }
});

function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

describe("POST /api/uploads/complete", () => {
  it("completes upload and returns canonical metadata", async () => {
    const services = createFakeServices();
    const server = await startApiTestServer({ ...services, config: createTestConfig() });
    closers.push(server.close);

    const objectKey = "tmp/seller_1/input/2026/02/23/resize/source.jpg";
    const bytes = Buffer.from("dedup-source");
    services.storage.setObject(objectKey, "image/jpeg", bytes);

    const response = await fetch(`${server.baseUrl}/api/uploads/complete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subjectId: "seller_1",
        objectKey,
        sha256: sha256Hex(bytes)
      })
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.objectKey).toBe(objectKey);
    expect(payload.canonicalObjectKey).toBe(objectKey);
    expect(payload.deduplicated).toBe(false);

    const completion = await services.jobRepo.getUploadCompletion(objectKey);
    expect(completion?.sha256).toBe(payload.sha256);
  });

  it("deduplicates identical uploads to canonical object key", async () => {
    const services = createFakeServices();
    const server = await startApiTestServer({ ...services, config: createTestConfig() });
    closers.push(server.close);

    const canonicalKey = "tmp/seller_2/input/2026/02/23/compress/original.jpg";
    const duplicateKey = "tmp/seller_2/input/2026/02/23/compress/duplicate.jpg";
    const bytes = Buffer.from("same-content");

    services.storage.setObject(canonicalKey, "image/jpeg", bytes);
    services.storage.setObject(duplicateKey, "image/jpeg", bytes);

    const first = await fetch(`${server.baseUrl}/api/uploads/complete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subjectId: "seller_2", objectKey: canonicalKey })
    });
    expect(first.status).toBe(200);

    const second = await fetch(`${server.baseUrl}/api/uploads/complete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subjectId: "seller_2", objectKey: duplicateKey })
    });
    expect(second.status).toBe(200);

    const payload = await second.json();
    expect(payload.deduplicated).toBe(true);
    expect(payload.canonicalObjectKey).toBe(canonicalKey);

    const deletedHead = await services.storage.headObject(duplicateKey);
    expect(deletedHead.exists).toBe(false);
  });

  it("falls back to byte-compare when hash index candidate differs", async () => {
    const services = createFakeServices();
    const server = await startApiTestServer({ ...services, config: createTestConfig() });
    closers.push(server.close);

    const sourceKey = "tmp/seller_3/input/2026/02/23/resize/source.jpg";
    const fakeCandidateKey = "tmp/seller_3/input/2026/02/23/resize/fake-candidate.jpg";
    const sourceBytes = Buffer.from("source-bytes");
    const fakeBytes = Buffer.from("different-bytes");
    const sourceHash = sha256Hex(sourceBytes);

    services.storage.setObject(sourceKey, "image/jpeg", sourceBytes);
    services.storage.setObject(fakeCandidateKey, "image/jpeg", fakeBytes);

    await services.jobRepo.finalizeUploadCompletion({
      completion: {
        objectKey: fakeCandidateKey,
        canonicalObjectKey: fakeCandidateKey,
        subjectId: "seller_3",
        sha256: sourceHash,
        sizeBytes: sourceBytes.length,
        contentType: "image/jpeg",
        deduplicated: false,
        createdAt: "2026-02-23T00:00:00.000Z"
      },
      dedupRecord: {
        sha256: sourceHash,
        objectKey: fakeCandidateKey,
        sizeBytes: sourceBytes.length,
        contentType: "image/jpeg",
        createdAt: "2026-02-23T00:00:00.000Z"
      }
    });

    const response = await fetch(`${server.baseUrl}/api/uploads/complete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subjectId: "seller_3", objectKey: sourceKey })
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.deduplicated).toBe(false);
    expect(payload.canonicalObjectKey).toBe(sourceKey);
  });
});
