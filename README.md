# Image Ops

SEO-first image utility platform for marketplace sellers (Etsy/Amazon/Shopify), with:
- Free plan: 6 images per rolling 10 hours
- Watermark on advanced outputs for free users
- Ads + subscription monetization
- Privacy-safe processing: no uploaded image binaries stored in the database

## Monorepo Structure
- `apps/web`: Next.js frontend
- `services/api`: API service (quota, jobs, cleanup)
- `services/worker`: image processing worker
- `packages/core`: shared domain logic (quota rules, types)
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

## Current Status
- Architecture and TDD complete: `docs/image-ops-tdd.md`
- Initial scaffold in place
- Core quota logic + tests implemented in `packages/core`

## Parallel Development (Git Worktrees)
- Team worktree workflow: `docs/git-worktree-plan.md`
- Use isolated branches/worktrees for parallel streams (web, api, worker, seo) to reduce merge conflicts and speed delivery.

## Privacy Promise (UI copy)
Your images are processed temporarily and automatically deleted. We do not store your uploaded images in our database after you leave the page.
