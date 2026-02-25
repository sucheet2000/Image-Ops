# Git Worktree Plan

## Goal

Use git worktrees to run multiple development streams in parallel without constantly stashing or switching branches in one directory.

## Directory Layout

- Main repo: `/Users/sucheetboppana/Documents/New project`
- Worktrees root: `/Users/sucheetboppana/Documents/worktrees/image-ops`

## Branching Convention

- Use branch names prefixed with `codex/`.
- Examples:
- `codex/web-upload-ui`
- `codex/api-upload-cleanup`
- `codex/worker-transform-pipeline`
- `codex/seo-landing-pages`

## Initial Setup

1. Create parent directory:

```bash
mkdir -p "/Users/sucheetboppana/Documents/worktrees/image-ops"
```

2. Add worktrees:

```bash
git worktree add "/Users/sucheetboppana/Documents/worktrees/image-ops/web-upload-ui" -b codex/web-upload-ui master
git worktree add "/Users/sucheetboppana/Documents/worktrees/image-ops/api-upload-cleanup" -b codex/api-upload-cleanup master
git worktree add "/Users/sucheetboppana/Documents/worktrees/image-ops/worker-transform-pipeline" -b codex/worker-transform-pipeline master
git worktree add "/Users/sucheetboppana/Documents/worktrees/image-ops/seo-landing-pages" -b codex/seo-landing-pages master
```

## Recommended Ownership

1. `codex/web-upload-ui`

- Upload UX, trust messaging placement, free-limit UX.

2. `codex/api-upload-cleanup`

- Upload init endpoint, cleanup endpoint, quota API.

3. `codex/worker-transform-pipeline`

- Image transform jobs, watermark application, deletion audits.

4. `codex/seo-landing-pages`

- Tool pages, long-tail SEO pages, schema markup.

## Daily Workflow

1. Pull latest mainline:

```bash
git checkout master
git pull origin master
```

2. Rebase each active worktree branch:

```bash
git -C "/Users/sucheetboppana/Documents/worktrees/image-ops/web-upload-ui" fetch origin
git -C "/Users/sucheetboppana/Documents/worktrees/image-ops/web-upload-ui" rebase origin/master
```

3. Keep PRs small and vertical (1 stream = 1 PR).
4. Merge in order of dependency:

- `core` -> `api` -> `worker` -> `web` -> `seo`.

## Safety Rules

1. Never share the same branch name across two worktrees.
2. Avoid editing the same file in multiple worktrees at once.
3. Run tests in each worktree before pushing.
4. Delete merged worktrees to keep workspace clean.

## Cleanup Commands

1. Remove a merged worktree:

```bash
git worktree remove "/Users/sucheetboppana/Documents/worktrees/image-ops/web-upload-ui"
```

2. Delete local merged branch:

```bash
git branch -d codex/web-upload-ui
```

3. Prune stale worktree metadata:

```bash
git worktree prune
```
