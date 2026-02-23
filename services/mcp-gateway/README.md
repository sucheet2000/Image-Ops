# MCP Gateway (V1)

Constrained gateway for operation discovery and orchestration.

## Exposed Endpoints
- `GET /mcp/search`
- `POST /mcp/execute`

## Guardrails
- Reduced operation allowlist from `openapi/reduced.v1.yaml`
- JWT auth with issuer/audience checks
- Scope checks per operation
- Host allowlist for downstream API base URL
- Rate limiting
- Max calls per execute
- Idempotency requirement for mutating executions
- Structured redacted audit logs
- Kill switch via `MCP_EXECUTE_ENABLED=false`
- Raw `code` execution disabled in V1; only approved operation steps are allowed.

## Run
```bash
npm run dev -w services/mcp-gateway
```
