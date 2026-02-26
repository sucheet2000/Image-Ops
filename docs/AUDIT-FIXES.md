# Image-Ops Audit Remediation — Codex Prompt

> Read this file in full before writing any code.
> Work through each fix in order. Do not skip steps. Do not batch multiple fixes into one commit.
> After each fix: run the relevant tests, confirm they pass, make the git commit with the exact message specified.

---

## CONTEXT

This file contains 12 targeted fixes derived from a production-readiness audit.
The audit found 2 P0 (user-facing failures), 3 P1 (security/data integrity), 4 P2 (incomplete features), and 3 P3 (quality/tech-debt) issues.
All file paths are relative to the project root.

---

## FIX 1 — Remove non-HttpOnly access token cookie (P1 Security)

**Problem:** `apps/web/app/components/google-auth.tsx:64` sets the access token as a regular `document.cookie`. This is readable by JavaScript and stolen instantly by any XSS attack.

**Fix:**
1. Open `apps/web/app/components/google-auth.tsx`
2. Find the line that writes `image_ops_api_token` to `document.cookie`
3. Delete that line entirely
4. Ensure the access token is stored ONLY in `sessionStorage` — it should already be written to `sessionStorage` elsewhere in this component or in `apps/web/app/lib/api-client.ts`
5. Search the entire `apps/web` directory for any other `document.cookie` writes related to the access token and remove them
6. Verify `apps/web/app/lib/api-client.ts:getApiToken()` reads from `sessionStorage` first (it already does per the audit) — the cookie fallback is no longer needed; remove it

**Verification:**
```bash
grep -r "image_ops_api_token" apps/web --include="*.ts" --include="*.tsx"
# Should return ZERO results for document.cookie writes
# sessionStorage.setItem and sessionStorage.getItem are fine
```

**Commit:**
```
fix(web/auth): remove non-HttpOnly access token cookie; keep token in sessionStorage only
```

---

## FIX 2 — Remove localStorage fallback in getApiToken (P1 Security)

**Problem:** `apps/web/app/lib/api-client.ts:48-54` — `getApiToken()` falls back to `localStorage` after `sessionStorage`. If a token ever lands in `localStorage` (a bug, a migration, anything), it persists across sessions and browser restarts — a session fixation risk.

**Fix:**
1. Open `apps/web/app/lib/api-client.ts`
2. Find `getApiToken()` (around line 48–54)
3. Remove the `localStorage.getItem(...)` fallback entirely
4. The function should only read from `sessionStorage`
5. Also remove any `localStorage.setItem(...)` calls for the access token anywhere in `apps/web`

**After the fix, `getApiToken()` should look like this:**
```typescript
function getApiToken(): string | null {
  return sessionStorage.getItem('imageops_access_token') ?? null;
  // No localStorage fallback
}
```

**Verification:**
```bash
grep -r "localStorage" apps/web --include="*.ts" --include="*.tsx"
# Should return ZERO results for any token/auth-related localStorage usage
```

**Commit:**
```
fix(web/auth): remove localStorage fallback from getApiToken; sessionStorage only
```

---

## FIX 3 — Server-side EXIF stripping on upload completion (P0 Security/Privacy)

**Problem:** `apps/web/app/components/tool-workbench.tsx:78-115` strips EXIF client-side for JPEG only. Any user calling the API directly via `curl` or Postman bypasses this entirely and uploads files containing GPS coordinates, device serial numbers, and other metadata that gets stored and processed.

**Fix:**
1. Install `sharp` in the API service if not already present:
   ```bash
   cd services/api && npm install sharp && npm install --save-dev @types/node
   ```
2. Open `services/api/src/routes/uploads.ts`
3. Find the `POST /complete` handler (around line 316 based on audit)
4. After the uploaded file is confirmed received from S3 (after SHA256 check), add a server-side EXIF strip step:

```typescript
import sharp from 'sharp';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

// After confirming upload, strip EXIF server-side
async function stripExifServerSide(
  s3Client: S3Client,
  bucket: string,
  key: string,
  contentType: string
): Promise<void> {
  // Only strip for image types that carry EXIF
  const strippable = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/tiff'];
  if (!strippable.includes(contentType.toLowerCase())) return;

  // Download from S3
  const getCmd = new GetObjectCommand({ Bucket: bucket, Key: key });
  const response = await s3Client.send(getCmd);
  const chunks: Uint8Array[] = [];
  for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  const originalBuffer = Buffer.concat(chunks);

  // Strip EXIF using sharp (withMetadata(false) is the default — sharp strips all metadata)
  const strippedBuffer = await sharp(originalBuffer)
    .withMetadata(false)  // Explicitly strip all metadata including GPS, device info
    .toBuffer();

  // Only re-upload if the buffer actually changed (avoid unnecessary S3 writes)
  if (strippedBuffer.length !== originalBuffer.length ||
      !strippedBuffer.equals(originalBuffer)) {
    const putCmd = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: strippedBuffer,
      ContentType: contentType,
    });
    await s3Client.send(putCmd);
  }
}
```

5. Call `stripExifServerSide(...)` in the upload complete handler before creating the job record
6. Wrap in try/catch — a strip failure should log a warning but NOT fail the upload (degrade gracefully)

**Verification:**
```bash
# In services/api:
cd services/api
npx ts-node -e "
  const sharp = require('sharp');
  sharp('./test-with-exif.jpg').withMetadata(false).toBuffer()
    .then(b => console.log('EXIF strip works, size:', b.length));
"
```

**Commit:**
```
fix(api/uploads): add server-side EXIF strip on upload completion for all image types
```

---

## FIX 4 — Add METRICS_TOKEN to .env.example (P1 Config)

**Problem:** `services/api/src/server.ts:187-191` calls `process.exit(1)` at startup if `METRICS_TOKEN` is absent in production. This var is not in `.env.example` anywhere, so any developer deploying fresh will get an immediate crash with no obvious cause.

**Fix:**
1. Open `services/api/.env.example`
2. Find the security/auth section and add:
   ```
   # Required in production — protects the /metrics endpoint. Generate with: openssl rand -hex 32
   METRICS_TOKEN=your-random-32-char-hex-token-here
   ```
3. Open the root `.env.example` if one exists and add the same entry under the API section
4. Open `docs/REMEDIATION.md` and add a note that METRICS_TOKEN is now documented

**Verification:**
```bash
grep "METRICS_TOKEN" services/api/.env.example
# Must return a result
```

**Commit:**
```
docs(api): add METRICS_TOKEN to .env.example with generation instructions
```

---

## FIX 5 — Add missing env vars to .env.example (P2 Config)

**Problem:** Three env vars used in `apps/web` are missing from `.env.example`:
- `NEXT_PUBLIC_ENABLE_WATCHTOWER` — gates the Watchtower feature
- `NEXT_PUBLIC_WATCHTOWER_SUBJECT_ALLOWLIST` — allowlist for Watchtower
- `NEXT_PUBLIC_SITE_URL` — used in SEO/OG metadata

**Fix:**
1. Open `apps/web/.env.example`
2. Add these entries with clear comments:
   ```
   # Site URL — used for Open Graph tags and canonical URLs
   NEXT_PUBLIC_SITE_URL=https://yourdomain.com

   # Watchtower feature flag — set to "true" to enable the Watchtower dashboard
   NEXT_PUBLIC_ENABLE_WATCHTOWER=false

   # Comma-separated list of subject IDs allowed to access Watchtower (e.g. "sub_abc123,sub_def456")
   # Only used when NEXT_PUBLIC_ENABLE_WATCHTOWER=true
   NEXT_PUBLIC_WATCHTOWER_SUBJECT_ALLOWLIST=
   ```
3. Verify `NEXT_PUBLIC_ENABLE_BILLING_RECONCILE` is also present (it should be per audit) — add if missing:
   ```
   # Enable billing reconciliation endpoint — for admin use only
   NEXT_PUBLIC_ENABLE_BILLING_RECONCILE=false
   ```

**Verification:**
```bash
grep "NEXT_PUBLIC_ENABLE_WATCHTOWER\|NEXT_PUBLIC_SITE_URL\|NEXT_PUBLIC_WATCHTOWER" apps/web/.env.example
# Must return 3 results
```

**Commit:**
```
docs(web): add NEXT_PUBLIC_SITE_URL, NEXT_PUBLIC_ENABLE_WATCHTOWER, NEXT_PUBLIC_WATCHTOWER_SUBJECT_ALLOWLIST to .env.example
```

---

## FIX 6 — Make client SHA256 integrity check non-optional or remove it (P1 Data Integrity)

**Problem:** `services/api/src/routes/uploads.ts:30-37` — the `sha256` field in `uploadCompleteSchema` is `.optional()`. The backend computes its own SHA256 but never compares it against the client-provided value. This makes the integrity check purely decorative — a developer reading this code would assume uploads are integrity-checked when they are not.

**Fix — Option A (recommended): enforce and verify**

1. Open `services/api/src/routes/uploads.ts`
2. Change the schema field from `.optional()` to `.required()`:
   ```typescript
   const uploadCompleteSchema = z.object({
     jobInputKey: z.string().min(1),
     sha256: z.string().length(64).regex(/^[0-9a-f]+$/), // required, must be lowercase hex
     // ...other fields
   });
   ```
3. After the backend computes the SHA256 of the received file, add a comparison:
   ```typescript
   const backendSha256 = computedSha256; // whatever your existing computation returns
   if (body.sha256 !== backendSha256) {
     return res.status(422).json({
       error: 'integrity_mismatch',
       message: 'File integrity check failed. The uploaded file does not match the declared checksum.',
     });
   }
   ```
4. In `apps/web/app/components/tool-workbench.tsx` (or `useUpload.ts`), verify the frontend already computes SHA256 before calling `/complete`. If not, add it:
   ```typescript
   async function computeSha256(file: File): Promise<string> {
     const buffer = await file.arrayBuffer();
     const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
     const hashArray = Array.from(new Uint8Array(hashBuffer));
     return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
   }
   ```

**Fix — Option B (if Option A is too disruptive): remove the false assurance**

If implementing Option A breaks the upload flow timeline, remove the `sha256` field entirely from the schema and any code that references it, so there is no misleading integrity signal.

**Verification:**
```bash
# If Option A: upload a file, tamper with the sha256 in the request, expect 422
# If Option B:
grep -r "sha256" services/api/src/routes/uploads.ts
# Should return zero results
```

**Commit:**
```
fix(api/uploads): enforce client SHA256 integrity check against backend-computed hash
```
or
```
fix(api/uploads): remove no-op SHA256 field from uploadCompleteSchema to eliminate false trust signal
```

---

## FIX 7 — Add BullMQ dead-letter queue for failed worker jobs (P2 Reliability)

**Problem:** Failed jobs in `services/worker/src/worker.ts` are marked as failed with no replay mechanism. If a job fails after the user has already been charged quota, they lose their quota allowance with no way to recover without contacting support.

**Fix:**
1. Open `services/worker/src/worker.ts`
2. Find the BullMQ Worker configuration
3. Add a dead-letter queue configuration:

```typescript
import { Queue, Worker, QueueEvents } from 'bullmq';

// Create a DLQ queue
const deadLetterQueue = new Queue('image-ops-dlq', {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: false, // Keep DLQ jobs for inspection
    removeOnFail: false,
  },
});

// In your Worker config, add a failed handler:
const worker = new Worker('image-ops-jobs', processor, {
  connection: redisConnection,
  concurrency: parseInt(process.env.WORKER_CONCURRENCY ?? '5'),
  // Add retry config with explicit cap:
  settings: {
    backoffStrategy: (attemptsMade: number) => {
      // Exponential backoff: 5s, 30s, 2m, 10m
      return Math.min(5000 * Math.pow(4, attemptsMade - 1), 600_000);
    },
  },
});

// Move to DLQ after max retries exhausted:
worker.on('failed', async (job, error) => {
  if (!job) return;

  const maxAttempts = job.opts.attempts ?? 3;
  if (job.attemptsMade >= maxAttempts) {
    // Move to dead-letter queue
    await deadLetterQueue.add('failed-job', {
      originalJobId: job.id,
      originalQueue: 'image-ops-jobs',
      jobData: job.data,
      failedReason: error.message,
      failedAt: new Date().toISOString(),
      attemptsMade: job.attemptsMade,
    }, {
      removeOnComplete: false,
      removeOnFail: false,
    });

    // Log for alerting
    console.error('[DLQ] Job moved to dead-letter queue', {
      jobId: job.id,
      subjectId: job.data.subjectId,
      tool: job.data.tool,
      error: error.message,
    });
  }
});
```

4. Set a default `attempts` value in the job creation route (`services/api/src/routes/jobs.ts`) if not already set:
   ```typescript
   await imageJobsQueue.add('process', jobPayload, {
     attempts: 3,
     backoff: { type: 'exponential', delay: 5000 },
     removeOnComplete: { count: 100 },
     removeOnFail: false, // Keep failed jobs for DLQ processing
   });
   ```

5. Add a DLQ management endpoint (admin-only, METRICS_TOKEN protected) in `services/api/src/routes/admin.ts` (create if it doesn't exist):
   ```typescript
   // GET /api/admin/dlq — list DLQ jobs
   // POST /api/admin/dlq/:jobId/retry — re-queue a specific failed job
   ```

**Verification:**
```bash
cd services/worker
npx ts-node -e "
  // verify the DLQ queue is created and referenced correctly
  const { Queue } = require('bullmq');
  console.log('BullMQ DLQ config compiles correctly');
"
```

**Commit:**
```
feat(worker): add dead-letter queue for failed jobs with exponential backoff and retry cap
```

---

## FIX 8 — Add Content-Security-Policy header in Next.js config (P3 Security)

**Problem:** `apps/web/next.config.ts:16-29` sets HSTS, X-Frame-Options, and other security headers but has no Content-Security-Policy. Without a CSP, inline script injection (XSS) is completely unmitigated.

**Fix:**
1. Open `apps/web/next.config.ts`
2. Find the `headers()` function that currently sets security headers
3. Add a CSP header entry. Use a nonce-based approach for Next.js App Router:

```typescript
// In next.config.ts headers() array, add:
{
  key: 'Content-Security-Policy',
  value: [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://js.stripe.com https://accounts.google.com",
    // NOTE: 'unsafe-inline' is needed for Next.js inline scripts.
    // TODO: replace with nonce-based CSP once middleware nonce injection is added.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://*.amazonaws.com https://*.s3.amazonaws.com",
    "connect-src 'self' https://api.stripe.com https://accounts.google.com",
    "frame-src https://js.stripe.com https://accounts.google.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ].join('; '),
},
```

4. If you have a custom `NEXT_PUBLIC_API_BASE_URL` that points to a different domain, add it to `connect-src`:
   ```typescript
   const apiOrigin = process.env.NEXT_PUBLIC_API_BASE_URL
     ? new URL(process.env.NEXT_PUBLIC_API_BASE_URL).origin
     : '';
   // Then in connect-src: `connect-src 'self' ${apiOrigin} https://api.stripe.com ...`
   ```

**Verification:**
```bash
# Start the Next.js dev server and check response headers:
curl -I http://localhost:3000 | grep -i "content-security-policy"
# Must return the CSP header
```

**Commit:**
```
feat(web/security): add Content-Security-Policy header to Next.js config
```

---

## FIX 9 — Tighten S3 cleanup route path traversal validation (P3 Security)

**Problem:** `services/api/src/routes/cleanup.ts:72-82` validates that keys start with `tmp/` but does not reject traversal patterns like `tmp/../secrets/`. S3 normalizes these, so exploitation risk is low — but the defensive validation should be airtight.

**Fix:**
1. Open `services/api/src/routes/cleanup.ts`
2. Find the key validation around line 72–82
3. Replace the current startsWith check with a strict allowlist regex:

```typescript
// BEFORE (too loose):
if (!key.startsWith('tmp/')) {
  return res.status(400).json({ error: 'invalid_key' });
}

// AFTER (strict allowlist — only alphanumeric, hyphens, underscores, forward slashes):
const VALID_CLEANUP_KEY = /^tmp\/[a-zA-Z0-9_\-\/]+$/;
if (!VALID_CLEANUP_KEY.test(key)) {
  return res.status(400).json({ 
    error: 'invalid_key',
    message: 'Key must start with tmp/ and contain only alphanumeric characters, hyphens, underscores, and forward slashes.'
  });
}

// Also explicitly reject any traversal patterns as a double-check:
if (key.includes('..') || key.includes('//')) {
  return res.status(400).json({ error: 'invalid_key' });
}
```

**Verification:**
```bash
# In your API test suite, add a test case:
# POST /api/cleanup with key = "tmp/../secrets/env" should return 400
# POST /api/cleanup with key = "tmp/valid-key-123" should pass validation
```

**Commit:**
```
fix(api/cleanup): tighten S3 key validation to strict allowlist regex, reject traversal patterns
```

---

## FIX 10 — Move Stripe key validation into validateEnv() (P3 Reliability)

**Problem:** `services/api/src/server.ts:122-146` — the Stripe secret key presence check happens late in the boot sequence (when Stripe is first used), not at startup. A missing `STRIPE_SECRET_KEY` causes the service to start successfully and only crash on the first billing request — which could be minutes or hours after deploy.

**Fix:**
1. Open `services/api/src/server.ts` (or wherever `validateEnv()` is defined — check `services/api/src/config.ts` or similar)
2. Find the `validateEnv()` function
3. Add `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` to the required vars list:

```typescript
function validateEnv() {
  const required = [
    'DATABASE_URL',
    'REDIS_URL',
    'JWT_SECRET',
    'AUTH_TOKEN_SECRET',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'S3_BUCKET',
    'S3_ENDPOINT',
    'S3_ACCESS_KEY_ID',
    'S3_SECRET_ACCESS_KEY',
    // Add these:
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    // METRICS_TOKEN is only required in production:
    ...(process.env.NODE_ENV === 'production' ? ['METRICS_TOKEN'] : []),
  ];

  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    console.error(`[startup] Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
}
```

4. Ensure `validateEnv()` is called as the very first thing in the server startup, before any middleware or route registration

**Verification:**
```bash
# Temporarily unset STRIPE_SECRET_KEY and start the server:
STRIPE_SECRET_KEY= node -r ts-node/register services/api/src/server.ts
# Should exit immediately with a clear error message listing the missing var
```

**Commit:**
```
fix(api/config): move STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET into validateEnv() startup check
```

---

## FIX 11 — Fix frontend type duplication — import from @imageops/core (P3 Quality)

**Problem:** `apps/web/app/components/tool-workbench.tsx:12-39` defines its own `ToolSlug` and `OutputFormat` types locally instead of importing from `@imageops/core`. If the core enums change, the frontend won't get a compile error — it will silently diverge.

**Fix:**
1. Open `apps/web/app/components/tool-workbench.tsx`
2. Find the local type definitions for `ToolSlug` and `OutputFormat` (around lines 12–39)
3. Delete the local definitions
4. Add an import from the core package:
   ```typescript
   import type { ImageTool, ImageFormat } from '@imageops/core';
   // Use ImageTool wherever ToolSlug was used
   // Use ImageFormat wherever OutputFormat was used
   ```
5. If the core package uses different names, add re-export aliases in `packages/core/src/index.ts`:
   ```typescript
   export type { ImageTool as ToolSlug, ImageFormat as OutputFormat };
   ```
6. Also fix `apps/web/app/lib/api-client.ts` — find the duplicated refresh payload type and replace with the import from `@imageops/core`

**Verification:**
```bash
cd apps/web
npx tsc --noEmit
# Must compile with zero errors
```

**Commit:**
```
refactor(web): replace local ToolSlug/OutputFormat types with imports from @imageops/core
```

---

## FIX 12 — Wire ad components into page layouts or remove them (P2 Completeness)

**Problem:** `apps/web/app/components/ad-slot.tsx` and `ad-consent-banner.tsx` exist and have corresponding env vars in `.env.example`, but neither component is rendered anywhere in the page layouts. This means the ads monetization feature — which is part of the business model — is either dead code or was accidentally unwired.

**Fix — Option A: Wire them in (if ads are intended to be live):**

1. Open `apps/web/app/(marketing)/layout.tsx`
2. Import and render `<AdConsentBanner />` at the root of the layout (before `</body>` equivalent):
   ```tsx
   import AdConsentBanner from '@/app/components/ad-consent-banner';
   // In layout JSX:
   {process.env.NEXT_PUBLIC_ENABLE_ADS === 'true' && <AdConsentBanner />}
   ```
3. Open the landing page (`apps/web/app/(marketing)/page.tsx`) and any high-traffic pages
4. Add `<AdSlot position="sidebar" />` or `<AdSlot position="banner" />` in appropriate locations, gated by the same env var

**Fix — Option B: Remove them (if ads are not planned):**

```bash
rm apps/web/app/components/ad-slot.tsx
rm apps/web/app/components/ad-consent-banner.tsx
# Remove the NEXT_PUBLIC_AD_* vars from .env.example
# Remove any ad-related imports
```

**Decision:** Check with your product roadmap. If ads are planned for a future milestone, keep the files but add a `// TODO: wire into layout in v1.1 (tracked in #issue-number)` comment at the top of each file so it's clearly intentional. If ads are not planned, remove them to reduce dead code surface.

**Verification:**
```bash
# If Option A:
grep -r "AdConsentBanner\|AdSlot" apps/web --include="*.tsx" | grep -v "components/"
# Should show at least one usage in a layout or page file

# If Option B:
ls apps/web/app/components/ad-*.tsx
# Should return "No such file"
```

**Commit (Option A):**
```
feat(web/ads): wire AdConsentBanner and AdSlot into marketing layout, gate with NEXT_PUBLIC_ENABLE_ADS
```
**Commit (Option B):**
```
chore(web): remove unwired ad components; to be revisited in v1.1
```

---

## FINAL VALIDATION CHECKLIST

Run these after all 12 fixes are committed:

```bash
# 1. TypeScript compiles cleanly across the monorepo
cd apps/web && npx tsc --noEmit
cd services/api && npx tsc --noEmit
cd services/worker && npx tsc --noEmit
cd packages/core && npx tsc --noEmit

# 2. No access token in cookies or localStorage
grep -r "image_ops_api_token" apps/web --include="*.ts" --include="*.tsx"
grep -r "localStorage.*token\|token.*localStorage" apps/web --include="*.ts" --include="*.tsx"
# Both should return ZERO results

# 3. EXIF strip is server-side
grep -r "withMetadata" services/api --include="*.ts"
# Should return at least one result in uploads.ts

# 4. All env vars documented
grep "METRICS_TOKEN" services/api/.env.example
grep "NEXT_PUBLIC_SITE_URL" apps/web/.env.example
grep "NEXT_PUBLIC_ENABLE_WATCHTOWER" apps/web/.env.example
# All three should return results

# 5. CSP header present
grep -r "Content-Security-Policy" apps/web/next.config.ts
# Should return a result

# 6. Integration tests pass
cd "/path/to/project"
npm run infra:up:integration
RUN_INTEGRATION_TESTS=1 INTEGRATION_API_BASE_URL=http://127.0.0.1:4000 npm run test:integration:api
```

---

## PRIORITY ORDER SUMMARY

| # | Fix | Priority | Effort |
|---|-----|----------|--------|
| 1 | Remove non-HttpOnly cookie | P1 Security | 10 min |
| 2 | Remove localStorage fallback | P1 Security | 10 min |
| 3 | Server-side EXIF stripping | P0 Privacy | 45 min |
| 4 | Add METRICS_TOKEN to .env.example | P1 Config | 5 min |
| 5 | Add missing env vars to .env.example | P2 Config | 10 min |
| 6 | SHA256 integrity check | P1 Data Integrity | 30 min |
| 7 | BullMQ dead-letter queue | P2 Reliability | 60 min |
| 8 | Content-Security-Policy header | P3 Security | 20 min |
| 9 | Cleanup route path validation | P3 Security | 10 min |
| 10 | Stripe key in validateEnv() | P3 Reliability | 15 min |
| 11 | Fix frontend type duplication | P3 Quality | 20 min |
| 12 | Wire or remove ad components | P2 Completeness | 30 min |

**Total estimated effort: ~4.5 hours of focused work.**
