# Agent Ownership: Integration Test Harness

Branch: `codex/agent-integration-tests`

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
