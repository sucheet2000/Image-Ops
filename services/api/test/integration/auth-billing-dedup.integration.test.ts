import { createHmac, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { InMemoryAuthService } from "../../src/services/auth";

const shouldRun = process.env.RUN_INTEGRATION_TESTS === "1";
const apiBaseUrl = process.env.INTEGRATION_API_BASE_URL || "http://127.0.0.1:4000";
const billingWebhookSecret = process.env.BILLING_WEBHOOK_SECRET || "dev-webhook-secret";
const integrationAuthTokenSecret = process.env.INTEGRATION_AUTH_TOKEN_SECRET
  || process.env.AUTH_TOKEN_SECRET
  || "wM/JKw7HTEis2vmpoiaH7p6UgEENww7fKAnUlWXCoDc=";

const samplePngBytes = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2p6i8AAAAASUVORK5CYII=",
  "base64"
);

function nowTag(): string {
  return new Date().toISOString().replace(/[^0-9]/g, "");
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

function bearerAuthHeaders(subjectId: string, plan: "free" | "pro" | "team" = "free"): Record<string, string> {
  const auth = new InMemoryAuthService(integrationAuthTokenSecret);
  const token = auth.issueApiToken({
    sub: subjectId,
    plan,
    now: new Date()
  });
  return {
    authorization: `Bearer ${token}`
  };
}

async function initAndUploadObject(
  subjectId: string,
  authHeaders: Record<string, string>
): Promise<{ objectKey: string; uploadUrl: string; uploadFields: Record<string, string> }> {
  const initResponse = await fetch(`${apiBaseUrl}/api/uploads/init`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...authHeaders
    },
    body: JSON.stringify({
      subjectId,
      tool: "compress",
      filename: `${randomUUID()}.png`,
      mime: "image/png",
      size: samplePngBytes.length
    })
  });
  expect(initResponse.status).toBe(201);
  const initPayload = await readJson<{ objectKey: string; uploadUrl: string; uploadFields: Record<string, string> }>(initResponse);

  const uploadFormData = new FormData();
  for (const [key, value] of Object.entries(initPayload.uploadFields || {})) {
    uploadFormData.append(key, value);
  }
  if (!initPayload.uploadFields?.["Content-Type"]) {
    uploadFormData.append("Content-Type", "image/png");
  }
  uploadFormData.append("file", new Blob([samplePngBytes], { type: "image/png" }), "sample.png");

  const uploadResponse = await fetch(initPayload.uploadUrl, {
    method: "POST",
    body: uploadFormData
  });
  expect([200, 204]).toContain(uploadResponse.status);

  return initPayload;
}

describe.skipIf(!shouldRun)("integration auth+billing+dedup", () => {
  it("upgrades plan through billing webhook and deduplicates repeated uploads", async () => {
    const subjectId = `integration_auth_${nowTag()}_${Math.floor(Math.random() * 1000)}`;
    const authHeaders = bearerAuthHeaders(subjectId);

    const createSessionResponse = await fetch(`${apiBaseUrl}/api/auth/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subjectId, plan: "free" })
    });
    expect(createSessionResponse.status).toBe(201);

    const checkoutResponse = await fetch(`${apiBaseUrl}/api/billing/checkout`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders
      },
      body: JSON.stringify({
        subjectId,
        plan: "pro",
        successUrl: "http://127.0.0.1:3000/billing/success",
        cancelUrl: "http://127.0.0.1:3000/billing/cancel"
      })
    });
    expect(checkoutResponse.status).toBe(201);
    const checkoutPayload = await readJson<{ checkoutSessionId: string }>(checkoutResponse);
    expect(checkoutPayload.checkoutSessionId).toBeTruthy();

    const webhookPayload = JSON.stringify({
      eventId: `evt_integration_${randomUUID()}`,
      checkoutSessionId: checkoutPayload.checkoutSessionId,
      subjectId,
      plan: "pro",
      status: "paid"
    });
    const signature = createHmac("sha256", billingWebhookSecret).update(webhookPayload).digest("hex");

    const webhookResponse = await fetch(`${apiBaseUrl}/api/webhooks/billing`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-billing-signature": signature
      },
      body: webhookPayload
    });
    expect(webhookResponse.status).toBe(200);

    const profileResponse = await fetch(`${apiBaseUrl}/api/auth/session/${encodeURIComponent(subjectId)}`);
    expect(profileResponse.status).toBe(200);
    const profilePayload = await readJson<{ plan: string }>(profileResponse);
    expect(profilePayload.plan).toBe("pro");

    const firstUpload = await initAndUploadObject(subjectId, authHeaders);
    const firstCompleteResponse = await fetch(`${apiBaseUrl}/api/uploads/complete`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders
      },
      body: JSON.stringify({
        subjectId,
        objectKey: firstUpload.objectKey
      })
    });
    expect(firstCompleteResponse.status).toBe(200);
    const firstCompletePayload = await readJson<{ canonicalObjectKey: string; deduplicated: boolean }>(firstCompleteResponse);
    expect(firstCompletePayload.canonicalObjectKey).toBe(firstUpload.objectKey);
    expect(firstCompletePayload.deduplicated).toBe(false);

    const secondUpload = await initAndUploadObject(subjectId, authHeaders);
    const secondCompleteResponse = await fetch(`${apiBaseUrl}/api/uploads/complete`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders
      },
      body: JSON.stringify({
        subjectId,
        objectKey: secondUpload.objectKey
      })
    });
    expect(secondCompleteResponse.status).toBe(200);
    const secondCompletePayload = await readJson<{
      canonicalObjectKey: string;
      objectKey: string;
      deduplicated: boolean;
    }>(secondCompleteResponse);
    expect(secondCompletePayload.objectKey).toBe(secondUpload.objectKey);
    expect(secondCompletePayload.canonicalObjectKey).toBe(firstUpload.objectKey);
    expect(secondCompletePayload.deduplicated).toBe(true);

    const jobCreateResponse = await fetch(`${apiBaseUrl}/api/jobs`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders
      },
      body: JSON.stringify({
        subjectId,
        tool: "compress",
        inputObjectKey: secondUpload.objectKey,
        options: { quality: 75 }
      })
    });
    expect(jobCreateResponse.status).toBe(201);
    const jobCreatePayload = await readJson<{ inputObjectKey: string; quota: { usedCount: number } }>(jobCreateResponse);
    expect(jobCreatePayload.inputObjectKey).toBe(firstUpload.objectKey);
    expect(jobCreatePayload.quota.usedCount).toBe(1);
  });
});
