# Image Ops Platform - Technical Design Document (TDD)

Version: 1.0  
Date: 2026-02-23  
Owner: Product + Engineering

## 1. Objective

Build an SEO-first, web-based Image Ops platform focused on seller workflows (Etsy/Amazon/Shopify), with:

- Free tier limit of 6 images per rolling 10 hours.
- Watermark on advanced outputs.
- Revenue from ads plus subscriptions.
- Strong privacy posture: uploaded images are not stored in the database and are automatically deleted after processing or session exit.
- Explicit in-product trust messaging about data deletion.

## 2. Scope

### In scope (V1)

- Tools:
- Resize
- Compress
- Background Remove (advanced)
- Format Convert (JPG/PNG/WEBP)
- Quota management (free and paid).
- Watermarking for advanced outputs on free plan.
- Ads integration for free users.
- Subscription billing.
- Temporary image storage with auto-deletion and exit cleanup.
- SEO content architecture for tool pages and audience pages.
- Basic analytics funnel.

### Out of scope (V1)

- Native mobile apps.
- Team collaboration (shared folders, permissions).
- AI object replacement/generation.
- Long-term asset library.

## 3. Users and Personas

- Marketplace seller: processes many listing images, time-sensitive.
- Casual user: one-off conversions/compression.
- Agency editor: bulk processing across clients.

## 4. Product Requirements

### Functional requirements

1. Users can upload and process images via browser.
2. Free users are limited to 6 images per rolling 10-hour window.
3. Advanced tools apply watermark for free users.
4. Paid users get no ads and no watermark (for permitted tools).
5. Uploaded binaries are never persisted in the relational database.
6. On page exit, frontend calls cleanup endpoint to delete temporary files.
7. Server enforces auto-expiry cleanup as fallback even if page-exit event fails.
8. Privacy messaging is visible near upload action and privacy page.

### Non-functional requirements

1. Availability target: 99.9% monthly.
2. P95 processing latency:

- Basic tools <= 3 seconds for 10 MB image.
- Background remove <= 8 seconds for 10 MB image.

3. Security:

- Signed URL access for temp objects.
- HTTPS only.
- At-rest encryption for temp object storage.

4. Compliance posture:

- Data minimization by design.
- Audit logs for deletion jobs and processing events.

5. SEO:

- Core Web Vitals pass for key pages.

## 5. Plan and Pricing

### Free plan

- 6 images per rolling 10 hours.
- Ads enabled.
- Watermark on advanced outputs.
- Max upload size: 10 MB per image (configurable).

### Pro plan (example)

- No ads.
- No watermark.
- 2,000 images/month.
- Higher size and batch limits.

### Team plan (example)

- Shared presets.
- 10,000 images/month.
- Priority queue.

### Monetization mix

- Display ads for free traffic.
- Subscriptions for recurring users.
- Optional one-time credit packs for burst users.

## 6. Information Architecture and SEO

### URL structure

- Tool pages: `/tools/:tool-slug`
- Use-case pages: `/for/:audience/:intent`
- Guides: `/guides/:topic`
- Comparisons: `/compare/:a-vs-b`

### Initial SEO page set (50 pages)

- 15 tool-intent pages.
- 20 audience/use-case pages.
- 15 guides/comparison pages.

### SEO implementation requirements

1. Server-rendered HTML with unique title/H1/meta per page.
2. Structured data:

- `FAQPage` for tool FAQs.
- `HowTo` for guided pages where valid.

3. Internal links:

- Every page links to at least 3 related pages.

4. XML sitemap:

- Separate index and page sitemaps.

5. Image sitemap for illustrative assets.
6. Canonical tags and noindex controls on low-value duplicates.

## 7. System Architecture

### High-level components

1. Frontend Web App (Next.js):

- Upload UX, tool forms, progress, results.
- Quota display, plan upgrade prompts, ad slots.

2. API Service (Node.js/TypeScript):

- Auth/session, quota checks, job orchestration, signed URL creation.

3. Worker Service:

- Image transformations via Sharp/ImageMagick + optional BG removal model/API.

4. Queue:

- BullMQ + Redis (or SQS alternative).

5. Temporary Object Storage:

- S3-compatible bucket with short lifecycle rules.

6. Relational DB (PostgreSQL):

- Users, plans, usage counters, jobs metadata, billing, audit events.

7. CDN:

- Static assets and edge caching for SEO pages.

### Storage and privacy model

- Image binary: temp object storage only.
- Database stores metadata only:
- tool type
- processing duration
- file size and mime
- deletion timestamps
- quota counters
- no original image content

## 8. Data Retention and Deletion Policy

### Deletion guarantees

1. On successful result delivery, temp files are scheduled for immediate delete.
2. On page exit, browser sends cleanup signal using `navigator.sendBeacon`.
3. Lifecycle fallback deletes any remaining temp objects within max TTL (15-30 minutes).
4. Database stores no uploaded image bytes.

### User-facing claim (recommended exact text)

`Your images are processed temporarily and automatically deleted. We do not store your uploaded images in our database after you leave the page.`

### Claim safety note

- Avoid absolute claims like "always deleted instantly on close."
- Use fallback TTL language in privacy policy to remain accurate.

## 9. Detailed API Design (V1)

### Authentication

- Anonymous session via secure cookie for free users.
- Account auth (email magic link or OAuth) for paid users.

### Endpoints

1. `POST /api/uploads/init`

- Input: filename, mime, size, tool.
- Output: temp object key, signed upload URL.
- Rules: validate mime/size, enforce quota pre-check.

2. `POST /api/jobs`

- Input: tool, temp object key, options.
- Output: job ID.
- Rules: full quota check, enqueue processing.

3. `GET /api/jobs/:id`

- Output: status, progress, signed download URL if complete.

4. `POST /api/cleanup`

- Input: temp object keys.
- Output: accepted.
- Use from page-exit beacon and manual cleanup.

5. `GET /api/quota`

- Output: plan, used, limit, window reset timestamp.

6. `POST /api/billing/checkout`

- Output: payment session URL.

7. `POST /api/webhooks/billing`

- Updates subscription status.

## 10. Database Schema (PostgreSQL)

### `users`

- `id` (uuid, pk)
- `email` (nullable for anonymous)
- `plan` (`free|pro|team`)
- `created_at`

### `sessions`

- `id` (uuid, pk)
- `user_id` (nullable)
- `device_fingerprint_hash`
- `created_at`
- `last_seen_at`

### `quota_windows`

- `id` (uuid, pk)
- `subject_type` (`user|session`)
- `subject_id`
- `window_start_at`
- `used_count`
- Unique index on (`subject_type`, `subject_id`)

### `jobs`

- `id` (uuid, pk)
- `subject_id`
- `tool`
- `is_advanced` (bool)
- `watermark_applied` (bool)
- `input_object_key` (temp key only)
- `output_object_key` (temp key only)
- `status` (`queued|running|done|failed|expired`)
- `error_code` (nullable)
- `created_at`
- `completed_at` (nullable)

### `deletion_audit`

- `id` (uuid, pk)
- `object_key`
- `reason` (`delivered|page_exit|ttl_expiry|manual`)
- `deleted_at`
- `result` (`success|not_found|failed`)

### `events`

- `id` (uuid, pk)
- `subject_id`
- `event_name`
- `properties_json`
- `created_at`

## 11. Quota and Watermark Logic

### Quota algorithm (rolling window)

1. Fetch subject window by user ID else session ID.
2. If `now > window_start_at + 10h`, reset `window_start_at = now`, `used_count = 0`.
3. If `used_count + requested_images > 6` for free plan, reject with limit error.
4. On accepted job creation, increment `used_count`.

### Advanced tool watermark rules

1. Mark tools with `is_advanced = true`.
2. If `plan = free` and tool is advanced, apply watermark during render.
3. For paid plans, skip watermark.

## 12. Ads Strategy

### Placement

1. Header banner on tool pages (free only).
2. Inline ad below results action area (free only).
3. Desktop sidebar ad on guide pages.

### Guardrails

1. No ad should block upload CTA or result download button.
2. Delay ad render until after first interaction for better UX.
3. Disable ads for paid plans.
4. Respect consent rules by region and browser settings.

### Measurement

- Track RPM, CTR, and impact on upload-to-complete conversion.

## 13. Security and Abuse Prevention

1. File type sniffing plus extension validation.
2. Upload size caps.
3. Rate limits by IP + session.
4. Malware scan hook for suspicious payload types.
5. Signed URLs with short expiration.
6. CSRF protection for session-auth endpoints.
7. Bot mitigation on high-volume endpoints.

## 14. Observability

### Metrics

- Upload started/completed.
- Job success/failure rate by tool.
- Processing latency percentiles.
- Cleanup success rate.
- Quota rejection rate.

### Alerts

- Cleanup failure > 2% for 15 minutes.
- Job failure > 5% for 10 minutes.
- BG removal latency spikes above SLO.

## 15. Test Strategy (Test-Driven Development)

### Unit tests

1. Quota window reset and limit checks.
2. Watermark gating by plan/tool.
3. Cleanup decision logic.
4. Signed URL expiry validation.

### Integration tests

1. Upload init -> job creation -> completion flow.
2. Page-exit cleanup endpoint deletes temp objects.
3. TTL worker removes stale objects.
4. Billing webhook updates plan and ad/watermark behavior.

### End-to-end tests

1. Free user processes 6 images, 7th blocked until window reset.
2. Free advanced output includes watermark.
3. Pro user sees no ads, no watermark.
4. Privacy text visible near upload button and policy page.

### Performance tests

1. Concurrent upload tests for quota correctness.
2. Large image batch throughput for worker pool.
3. CDN cache hit ratio on SEO pages.

## 16. Delivery Plan

### Phase 1 (Week 1-2)

- Project scaffold, auth/session, upload pipeline, resize/compress.
- Quota engine and free plan enforcement.

### Phase 2 (Week 3-4)

- Background remove and watermark support.
- Cleanup on page exit + TTL sweeper jobs.
- Privacy messaging and policy page.

### Phase 3 (Week 5-6)

- Billing, plan gates, ad integration.
- Analytics instrumentation.
- SEO templates and first 20 indexed pages.

### Phase 4 (Week 7-8)

- Hardening, performance tuning, test coverage uplift.
- Release readiness, incident playbooks.

## 17. Acceptance Criteria

1. Free users cannot process more than 6 images in any rolling 10-hour window.
2. Advanced tool outputs are watermarked for free plan only.
3. Uploaded image binaries are not present in relational DB tables.
4. Temp files are deleted on result completion or page-exit cleanup, with TTL fallback.
5. Upload area displays required trust statement.
6. Ads display for free users and are absent for paid users.
7. Core pages are crawlable, indexable, and pass baseline CWV.

## 18. How This Can Be Built For You

### Delivery approach

1. Confirm stack and hosting:

- Recommended: Next.js + Node + Postgres + Redis + S3-compatible storage.

2. Build production foundation first:

- CI, environment management, secrets, monitoring, error tracking.

3. Implement by vertical slices:

- Upload + process + cleanup + quota + UI + tests per tool.

4. Launch with 3 tools and SEO foundation:

- Resize, compress, background remove.

5. Add monetization:

- Ads first for free traffic, then subscription gates.

### Engineering artifacts I can produce next

1. Repository scaffold and folder structure.
2. SQL migrations for all schema above.
3. API contracts (OpenAPI spec).
4. Queue worker implementation stubs.
5. First 20 SEO landing page templates.
6. CI pipeline and deployment manifests.

## 19. Risks and Mitigations

1. Risk: privacy claim mismatch with actual behavior.

- Mitigation: enforce delete audit logs and periodic verification jobs.

2. Risk: ad overload hurts conversion.

- Mitigation: strict placement caps and A/B tests.

3. Risk: BG remove costs too high.

- Mitigation: usage throttles, credits, and provider benchmarking.

4. Risk: SEO pages become thin/duplicate.

- Mitigation: unique copy blocks and strong internal linking strategy.

## 20. Open Decisions

1. Final ad network choice (AdSense vs managed network).
2. Background removal engine (self-hosted model vs API provider).
3. Region-specific consent implementation timeline.
4. Final Pro and Team quotas and upload size caps.
