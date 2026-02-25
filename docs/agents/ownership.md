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

# Agent Ownership: Integration Test Harness

Branch: `codex/v1-processing-backend`

## Scope
- Add docker-backed integration harness (Redis + MinIO + optional Postgres).
- Add end-to-end tests validating upload-init -> job -> worker -> status -> cleanup.

## Owned Areas
- `infra/docker-compose.integration.yml`
- `services/api/test/integration/*`
- `services/worker/test/integration/*`
- `README.md` (integration run instructions)

## Acceptance Checks
1. Infra can start locally with one command.
2. Integration tests run against real services (not in-memory fakes).
3. Includes cleanup and idempotency verification.

## Out of Scope
- Core API/worker algorithm changes except minimal testability hooks.
