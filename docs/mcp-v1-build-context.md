# Image Ops MCP V1 Build Context

Updated: 2026-02-23  
Status: Proposed (build-ready)

## Decision
Adopt MCP as a constrained orchestration layer beside the main product runtime, not as a replacement for core upload/process/download logic.

## V1 Exposed Operations
- `uploads_init` -> `POST /api/uploads/init`
- `jobs_create` -> `POST /api/jobs`
- `jobs_get` -> `GET /api/jobs/{id}`
- `cleanup_create` -> `POST /api/cleanup`
- `quota_get` -> `GET /api/quota`

## MCP Surface
- `search`: discover the reduced, approved operation list.
- `execute`: run constrained operation sequences through approved wrappers only.

## Required Controls
- JWT validation (issuer, audience, expiration).
- Scope checks per operation.
- Endpoint and host allowlists.
- Rate limits by actor/token.
- Idempotency key requirement for mutating steps.
- Structured audit logs with token/URL redaction.
- Execute kill switch.

## Scope Mapping
- `uploads_init` -> `image.upload`
- `jobs_create` -> `image.jobs.write`
- `jobs_get` -> `image.jobs.read`
- `cleanup_create` -> `image.cleanup`
- `quota_get` -> `image.quota.read`

## Privacy Alignment
- No image bytes in MCP logs or state.
- Signed URLs/tokens redacted from logs.
- Existing cleanup + TTL behavior remains authoritative.
- Metadata-only audit events.

## Rollout
1. Staging pilot with read-heavy operations first.
2. Controlled write operations after policy tests.
3. Production canary with rollback flags and runbooks.

## Acceptance Gates
- Reduced OpenAPI spec present and validated.
- Only `search` and `execute` exposed by MCP gateway.
- Sandbox/policy tests pass.
- Scope mapping tests pass.
- Audit redaction checks pass.
- Staging E2E pass for upload-init -> create-job -> poll -> cleanup.
