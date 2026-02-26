# Image-Ops — Technical Remediation

> Generated from audit: February 2026  
> Drop this file in your repo at `docs/REMEDIATION.md` and tell Codex to follow it.

---

## Context

You are working on a production monorepo called **Image-Ops**.

- **Local path:** `/Users/sucheetboppana/Documents/New project`
- **Structure:** `apps/web` (Next.js), `services/api`, `services/worker`, `services/mcp-gateway`, `packages/core`, `infra/sql`

**Rules:**

- Do NOT change any business logic
- Do NOT touch the frontend design (colours, fonts, animations already implemented)
- Fix ONLY the issues listed below, in the exact order given
- After each numbered step, run the relevant test suite and confirm it passes before proceeding
- Commit after every step with a descriptive message

---

## STEP 1 — Shared Error Hierarchy (`packages/core`)

**Why first:** Everything else depends on this. All services need consistent error types before we harden anything else.

1. Create `packages/core/src/errors.ts` with the following classes:

```typescript
export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'AppError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class QuotaExceededError extends AppError {
  constructor() {
    super('QUOTA_EXCEEDED', 429, 'Image quota exceeded for this period');
  }
}

export class AuthError extends AppError {
  constructor(msg = 'Unauthorized') {
    super('UNAUTHORIZED', 401, msg);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super('NOT_FOUND', 404, `${resource} not found`);
  }
}

export class ValidationError extends AppError {
  constructor(msg: string) {
    super('VALIDATION_ERROR', 400, msg);
  }
}

export class BillingError extends AppError {
  constructor(msg: string) {
    super('BILLING_ERROR', 402, msg);
  }
}

export class ConflictError extends AppError {
  constructor(msg: string) {
    super('CONFLICT', 409, msg);
  }
}

export class RateLimitError extends AppError {
  constructor() {
    super('RATE_LIMITED', 429, 'Too many requests. Please wait and try again.');
  }
}
```

2. Create `packages/core/src/index.ts` barrel file:

```typescript
export * from './errors';
export * from './quota';
export * from './watermark';
export * from './tools';
export type * from './types';
```

3. Update `packages/core/package.json`:
   - Set `"name": "@imageops/core"`
   - Add `"exports": { ".": "./src/index.ts" }`

4. Update workspace `tsconfig` references in all services to resolve `@imageops/core`. Find every direct relative import like `../../packages/core/src/anything` across `services/api` and `services/worker` and replace with `@imageops/core`.

5. In `services/api`, add a global error handler as the **last** `app.use()` call (after all routes):

```typescript
import { AppError } from '@imageops/core';

app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof AppError) {
    return res.status(err.status).json({
      error: { code: err.code, message: err.message },
    });
  }
  // Unknown error — never expose internals
  logger.error({ err }, 'Unhandled error');
  return res.status(500).json({
    error: { code: 'INTERNAL', message: 'An unexpected error occurred' },
  });
});
```

6. Replace every `throw new Error(...)` in `services/api` and `services/worker` with the appropriate `AppError` subclass.

**Commit message:** `fix(core): add shared error hierarchy and barrel export`

---

## STEP 2 — Auth Hardening (`services/api`)

**Why:** One weak secret = full account takeover for every user.

1. At API startup, **before** `app.listen()`, add these validations that crash the process if they fail:

```typescript
function validateEnv() {
  const secret = process.env.AUTH_TOKEN_SECRET;
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
    console.error(
      'FATAL: AUTH_TOKEN_SECRET must be at least 32 bytes. Generate one with: openssl rand -base64 32'
    );
    process.exit(1);
  }

  if (process.env.NODE_ENV === 'production') {
    if (process.env.AUTH_REFRESH_COOKIE_SECURE !== 'true') {
      console.error('FATAL: AUTH_REFRESH_COOKIE_SECURE must be "true" in production');
      process.exit(1);
    }
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      console.error('FATAL: STRIPE_WEBHOOK_SECRET is required in production');
      process.exit(1);
    }
    if (!process.env.METRICS_TOKEN) {
      console.error('FATAL: METRICS_TOKEN is required in production');
      process.exit(1);
    }
  }
}

validateEnv(); // call before anything else
```

`METRICS_TOKEN` is documented in both `/Users/sucheetboppana/Documents/New project/.env.example` and `/Users/sucheetboppana/Documents/New project/services/api/.env.example`.

2. **Remove `API_AUTH_REQUIRED` entirely** from:
   - All source files in `services/api`
   - `.env.example`
   - `README.md`
   - All `docker-compose` files
   - Replace any test code that used it with a proper test fixture that generates a real signed JWT token.

3. In the refresh token Redis **write path**, use atomic SET with EX — never SET then EXPIRE:

```typescript
// CORRECT — atomic
await redis.set(refreshTokenKey, tokenData, 'EX', AUTH_REFRESH_TTL_SECONDS);

// WRONG — do not use this pattern
await redis.set(refreshTokenKey, tokenData);
await redis.expire(refreshTokenKey, AUTH_REFRESH_TTL_SECONDS);
```

On refresh token **read**, check TTL. If TTL returns -1 (persisted with no expiry), delete the key and return 401:

```typescript
const ttl = await redis.ttl(refreshTokenKey);
if (ttl === -1) {
  await redis.del(refreshTokenKey);
  throw new AuthError('Session invalid');
}
```

4. Install rate limiting: `npm install express-rate-limit rate-limit-redis`

   Add rate limiters to auth routes (apply **before** route handlers):

```typescript
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  store: new RedisStore({ sendCommand: (...args) => redis.sendCommand(args) }),
  handler: (req, res) =>
    res.status(429).json({
      error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please wait 15 minutes.' },
    }),
  standardHeaders: true,
  legacyHeaders: false,
});

app.post('/api/auth/google', authLimiter, googleAuthHandler);
app.post('/api/auth/refresh', authLimiter, refreshHandler);
app.post('/api/auth/logout', authLimiter, logoutHandler);
```

5. Add per-user rate limiting on upload and job creation routes:

```typescript
const uploadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 30,
  keyGenerator: (req) => req.user?.id ?? req.ip, // use user ID not IP
  store: new RedisStore({ sendCommand: (...args) => redis.sendCommand(args) }),
  handler: (req, res) =>
    res.status(429).json({
      error: { code: 'RATE_LIMITED', message: 'Upload rate limit exceeded. Please wait.' },
    }),
});

app.post('/api/uploads/init', authenticate, uploadLimiter, uploadInitHandler);
app.post('/api/jobs', authenticate, uploadLimiter, createJobHandler);
```

**Commit message:** `fix(api): auth hardening — startup validation, remove API_AUTH_REQUIRED, atomic refresh tokens, rate limiting`

---

## STEP 3 — Webhook Integrity (`services/api`)

**Why:** Billing events can be spoofed right now. Subscription upgrades/cancellations can be faked.

1. Find the billing webhook route. **Move it to be registered BEFORE `express.json()` middleware.** It must use `express.raw()` as its own body parser:

```typescript
// This MUST come before app.use(express.json())
app.post(
  '/api/webhooks/billing',
  express.raw({ type: 'application/json' }), // raw Buffer — not parsed JSON
  billingWebhookHandler
);

// All other routes use json() — registered AFTER the webhook route
app.use(express.json());
```

2. In `billingWebhookHandler`, verify the signature against the raw Buffer body:

```typescript
const sig = req.headers['stripe-signature'] as string;
let event: Stripe.Event;

try {
  // req.body must be a Buffer here — not a parsed object
  event = stripe.webhooks.constructEvent(
    req.body, // Buffer
    sig,
    process.env.STRIPE_WEBHOOK_SECRET!
  );
} catch (err) {
  logger.warn({ err }, 'Webhook signature verification failed');
  return res
    .status(400)
    .json({ error: { code: 'INVALID_SIGNATURE', message: 'Webhook signature invalid' } });
}
```

3. Add a test: POST to `/api/webhooks/billing` with a valid Stripe test event structure but wrong signature → assert 400. POST with correct signature → assert 200.

**Commit message:** `fix(api): enforce raw body parsing for Stripe webhook signature verification`

---

## STEP 4 — S3 Upload Security (`services/api`)

**Why:** Signed upload URLs currently allow uploading any file type including SVG/HTML — creating stored XSS risk.

1. Switch from `getSignedUrl` (PUT) to `createPresignedPost` which supports policy conditions. Install if needed: `npm install @aws-sdk/s3-presigned-post`

```typescript
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';

const { url, fields } = await createPresignedPost(s3Client, {
  Bucket: process.env.S3_BUCKET!,
  Key: objectKey,
  Conditions: [
    ['content-length-range', 1, parseInt(process.env.MAX_UPLOAD_BYTES!)],
    ['starts-with', '$Content-Type', 'image/'],
  ],
  Expires: parseInt(process.env.SIGNED_UPLOAD_TTL_SECONDS!),
});

return res.json({ url, fields, key: objectKey });
```

2. Update the frontend upload flow in `apps/web` to use POST with FormData instead of PUT. The `fields` from the presigned post must be included as form fields before the file:

```typescript
const formData = new FormData();
Object.entries(fields).forEach(([k, v]) => formData.append(k, v));
formData.append('Content-Type', file.type);
formData.append('file', file); // file must be last

await fetch(url, { method: 'POST', body: formData });
```

3. Add to `infra/README.md` — document the required S3 bucket settings:
   - Block all public access: **enabled**
   - No public bucket ACL
   - CORS config: allow POST from `WEB_ORIGIN` only, expose `ETag` header
   - Add lifecycle rule: expire objects with prefix `uploads/` after 24 hours (enforces privacy promise for abandoned uploads)

**Commit message:** `fix(api): restrict S3 upload Content-Type via presigned post policy`

---

## STEP 5 — Quota Race Condition (`packages/core` + `services/api`)

**Why:** Free plan quota is trivially bypassable with concurrent requests right now.

1. In `packages/core/src/quota.ts`, replace the check-then-increment pattern with an atomic Redis Lua script:

```typescript
const QUOTA_SCRIPT = `
  local key = KEYS[1]
  local limit = tonumber(ARGV[1])
  local ttl = tonumber(ARGV[2])
  local current = tonumber(redis.call('GET', key) or '0')
  if current >= limit then
    return -1
  end
  local new_val = redis.call('INCR', key)
  if new_val == 1 then
    redis.call('EXPIRE', key, ttl)
  end
  return new_val
`;

let quotaScriptSha: string;

export async function loadQuotaScript(redis: Redis): Promise<void> {
  quotaScriptSha = await redis.scriptLoad(QUOTA_SCRIPT);
}

export async function checkAndIncrementQuota(
  redis: Redis,
  userId: string,
  limit: number,
  windowSeconds: number
): Promise<boolean> {
  const windowKey = Math.floor(Date.now() / (windowSeconds * 1000));
  const key = `quota:${userId}:${windowKey}`;

  const result = await redis.evalsha(quotaScriptSha, 1, key, limit, windowSeconds);
  return result !== -1; // true = allowed, false = quota exceeded
}
```

2. Call `loadQuotaScript(redis)` once at API startup before `app.listen()`.

3. In the job creation handler, replace the old quota check with `checkAndIncrementQuota`. If it returns `false`, throw `new QuotaExceededError()`.

4. Add a unit test in `packages/core`:
   - Simulate 8 concurrent calls to `checkAndIncrementQuota` with `limit=6`
   - Assert exactly 6 return `true` and exactly 2 return `false`
   - This test must use a real Redis connection (use the integration test setup)

**Commit message:** `fix(core): atomic quota enforcement via Redis Lua script — closes race condition`

---

## STEP 6 — Worker Reliability (`services/worker`)

**Why:** One bad job currently starves all workers. Slow jobs block fast ones. Crashed workers are invisible.

1. Replace the single queue with **three named queues**:

```typescript
import { Queue, Worker } from 'bullmq';

const connection = { host: redisHost, port: redisPort };

const defaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: { count: 100, age: 86400 },
  removeOnFail: { count: 500 },
};

const fastQueue = new Queue('image-ops-fast', { connection, defaultJobOptions });
const slowQueue = new Queue('image-ops-slow', { connection, defaultJobOptions });
const bulkQueue = new Queue('image-ops-bulk', { connection, defaultJobOptions });

// Tools routed to each queue:
// image-ops-fast:  compress, resize, convert, watermark
// image-ops-slow:  background-remove
// image-ops-bulk:  bulk-export

// Workers with separate concurrency:
const fastWorker = new Worker('image-ops-fast', processor, { connection, concurrency: 8 });
const slowWorker = new Worker('image-ops-slow', processor, { connection, concurrency: 3 });
const bulkWorker = new Worker('image-ops-bulk', processor, { connection, concurrency: 2 });
```

2. Update `services/api` job creation to route to the correct queue based on `toolId`.

3. Add failed event listeners on all three workers:

```typescript
[fastWorker, slowWorker, bulkWorker].forEach((worker) => {
  worker.on('failed', (job, err) => {
    logger.error(
      {
        jobId: job?.id,
        tool: job?.data?.toolId,
        userId: job?.data?.userId,
        attempts: job?.attemptsMade,
        err,
      },
      'Job failed permanently after all retries'
    );
  });
});
```

4. Install and add circuit breaker for bg-remove API calls: `npm install opossum @types/opossum`

```typescript
import CircuitBreaker from 'opossum';

const bgRemoveBreaker = new CircuitBreaker(callBgRemoveApi, {
  timeout: 15000,
  errorThresholdPercentage: 50,
  resetTimeout: 60000,
  volumeThreshold: 5,
});

bgRemoveBreaker.on('open', () => logger.warn('bg-remove circuit breaker OPEN'));
bgRemoveBreaker.on('halfOpen', () => logger.info('bg-remove circuit breaker HALF-OPEN'));
bgRemoveBreaker.on('close', () => logger.info('bg-remove circuit breaker CLOSED'));
```

5. Implement worker watchdog — write heartbeat to Redis every 30s:

```typescript
const WORKER_ID = process.env.HOSTNAME ?? `worker-${process.pid}`;
const HEARTBEAT_KEY = `worker:heartbeat:${WORKER_ID}`;
const HEARTBEAT_TTL = 90; // seconds

setInterval(async () => {
  await redis.set(HEARTBEAT_KEY, Date.now().toString(), 'EX', HEARTBEAT_TTL);
}, 30_000);

logger.info({ workerId: WORKER_ID }, 'worker.ready');
```

6. In `services/api`, update the `/ready` endpoint to check for at least one live heartbeat:

```typescript
const heartbeatKeys = await redis.keys('worker:heartbeat:*');
if (heartbeatKeys.length === 0) {
  return res.status(503).json({ status: 'error', reason: 'no live workers detected' });
}
```

**Commit message:** `fix(worker): three-queue priority separation, dead-letter config, circuit breaker, watchdog heartbeat`

---

## STEP 7 — Database (`infra/sql`)

**Why:** No rollback scripts = unrecoverable database state on migration failure in production.

1. Rename existing files to `.up.sql` suffix:

   ```
   001_initial_schema.sql         → 001_initial_schema.up.sql
   002_metadata_runtime_tables.sql → 002_metadata_runtime_tables.up.sql
   ```

2. Create corresponding `.down.sql` files that `DROP` all objects in reverse order.

3. Create `infra/sql/003_indexes.up.sql`:

```sql
-- Jobs by user for dashboard queries
CREATE INDEX IF NOT EXISTS idx_jobs_user_created
  ON jobs(user_id, created_at DESC);

-- Jobs by status for worker polling
CREATE INDEX IF NOT EXISTS idx_jobs_status
  ON jobs(status)
  WHERE status IN ('pending', 'processing');

-- Jobs by user + status for filtered dashboard views
CREATE INDEX IF NOT EXISTS idx_jobs_user_status
  ON jobs(user_id, status, created_at DESC);

-- Billing sessions by subject for reconcile endpoint
CREATE INDEX IF NOT EXISTS idx_billing_subject
  ON checkout_sessions(subject_id, created_at DESC);

-- Refresh sessions by token hash for auth refresh path
CREATE INDEX IF NOT EXISTS idx_refresh_token
  ON refresh_sessions(token_hash);

-- Refresh sessions by user for logout (revoke all sessions)
CREATE INDEX IF NOT EXISTS idx_refresh_user
  ON refresh_sessions(user_id, created_at DESC);
```

4. Create `infra/sql/003_indexes.down.sql` that drops all above indexes.

5. Create `scripts/migrate.ts` — a simple migration runner:
   - Reads all `.up.sql` files in `infra/sql/` in numeric order
   - Tracks applied migrations in a `schema_migrations(name, applied_at)` table
   - `npm run migrate:up` — applies pending migrations
   - `npm run migrate:down` — rolls back the last applied migration
   - `npm run migrate:status` — lists applied and pending

6. Add to `package.json` scripts:

   ```json
   "migrate:up": "tsx scripts/migrate.ts up",
   "migrate:down": "tsx scripts/migrate.ts down",
   "migrate:status": "tsx scripts/migrate.ts status"
   ```

7. Document in `infra/README.md` — S3 lifecycle rule (add this to your bucket config):
   ```json
   {
     "Rules": [
       {
         "Filter": { "Prefix": "uploads/" },
         "Expiration": { "Days": 1 },
         "Status": "Enabled"
       }
     ]
   }
   ```
   This enforces the privacy promise for abandoned uploads.

**Commit message:** `fix(infra): migration rollback scripts, performance indexes, S3 lifecycle docs`

---

## STEP 8 — Frontend Security & Auth (`apps/web`)

**Why:** Users are logged out on every page refresh. EXIF data exposes seller home locations.

1. Create `apps/web/components/providers/AuthProvider.tsx`:

```typescript
'use client';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth';
import { refreshToken } from '@/lib/auth';
import AppLoadingSkeleton from '@/components/ui/AppLoadingSkeleton';

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const setSession = useAuthStore(s => s.setSession);
  const clearSession = useAuthStore(s => s.clearSession);

  useEffect(() => {
    refreshToken()
      .then(({ token, user }) => setSession(token, user))
      .catch(() => clearSession()) // not logged in — that's fine
      .finally(() => setReady(true));
  }, []);

  if (!ready) return <AppLoadingSkeleton />;
  return <>{children}</>;
}
```

Add `<AuthProvider>` inside `app/(app)/layout.tsx` wrapping all children. This fixes the page-refresh logout bug permanently.

2. Add security headers to `next.config.js`:

```javascript
const nextConfig = {
  poweredByHeader: false,
  compress: true,
  productionBrowserSourceMaps: false,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        ],
      },
    ];
  },
};
```

3. Install piexifjs: `npm install piexifjs` in `apps/web`.

   In `components/upload/UploadZone.tsx`, strip EXIF before the file is used:

```typescript
import piexif from 'piexifjs';

async function stripExif(file: File): Promise<File> {
  if (file.type !== 'image/jpeg') return file; // only JPEG has EXIF

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const stripped = piexif.remove(e.target!.result as string);
        const binary = atob(stripped.split(',')[1]);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        resolve(new File([bytes], file.name, { type: file.type }));
      } catch {
        resolve(file); // if stripping fails, proceed with original
      }
    };
    reader.readAsDataURL(file);
  });
}

// In the drop/select handler, before calling onFileAccepted:
const cleanFile = await stripExif(rawFile);
onFileAccepted(cleanFile);
```

4. In `apps/web/lib/api.ts`, upgrade the 401 interceptor to handle parallel requests correctly:

```typescript
let isRefreshing = false;
let refreshQueue: Array<(token: string) => void> = [];

async function fetchWithAuth(input: RequestInfo, init?: RequestInit): Promise<Response> {
  const token = getAuthStore().token;
  const response = await fetch(input, {
    ...init,
    headers: { ...init?.headers, Authorization: `Bearer ${token}` },
  });

  if (response.status !== 401) return response;

  // Queue parallel requests while refresh is in flight
  if (isRefreshing) {
    return new Promise((resolve) => {
      refreshQueue.push((newToken) => {
        resolve(
          fetch(input, {
            ...init,
            headers: { ...init?.headers, Authorization: `Bearer ${newToken}` },
          })
        );
      });
    });
  }

  isRefreshing = true;
  try {
    const { token: newToken } = await refreshToken();
    getAuthStore().setSession(newToken, getAuthStore().user!);
    refreshQueue.forEach((cb) => cb(newToken));
    refreshQueue = [];
    return fetch(input, {
      ...init,
      headers: { ...init?.headers, Authorization: `Bearer ${newToken}` },
    });
  } catch {
    getAuthStore().clearSession();
    window.location.href = '/auth/login';
    throw new Error('Session expired');
  } finally {
    isRefreshing = false;
  }
}
```

5. In `services/worker`, ensure every `sharp()` call chain includes `.withMetadata(false)`:

```typescript
// Every sharp pipeline must include this
await sharp(inputBuffer)
  .withMetadata(false) // strip ALL EXIF from output
  // ... rest of pipeline
  .toBuffer();
```

**Commit message:** `fix(web): auth rehydration on refresh, security headers, EXIF stripping, parallel refresh queue`

---

## STEP 9 — Observability (`services/api` + `services/worker`)

**Why:** /metrics is publicly readable. Logs are inconsistent. No request correlation.

1. Add authentication to `GET /metrics`:

```typescript
app.get(
  '/metrics',
  (req, res, next) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token !== process.env.METRICS_TOKEN) {
      return res
        .status(401)
        .json({ error: { code: 'UNAUTHORIZED', message: 'Invalid metrics token' } });
    }
    next();
  },
  metricsHandler
);
```

2. Install pino: `npm install pino pino-pretty` in all services.

   Create `packages/core/src/logger.ts`:

```typescript
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  ...(process.env.NODE_ENV !== 'production'
    ? {
        transport: { target: 'pino-pretty', options: { colorize: true } },
      }
    : {}),
});

export function childLogger(context: Record<string, unknown>) {
  return logger.child(context);
}
```

Replace all `console.log`, `console.error`, `console.warn` calls in all services with `logger.info`, `logger.error`, `logger.warn`.

3. Add request ID middleware to `services/api` (register as first middleware):

```typescript
import { randomUUID } from 'crypto';

app.use((req, res, next) => {
  const requestId = (req.headers['x-request-id'] as string) ?? randomUUID();
  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);
  req.log = logger.child({ requestId, path: req.path, method: req.method });
  next();
});
```

**Commit message:** `fix(api,worker): protect /metrics endpoint, standardise pino logging, add request ID correlation`

---

## STEP 10 — Code Quality & Linting

**Why:** Prevents quality regression. Makes the codebase maintainable by more than one person.

1. Add `.eslintrc.js` at monorepo root:

```javascript
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'security'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:security/recommended',
  ],
  rules: {
    'no-console': 'warn',
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/explicit-function-return-type': 'off',
  },
  ignorePatterns: ['node_modules/', 'dist/', '.next/'],
};
```

Install: `npm install -D eslint @typescript-eslint/eslint-plugin @typescript-eslint/parser eslint-plugin-security`

2. Add `.prettierrc` at monorepo root:

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "es5",
  "printWidth": 100,
  "tabWidth": 2
}
```

3. Add husky + lint-staged:

   ```bash
   npm install -D husky lint-staged
   npx husky init
   ```

   `.husky/pre-commit`:

   ```sh
   npx lint-staged
   ```

   Add to root `package.json`:

   ```json
   "lint-staged": {
     "**/*.{ts,tsx}": ["eslint --fix", "prettier --write"]
   }
   ```

4. Add to `package.json` root scripts:

   ```json
   "lint": "eslint . --ext .ts,.tsx",
   "format": "prettier --write .",
   "format:check": "prettier --check .",
   "typecheck": "tsc --noEmit -p tsconfig.base.json"
   ```

5. Add to `.github/workflows/ci.yml` — before integration tests:

   ```yaml
   - name: Type Check
     run: npm run typecheck
   - name: Lint
     run: npm run lint
   - name: Format Check
     run: npm run format:check
   ```

6. Add idempotency to `billing/reconcile` endpoint:

```typescript
app.post('/api/billing/reconcile', authenticate, async (req, res) => {
  const idempotencyKey = req.headers['idempotency-key'] as string;

  if (idempotencyKey) {
    const cacheKey = `reconcile:${idempotencyKey}`;
    const cached = await redis.get(cacheKey);
    if (cached) return res.json(JSON.parse(cached));
  }

  const result = await reconcileBilling();

  if (idempotencyKey) {
    await redis.set(`reconcile:${idempotencyKey}`, JSON.stringify(result), 'EX', 86400);
  }

  return res.json(result);
});
```

**Commit message:** `fix(dx): add eslint, prettier, husky pre-commit hooks, reconcile idempotency`

---

## STEP 11 — MCP Gateway Security (`services/mcp-gateway`)

**Why:** Internal execution surface is currently open to any process that can reach the port.

1. Add internal service token authentication:

```typescript
const MCP_GATEWAY_SECRET = process.env.MCP_GATEWAY_SECRET;

if (!MCP_GATEWAY_SECRET || Buffer.byteLength(MCP_GATEWAY_SECRET, 'utf8') < 32) {
  console.error('FATAL: MCP_GATEWAY_SECRET must be at least 32 bytes');
  process.exit(1);
}

app.use((req, res, next) => {
  const token = req.headers['x-internal-token'];
  if (token !== MCP_GATEWAY_SECRET) {
    return res
      .status(403)
      .json({ error: { code: 'FORBIDDEN', message: 'Invalid internal token' } });
  }
  next();
});
```

2. Add tool whitelist — only allow execution of known tool IDs:

```typescript
import { TOOL_IDS } from '@imageops/core'; // the ToolId type values as array

app.post('/execute', internalAuth, (req, res) => {
  const { toolId } = req.body;
  if (!TOOL_IDS.includes(toolId)) {
    return res
      .status(403)
      .json({ error: { code: 'FORBIDDEN', message: `Tool '${toolId}' is not permitted` } });
  }
  // proceed with execution
});
```

3. Add `MCP_GATEWAY_SECRET` to `.env.example` and startup validation.

**Commit message:** `fix(mcp-gateway): add internal service token auth and tool whitelist`

---

## STEP 12 — Next.js Performance (`apps/web`)

**Why:** SEO pages currently rebuild on every request — unnecessary latency and compute cost.

1. Add `generateStaticParams()` and `revalidate` to every dynamic SEO route:

```typescript
// Add to each of these files:
// app/(marketing)/tools/[tool]/page.tsx
// app/(marketing)/use-cases/[slug]/page.tsx
// app/(marketing)/guides/[topic]/page.tsx
// app/(marketing)/compare/[slug]/page.tsx
// app/(marketing)/for/[audience]/[intent]/page.tsx

export const revalidate = 86400; // ISR — rebuild every 24h

export async function generateStaticParams() {
  // Return all valid param combinations
  // e.g. for tools:
  return ['background-remove', 'resize', 'compress', 'convert', 'watermark', 'bulk-export'].map(
    (tool) => ({ tool })
  );
}
```

2. Update `next.config.js` fully:

```javascript
const nextConfig = {
  poweredByHeader: false,
  compress: true,
  productionBrowserSourceMaps: false,
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '*.cloudfront.net' }],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
```

3. Add bundle analyser:

```bash
npm install -D @next/bundle-analyzer
```

```javascript
// next.config.js
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});
module.exports = withBundleAnalyzer(nextConfig);
```

Add to `apps/web/package.json`: `"analyze": "ANALYZE=true next build"`

**Commit message:** `fix(web): static generation for SEO pages, ISR, security headers, bundle analyser`

---

## STEP 13 — Final Validation

Run every check in this order. **All must pass before considering remediation complete.**

```bash
# 1. Unit + integration tests
npm run test

# 2. Linting
npm run lint

# 3. Type checking
npm run typecheck

# 4. Format check
npm run format:check

# 5. Integration tests against local stack
npm run infra:up:integration
RUN_INTEGRATION_TESTS=1 INTEGRATION_API_BASE_URL=http://127.0.0.1:4000 npm run test:integration:api
npm run infra:down:integration

# 6. Full staging smoke
npm run infra:up:deploy
STAGING_API_BASE_URL=http://127.0.0.1:4000 npm run smoke:staging
npm run infra:down:deploy
```

**Manual verification checklist — do each one by hand:**

- [ ] Start API with `AUTH_TOKEN_SECRET="tooshort"` → must crash with FATAL message
- [ ] Send Stripe webhook with tampered body → must get `400`
- [ ] Call `POST /api/uploads/init` 31 times in 10 minutes → 31st must get `429`
- [ ] Submit 8 concurrent job creation requests for a free user → exactly 6 succeed, 2 get `429`
- [ ] Hard-refresh a page while logged in → must remain logged in (auth rehydration working)
- [ ] `GET /metrics` without token → must get `401`
- [ ] `GET /metrics` with correct `METRICS_TOKEN` → must get `200`
- [ ] Upload a JPEG photo with GPS EXIF → verify output has no EXIF (use exiftool)
- [ ] Worker heartbeat: kill the worker process, wait 90s, call `GET /ready` on API → must get `503`

**Final commit:**

```bash
git add .
git commit -m "fix: complete security, reliability, and code quality remediation — see docs/REMEDIATION.md"
git push origin master
```

---

## Summary

| Step | Area                   | Time | Priority    |
| ---- | ---------------------- | ---- | ----------- |
| 1    | Shared Error Hierarchy | 2h   | Foundation  |
| 2    | Auth Hardening         | 3h   | 🔴 Critical |
| 3    | Webhook Integrity      | 1h   | 🔴 Critical |
| 4    | S3 Upload Security     | 2h   | 🔴 Critical |
| 5    | Quota Race Condition   | 2h   | 🟠 High     |
| 6    | Worker Reliability     | 4h   | 🔴 Critical |
| 7    | Database Migrations    | 2h   | 🔴 Critical |
| 8    | Frontend Security      | 3h   | 🟠 High     |
| 9    | Observability          | 2h   | 🟡 Medium   |
| 10   | Code Quality           | 2h   | 🟡 Medium   |
| 11   | MCP Gateway            | 1h   | 🟠 High     |
| 12   | Next.js Performance    | 2h   | 🟡 Medium   |
| 13   | Final Validation       | 2h   | Required    |

**Total: ~28 hours of engineering work.**

After these 13 steps, Image-Ops is production-ready — secure enough to take real money from real customers, reliable enough to process images under load, and maintainable enough to build on top of.
