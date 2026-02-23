# Agent Ownership: Core + Postgres Metadata

Branch: `codex/agent-core-postgres`

## Scope
- Implement Postgres-backed repository drivers for API and worker metadata.
- Keep Redis for BullMQ queue transport only.
- Ensure runtime switch supports `JOB_REPO_DRIVER=postgres|redis`.

## Owned Areas
- `services/api/src/services/job-repo*`
- `services/worker/src/services/job-repo*`
- `services/api/src/server.ts`
- `services/worker/src/worker.ts`
- `infra/sql/*` (if migration additions required)
- `.env.example` (repo-driver vars)

## Acceptance Checks
1. Job/quota/idempotency/deletion-audit metadata persists in Postgres when `JOB_REPO_DRIVER=postgres`.
2. Existing tests still pass under Redis mode.
3. New tests cover Postgres adapter behavior with an integration fixture.

## Out of Scope
- Image transform algorithm changes.
- Web UI changes.
