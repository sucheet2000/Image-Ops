# Image Ops

SEO-first image utility platform for marketplace sellers (Etsy/Amazon/Shopify), with:
- Free plan: 6 images per rolling 10 hours
- Watermark on advanced outputs for free users
- Ads + subscription monetization
- Privacy-safe processing: no uploaded image binaries stored in the database

## Monorepo Structure
- `apps/web`: Next.js frontend
- `services/api`: API service (`uploads/init`, `auth/session`, `jobs`, `jobs/:id`, `cleanup`, `quota`, `billing/checkout`, `billing/reconcile`, `webhooks/billing`)
- `services/mcp-gateway`: constrained MCP gateway (`search` + `execute`)
- `services/worker`: BullMQ consumer and sharp-based image processing pipeline
- `packages/core`: shared domain logic (quota rules, tool/job contracts, watermark policy)
- `infra/sql`: database migrations
- `docs`: TDD and planning docs

## Quick Start
1. Install dependencies:
```bash
npm install
```
2. Copy env template:
```bash
cp .env.example .env
```
3. Run development services:
```bash
npm run dev
```

For the worker in a separate terminal:
```bash
npm run dev -w services/worker
```

## Environment
Required variables are listed in `.env.example`.

Key runtime groups:
- API: `API_PORT`, `WEB_ORIGIN`, `MAX_UPLOAD_BYTES`, `SIGNED_UPLOAD_TTL_SECONDS`, `SIGNED_DOWNLOAD_TTL_SECONDS`
- Auth: `API_AUTH_REQUIRED`, `GOOGLE_CLIENT_ID`, `AUTH_TOKEN_SECRET`, `AUTH_TOKEN_TTL_SECONDS`, `AUTH_REFRESH_TTL_SECONDS`, `AUTH_REFRESH_COOKIE_NAME`, `AUTH_REFRESH_COOKIE_SECURE`, `AUTH_REFRESH_COOKIE_SAMESITE`, `AUTH_REFRESH_COOKIE_DOMAIN`, `AUTH_REFRESH_COOKIE_PATH`
- Billing: `BILLING_PROVIDER`, `BILLING_PUBLIC_BASE_URL`, `BILLING_PROVIDER_SECRET`, `BILLING_WEBHOOK_SECRET`, `BILLING_CHECKOUT_TTL_SECONDS`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_WEBHOOK_TOLERANCE_SECONDS`, `STRIPE_PRICE_ID_PRO`, `STRIPE_PRICE_ID_TEAM`
- Queue/Redis: `REDIS_URL`, `JOB_QUEUE_NAME`
- Repository driver: `JOB_REPO_DRIVER` (`redis` or `postgres`), `POSTGRES_URL` (required when postgres)
- Storage: `S3_REGION`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_FORCE_PATH_STYLE`
- Worker/background remove: `WORKER_CONCURRENCY`, `WORKER_HEARTBEAT_INTERVAL_MS`, `BG_REMOVE_API_URL`, `BG_REMOVE_TIMEOUT_MS`, `BG_REMOVE_MAX_RETRIES`, `BG_REMOVE_BACKOFF_BASE_MS`, `BG_REMOVE_BACKOFF_MAX_MS`

## Observability
- `GET /health`: basic liveness probe.
- `GET /ready`: readiness probe that verifies storage and metadata repository connectivity.
- `GET /metrics`: Prometheus-style metrics for uptime, in-flight requests, request counts, and duration totals.
- Worker emits `worker.ready`, `worker.completed`, `worker.failed`, and periodic `worker.heartbeat` structured log events.

## Auth Session Strategy
- `POST /api/auth/google` issues a short-lived bearer access token plus an HttpOnly refresh cookie.
- `POST /api/auth/refresh` rotates refresh sessions (single-use refresh token semantics) and returns a new bearer token.
- `POST /api/auth/logout` revokes the current refresh session and clears the cookie.
- Web clients should use bearer headers for protected APIs and rely on refresh cookies for silent token renewal.

## Billing Reconciliation
- `POST /api/billing/reconcile` scans paid checkout sessions and repairs downgraded/missing subject plans.
- Use this endpoint as a drift-recovery control when webhook delivery is delayed or partially failed.

## Local Infrastructure
Minimum local dependencies:
1. Redis (BullMQ queue + metadata repository).
2. S3-compatible object storage (MinIO recommended).

Example MinIO start:
```bash
docker run --rm -p 9000:9000 -p 9001:9001 \
  -e MINIO_ROOT_USER=minioadmin \
  -e MINIO_ROOT_PASSWORD=minioadmin \
  quay.io/minio/minio server /data --console-address \":9001\"
```

## Containerized Staging Stack
For a self-hosted staging-like stack (web + api + worker + redis + postgres + minio):
```bash
npm run infra:up:deploy
```

This uses `infra/docker-compose.deploy.yml` and builds:
- `apps/web/Dockerfile`
- `services/api/Dockerfile`
- `services/worker/Dockerfile`

After stack startup:
```bash
STAGING_API_BASE_URL=http://127.0.0.1:4000 npm run smoke:staging
```

Stop the stack:
```bash
npm run infra:down:deploy
```

Notes:
- `infra/docker-compose.deploy.yml` is intended for staging/self-hosted environments.
- For managed cloud production, keep the same images/env values and use managed Redis/Postgres/S3.

## Test Commands
From the project root:
```bash
npm run test
npm run test -w services/api
npm run test -w services/worker
npm run test -w packages/core
```

## Integration Harness
1. Start integration dependencies:
```bash
npm run infra:up:integration
```
2. Run API + worker locally against the integration stack (separate terminals):
```bash
# terminal 1 (API)
API_PORT=4000 \
WEB_ORIGIN=http://127.0.0.1:3000 \
JOB_QUEUE_NAME=image-ops-jobs \
S3_REGION=us-east-1 \
S3_BUCKET=image-ops-temp \
S3_ACCESS_KEY=minioadmin \
S3_SECRET_KEY=minioadmin \
S3_ENDPOINT=http://127.0.0.1:9000 \
S3_FORCE_PATH_STYLE=true \
REDIS_URL=redis://127.0.0.1:6379 \
BILLING_PUBLIC_BASE_URL=http://127.0.0.1:3000 \
BILLING_PROVIDER_SECRET=dev-provider-secret \
BILLING_WEBHOOK_SECRET=dev-webhook-secret \
npm run dev -w services/api
```
```bash
# terminal 2 (worker)
JOB_QUEUE_NAME=image-ops-jobs \
S3_REGION=us-east-1 \
S3_BUCKET=image-ops-temp \
S3_ACCESS_KEY=minioadmin \
S3_SECRET_KEY=minioadmin \
S3_ENDPOINT=http://127.0.0.1:9000 \
S3_FORCE_PATH_STYLE=true \
REDIS_URL=redis://127.0.0.1:6379 \
BG_REMOVE_API_URL=http://127.0.0.1:9999/mock-unused \
npm run dev -w services/worker
```
These values match CI. You can also rely on defaults from `.env.example` where applicable.
3. Run integration tests:
```bash
RUN_INTEGRATION_TESTS=1 INTEGRATION_API_BASE_URL=http://127.0.0.1:4000 npm run test:integration:api
```
This includes:
- `health.integration.test.ts` (health smoke)
- `workflow.integration.test.ts` (upload-init -> upload PUT -> jobs -> worker completion -> status -> cleanup)
- `auth-billing-dedup.integration.test.ts` (session + billing webhook plan sync + dedup canonicalization)
4. Tear down stack:
```bash
npm run infra:down:integration
```

CI note:
- Pull requests run an `integration` job in `.github/workflows/ci.yml` that brings up Redis + MinIO, starts API + worker, and executes `test:integration:api`.
- Pushes to `master` also run the same integration gate before release promotion.

## Staging Smoke Check
After deploying API + worker to staging, run:
```bash
STAGING_API_BASE_URL=https://api-staging.example.com npm run smoke:staging
```

If staging enforces bearer auth on `/api/jobs` and `/api/cleanup`, pass a token:
```bash
STAGING_API_BASE_URL=https://api-staging.example.com \
API_BEARER_TOKEN=your_token_here \
npm run smoke:staging
```

The smoke script validates:
- health endpoint
- upload-init -> upload PUT -> upload complete
- job create -> job completion -> download (when token is provided)
- cleanup idempotency path (when token is provided)

## V1 Notes
- Uploaded binaries are temporary objects in S3-compatible storage only.
- Relational metadata schema exists in `infra/sql/001_initial_schema.sql` and `infra/sql/002_metadata_runtime_tables.sql`; runtime metadata repository supports `JOB_REPO_DRIVER=redis|postgres`.
- Free plan quota is enforced as 6 images per rolling 10 hours at job creation.
- Watermark is applied only for advanced tool outputs (`background-remove`) on free plan.
- SEO page surfaces include `/tools/:tool`, `/use-cases/:slug`, `/for/:audience/:intent`, `/guides/:topic`, and `/compare/:slug`.

## Parallel Development (Git Worktrees)
- Team worktree workflow: `docs/git-worktree-plan.md`
- Use isolated branches/worktrees for parallel streams (web, api, worker, seo) to reduce merge conflicts and speed delivery.

## Privacy Promise (UI copy)
Your images are processed temporarily and automatically deleted. We do not store your uploaded images in our database after you leave the page.
