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
- `S3_PUBLIC_ENDPOINT=https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com`
- `S3_ACCESS_KEY=<R2_ACCESS_KEY_ID>`
- `S3_SECRET_KEY=<R2_SECRET_ACCESS_KEY>`

### Worker service (`image-ops-worker`)

- `S3_BUCKET=<R2_BUCKET>`
- `S3_ENDPOINT=https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com`
- `S3_ACCESS_KEY=<R2_ACCESS_KEY_ID>`
- `S3_SECRET_KEY=<R2_SECRET_ACCESS_KEY>`
- `BG_REMOVE_API_URL=<your background removal provider endpoint>`

### Web service (`image-ops-web`)

- `NEXT_PUBLIC_API_BASE_URL=https://api.example.com`

## 5. Add Custom Domains in Render

1. Add `app.example.com` to `image-ops-web`.
2. Add `api.example.com` to `image-ops-api`.
3. Copy the DNS targets Render provides for each service.

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

- Rotate generated secrets (`AUTH_TOKEN_SECRET`, billing secrets) on a schedule.
- Switch `BILLING_PROVIDER=stripe` only after setting Stripe env vars.
- Add uptime checks for `/ready` and alerting on `/metrics`.
