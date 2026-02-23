# Code-Mode MCP for Image Ops: Product Build Context

Updated: 2026-02-23
Status: Proposed (build-ready context)

## 1) Why this exists

Our Image Ops product already has a clear core architecture:
- Next.js frontend
- Node/TypeScript API
- Worker-based image processing
- Queue + temp object storage + Postgres metadata

Code-Mode MCP is not a replacement for that stack. It is an agent integration layer that lets an AI assistant safely discover and orchestrate existing API operations using:
- `search` (find capabilities)
- `execute` (run constrained code against approved endpoints)

This gives us an assistant-friendly control plane without exposing hundreds of fixed MCP tools.

## 2) Product decision (high level)

Use Code-Mode MCP for:
- Internal operations copilot (support/ops workflows)
- Future guided assistant UX for multi-step tasks

Do not use Code-Mode MCP for:
- Core upload/process/download runtime path
- Replacing backend business logic

The main app continues to serve end users directly. MCP sits beside it for agent orchestration.

## 3) Concrete V1 scope for Image Ops

Expose only these existing API capabilities through MCP:
- `POST /api/uploads/init` (`uploads_init`)
- `POST /api/jobs` (`jobs_create`)
- `GET /api/jobs/{id}` (`jobs_get`)
- `POST /api/cleanup` (`cleanup_create`)
- `GET /api/quota` (`quota_get`)

Keep out of MCP V1:
- Billing webhooks and sensitive admin routes
- Direct DB access
- Raw object-store operations

## 4) How the MCP layer should work

### 4.1 `search`

`search` returns a compact list of supported operations from a reduced OpenAPI index:
- operation ID
- HTTP method
- route
- short summary
- key input fields

Design target: keep context small and predictable so model tokens are spent on task execution, not massive tool schemas.

### 4.2 `execute`

`execute` runs model-generated TypeScript in a sandbox with hard limits:
- time limit per execution
- max API calls per execution
- allowed host list (staging API domain only during pilot)
- blocked modules/actions (`fs`, `child_process`, shell, arbitrary outbound network)

`execute` should only call approved API wrappers generated from the reduced OpenAPI surface.

## 5) Security and trust boundaries

Treat model-generated code as untrusted input.

Required controls:
- OAuth/JWT validation (issuer, audience, expiration)
- Per-operation scope checks
- Endpoint allowlist enforcement
- Rate limiting by token/client
- Idempotency keys for cleanup/mutations
- Structured audit logs with secret redaction
- Kill switch to disable `execute` quickly

Minimum scope mapping:
- `uploads_init` -> `image.upload`
- `jobs_create` -> `image.jobs.write`
- `jobs_get` -> `image.jobs.read`
- `cleanup_create` -> `image.cleanup`
- `quota_get` -> `image.quota.read`

## 6) Privacy alignment with product promise

Our product promise is temporary processing + automatic deletion. MCP must not weaken this.

MCP requirements:
- No image bytes stored in MCP logs/state
- Redact signed URLs/tokens from logs
- Preserve existing cleanup and TTL semantics
- Audit events capture metadata only (operation, status, timing, actor)

## 7) Recommended rollout

### Phase 1: Staging-only internal pilot
- Enable `search` + `execute` for engineering/support users
- Start with read-heavy paths (`jobs_get`, `quota_get`)
- Add write operations after policy tests pass

### Phase 2: Controlled write access
- Add `uploads_init`, `jobs_create`, `cleanup_create`
- Enforce tighter rate and call-count caps
- Monitor blocked-attempt metrics and auth failures

### Phase 3: Production canary
- Small percent of traffic/users
- Instant rollback path (feature flag + route disable)
- Incident playbook ready before expansion

## 8) Non-negotiable acceptance criteria before prod

- Reduced OpenAPI spec exists and is lint-clean
- MCP exposes only `search` and `execute`
- Sandbox policy tests pass (host restriction, module denylist, timeout)
- OAuth scope tests pass for every operation
- Audit/redaction checks pass
- Staging E2E succeeds for create-job and poll-job flow
- Security signoff recorded

## 9) What to build first (practical starter set)

1. Reduced OpenAPI file for the five V1 endpoints
2. MCP gateway skeleton with `search` + `execute`
3. Sandbox policy engine and auth middleware
4. Audit + metrics wiring
5. Staging E2E scenario:
   - search for create job
   - execute upload-init -> create-job -> poll-status
   - execute cleanup with idempotency key

## 10) Risks and mitigations

Risk: model tries unauthorized endpoint/host.
Mitigation: static and runtime allowlist checks; deny by default.

Risk: prompt injection attempts in assistant flows.
Mitigation: no raw network/tool access beyond approved wrappers.

Risk: accidental quota/cleanup abuse.
Mitigation: scoped auth, per-run call caps, per-token rate limits, replay protection.

Risk: operational complexity.
Mitigation: keep V1 narrow; do not move core business logic into MCP.

## 11) Build-time guardrails for the team

- Keep MCP surface intentionally small.
- Add endpoint-by-endpoint only with explicit product/security review.
- Preserve existing API contracts; MCP should consume, not redefine, core business behavior.
- Prefer deterministic wrappers over open-ended execution capabilities.
- Instrument first, scale second.

## 12) Short decision statement to carry forward

We will adopt Code-Mode MCP as a constrained orchestration layer for Image Ops, starting with staging and a minimal API surface. We will keep the core image-processing product path unchanged, enforce strict sandbox/auth boundaries, and expand only after measurable reliability and security gates pass.
