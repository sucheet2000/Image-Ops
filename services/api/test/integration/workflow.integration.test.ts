import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

const shouldRun = process.env.RUN_INTEGRATION_TESTS === "1";
const apiBaseUrl = process.env.INTEGRATION_API_BASE_URL || "http://127.0.0.1:4000";
const jobTimeoutMs = Number(process.env.INTEGRATION_JOB_TIMEOUT_MS || 30000);

const samplePngBytes = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2p6i8AAAAASUVORK5CYII=",
  "base64"
);

function nowTag(): string {
  return new Date().toISOString().replace(/[^0-9]/g, "");
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

describe.skipIf(!shouldRun)("integration workflow", () => {
  it("processes upload -> job -> status -> cleanup against real services", async () => {
    const subjectId = `integration_${nowTag()}_${Math.floor(Math.random() * 1000)}`;

    const uploadInitResponse = await fetch(`${apiBaseUrl}/api/uploads/init`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subjectId,
        tool: "resize",
        filename: "sample.png",
        mime: "image/png",
        size: samplePngBytes.length
      })
    });
    expect(uploadInitResponse.status).toBe(201);
    const uploadInit = await readJson<{
      objectKey: string;
      uploadUrl: string;
      expiresAt: string;
    }>(uploadInitResponse);
    expect(uploadInit.objectKey).toContain(`tmp/${subjectId}/`);
    expect(uploadInit.uploadUrl.length).toBeGreaterThan(10);
    expect(uploadInit.expiresAt).toBeTruthy();

    const uploadResponse = await fetch(uploadInit.uploadUrl, {
      method: "PUT",
      headers: { "content-type": "image/png" },
      body: samplePngBytes
    });
    expect([200, 204]).toContain(uploadResponse.status);

    const createJobResponse = await fetch(`${apiBaseUrl}/api/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subjectId,
        plan: "free",
        tool: "resize",
        inputObjectKey: uploadInit.objectKey,
        options: {
          width: 1,
          height: 1
        }
      })
    });
    expect(createJobResponse.status).toBe(201);
    const createdJob = await readJson<{ id: string; status: string }>(createJobResponse);
    expect(createdJob.status).toBe("queued");

    const deadline = Date.now() + jobTimeoutMs;
    let finalJob:
      | {
          id: string;
          status: string;
          outputObjectKey: string | null;
          downloadUrl: string | null;
          errorCode: string | null;
        }
      | null = null;

    while (Date.now() < deadline) {
      const statusResponse = await fetch(`${apiBaseUrl}/api/jobs/${encodeURIComponent(createdJob.id)}`);
      expect(statusResponse.status).toBe(200);
      const payload = await readJson<{
        id: string;
        status: string;
        outputObjectKey: string | null;
        downloadUrl: string | null;
        errorCode: string | null;
      }>(statusResponse);

      if (payload.status === "done" || payload.status === "failed") {
        finalJob = payload;
        break;
      }

      await sleep(500);
    }

    expect(finalJob).not.toBeNull();
    expect(finalJob?.status).toBe("done");
    expect(finalJob?.errorCode).toBeNull();
    expect(finalJob?.outputObjectKey).toBeTruthy();
    expect(finalJob?.downloadUrl).toBeTruthy();
    const outputObjectKey = String(finalJob?.outputObjectKey);
    const downloadUrl = String(finalJob?.downloadUrl);

    const downloadResponse = await fetch(downloadUrl);
    expect(downloadResponse.status).toBe(200);
    const outputBytes = Buffer.from(await downloadResponse.arrayBuffer());
    expect(outputBytes.length).toBeGreaterThan(0);

    const cleanupResponse = await fetch(`${apiBaseUrl}/api/cleanup`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": randomUUID()
      },
      body: JSON.stringify({
        objectKeys: [uploadInit.objectKey, outputObjectKey],
        reason: "manual"
      })
    });
    expect(cleanupResponse.status).toBe(202);
    const cleanupPayload = await readJson<{ accepted: boolean; cleaned: number; notFound: number }>(cleanupResponse);
    expect(cleanupPayload.accepted).toBe(true);
    expect(cleanupPayload.cleaned + cleanupPayload.notFound).toBe(2);
  }, 45000);
});
