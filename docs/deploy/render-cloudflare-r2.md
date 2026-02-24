# Render + Cloudflare DNS + R2 Deployment Runbook

This runbook deploys Image Ops with:
- Render managed services (`web`, `api`, `worker`, Postgres, Redis)
- Cloudflare DNS + TLS for custom domains
- Cloudflare R2 as S3-compatible object storage

## 1. Prerequisites

- GitHub repo connected to Render.
- A Cloudflare-managed domain (example: `example.com`).
- Cloudflare R2 bucket + API token pair.
- Optional: Stripe keys if you switch `BILLING_PROVIDER=stripe`.

## 2. Create R2 Bucket + S3 Credentials

1. In Cloudflare, create bucket `image-ops-temp` (or your preferred bucket name).
2. Create R2 API token with read/write on that bucket.
3. Record:
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET`

R2 S3 endpoint format:

```txt
https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com
```

## 3. Deploy Render Blueprint

1. In Render, create a new Blueprint from this repository.
2. Use `render.yaml` at repo root.
3. Render provisions:
- `image-ops-postgres` (managed Postgres)
- `image-ops-redis` (managed Key Value/Redis-compatible)
- `image-ops-api` (Docker web service)
- `image-ops-worker` (Docker background worker)
- `image-ops-web` (Docker web service)

## 4. Fill Required Render Environment Variables

For all values marked `sync: false` in `render.yaml`, set the real values in Render.

### API service (`image-ops-api`)

- `WEB_ORIGIN=https://app.example.com`
- `GOOGLE_CLIENT_ID=<google oauth client id>`
- `BILLING_PUBLIC_BASE_URL=https://app.example.com`
- `BILLING_PORTAL_BASE_URL=https://app.example.com/billing/manage`
- `S3_BUCKET=<R2_BUCKET>`
- `S3_ENDPOINT=https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com`
- `S3_PUBLIC_ENDPOINT=https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com` (or `https://files.example.com`)
- `S3_ACCESS_KEY=<R2_ACCESS_KEY_ID>`
- `S3_SECRET_KEY=<R2_SECRET_ACCESS_KEY>`

`S3_PUBLIC_ENDPOINT` controls the host/domain used in presigned upload/download URLs. The API signs with this endpoint for presign generation (see `services/api/src/services/storage.ts` constructor and `getSignedUrl` calls). Set it to:
- `https://files.example.com` if you want presigned URLs on your custom files domain.
- `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com` if you want raw R2 S3 endpoint URLs.

If you choose a custom files domain, configure that domain in section 5 so it matches `S3_PUBLIC_ENDPOINT`.

### Worker service (`image-ops-worker`)

- `S3_BUCKET=<R2_BUCKET>`
- `S3_ENDPOINT=https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com`
- `S3_ACCESS_KEY=<R2_ACCESS_KEY_ID>`
- `S3_SECRET_KEY=<R2_SECRET_ACCESS_KEY>`
- `BG_REMOVE_API_URL=<your background removal provider endpoint>`

Recommended provider timing defaults in `render.yaml`:
- `BG_REMOVE_TIMEOUT_MS=15000`
- `BG_REMOVE_MAX_RETRIES=1`
- `BG_REMOVE_BACKOFF_MAX_MS=1000`

With `BG_REMOVE_MAX_RETRIES=1`, worst-case elapsed time per request is about 31 seconds (`15000 + 1000 + 15000`), using the capped retry wait from `BG_REMOVE_BACKOFF_MAX_MS`.

### Web service (`image-ops-web`)

- `NEXT_PUBLIC_API_BASE_URL=https://api.example.com`

## 5. Add Custom Domains (Render + R2)

1. Add `app.example.com` to `image-ops-web`.
2. Add `api.example.com` to `image-ops-api`.
3. Copy the DNS targets Render provides for each service.
4. If you use `S3_PUBLIC_ENDPOINT=https://files.example.com`, configure `files.example.com` as an R2 custom domain for your bucket in Cloudflare R2.

## 6. Configure Cloudflare DNS

Create CNAME records:

- `app` -> `<render-web-target>`
- `api` -> `<render-api-target>`

Recommendations:
- Start with Cloudflare proxy disabled (DNS only) until Render certificates are issued.
- After cert issuance and healthy traffic, optionally enable proxy.
- SSL/TLS mode: `Full (strict)`.

Optional apex redirect:
- Use Cloudflare redirect rules to send `example.com` -> `https://app.example.com`.

## 7. Production Sanity Checks

```bash
curl -fsS https://api.example.com/health
curl -fsS https://api.example.com/ready
curl -I https://app.example.com/tools/convert
```

Smoke test:

```bash
STAGING_API_BASE_URL=https://api.example.com npm run smoke:staging
```

If API auth is enabled:

```bash
STAGING_API_BASE_URL=https://api.example.com \
API_BEARER_TOKEN=<token> \
npm run smoke:staging
```

## 8. Post-deploy Hardening

- Rotating `AUTH_TOKEN_SECRET` immediately invalidates all active access/refresh sessions. Treat this as scheduled maintenance with user communication, or implement a multi-key JWT/session rotation strategy before frequent rotation.
- `BILLING_PROVIDER_SECRET` and `BILLING_WEBHOOK_SECRET` can be rotated more freely; they do not invalidate active auth sessions.
- Switch `BILLING_PROVIDER=stripe` only after setting Stripe env vars.
- Add uptime checks for `/ready` and alerting on `/metrics`.
