import { config } from './config';
import { executeStep } from './client';
import type { ExecuteRequest, ExecuteResult } from './types';

export async function executePlan(
  input: ExecuteRequest,
  authToken: string,
  allowedScopes: Set<string>
): Promise<ExecuteResult[]> {
  const results: ExecuteResult[] = [];

  for (const step of input.steps) {
    const operationScope = scopeFor(step.operationId);
    if (!allowedScopes.has(operationScope)) {
      throw new Error(`Missing scope for operation ${step.operationId}`);
    }

    const result = await executeStep(step, {
      token: authToken,
      idempotencyKey: input.idempotencyKey,
      timeoutMs: config.executeTimeoutMs,
    });

    results.push(result);
  }

  return results;
}

function scopeFor(operationId: string): string {
  switch (operationId) {
    case 'uploads_init':
      return 'image.upload';
    case 'jobs_create':
      return 'image.jobs.write';
    case 'jobs_get':
      return 'image.jobs.read';
    case 'cleanup_create':
      return 'image.cleanup';
    case 'quota_get':
      return 'image.quota.read';
    default:
      throw new Error(`No scope mapping for operation ${operationId}`);
  }
}
