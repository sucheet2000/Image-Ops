import { config } from './config';
import { OPERATION_BY_ID } from './operations';
import type { ExecuteRequest } from './types';

export function assertAllowedHost(baseUrl: string): void {
  const host = new URL(baseUrl).hostname;
  if (!config.allowedHosts.includes(host)) {
    throw new Error('Configured API host is not in MCP allowlist.');
  }
}

export function validateExecuteRequest(input: ExecuteRequest): void {
  if (!Array.isArray(input.steps) || input.steps.length === 0) {
    throw new Error('Execute requires at least one step.');
  }

  for (const step of input.steps) {
    if (!OPERATION_BY_ID.has(step.operationId)) {
      throw new Error(`Operation not allowed: ${step.operationId}`);
    }
  }

  const hasMutation = input.steps.some((step) => OPERATION_BY_ID.get(step.operationId)?.mutating);
  if (hasMutation && !input.idempotencyKey) {
    throw new Error('Mutating executions require an idempotency key.');
  }
}
