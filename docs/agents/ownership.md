# Agent Ownership: API Modularization + Validation

Branch: `codex/agent-api-modular`

## Scope
- Modularize API routes/services around uploads/jobs/status/cleanup/quota.
- Enforce strict request validation and response contracts.
- Keep endpoint behavior aligned with TDD requirements.

## Owned Areas
- `services/api/src/config.ts`
- `services/api/src/routes/*`
- `services/api/src/services/storage.ts`
- `services/api/src/services/queue.ts`
- `services/api/src/server.ts`
- `services/api/test/*`

## Acceptance Checks
1. `POST /api/uploads/init`, `POST /api/jobs`, `GET /api/jobs/:id`, `POST /api/cleanup`, `GET /api/quota/:subjectId` pass tests.
2. Zod validation on all request payloads/params.
3. Signed URL behavior validated in tests.
4. Cleanup idempotency conflict/replay behavior validated.

## Out of Scope
- Worker transform algorithm implementation.
- Database driver migration work.
