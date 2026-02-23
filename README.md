# Image Ops

SEO-first image utility platform for marketplace sellers (Etsy/Amazon/Shopify), with:
- Free plan: 6 images per rolling 10 hours
- Watermark on advanced outputs for free users
- Ads + subscription monetization
- Privacy-safe processing: no uploaded image binaries stored in the database

## Monorepo Structure
- `apps/web`: Next.js frontend
- `services/api`: API service (`uploads/init`, `jobs`, `jobs/:id`, `cleanup`, `quota`)
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
Required variables are listed in `/Users/sucheetboppana/Documents/New project/.env.example`.

Key runtime groups:
- API: `API_PORT`, `WEB_ORIGIN`, `MAX_UPLOAD_BYTES`, `SIGNED_UPLOAD_TTL_SECONDS`, `SIGNED_DOWNLOAD_TTL_SECONDS`
- Queue/Redis: `REDIS_URL`, `JOB_QUEUE_NAME`
- Storage: `S3_REGION`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_FORCE_PATH_STYLE`
- Worker/background remove: `WORKER_CONCURRENCY`, `BG_REMOVE_API_URL`, `BG_REMOVE_TIMEOUT_MS`, `BG_REMOVE_MAX_RETRIES`, `BG_REMOVE_BACKOFF_BASE_MS`, `BG_REMOVE_BACKOFF_MAX_MS`

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

## Test Commands
From `/Users/sucheetboppana/Documents/New project`:
```bash
npm run test
npm run test -w services/api
npm run test -w services/worker
npm run test -w packages/core
```

## V1 Notes
- Uploaded binaries are temporary objects in S3-compatible storage only.
- Relational metadata schema exists in `infra/sql/001_initial_schema.sql`; V1 runtime metadata repository currently uses Redis abstractions.
- Free plan quota is enforced as 6 images per rolling 10 hours at job creation.
- Watermark is applied only for advanced tool outputs (`background-remove`) on free plan.

## Parallel Development (Git Worktrees)
- Team worktree workflow: `docs/git-worktree-plan.md`
- Use isolated branches/worktrees for parallel streams (web, api, worker, seo) to reduce merge conflicts and speed delivery.

## Privacy Promise (UI copy)
Your images are processed temporarily and automatically deleted. We do not store your uploaded images in our database after you leave the page.
