# Agent Ownership: Worker Processing Pipeline

Branch: `codex/agent-worker-pipeline`

## Scope
- Implement BullMQ worker with sharp transforms.
- Implement tool modules: resize/compress/convert/background-remove/watermark.
- Ensure lifecycle transitions queued -> running -> done/failed.

## Owned Areas
- `services/worker/src/worker.ts`
- `services/worker/src/processor.ts`
- `services/worker/src/tools/*`
- `services/worker/src/providers/*`
- `services/worker/src/services/storage.ts`
- `services/worker/src/services/job-repo.ts`
- `services/worker/test/*`

## Acceptance Checks
1. Worker processes real image bytes with sharp.
2. Watermark applies only when advanced + free.
3. Provider retry/timeout logic covered by tests.
4. Failure classification updates job status with code/message.

## Out of Scope
- API route restructuring.
- Postgres repository migration.
