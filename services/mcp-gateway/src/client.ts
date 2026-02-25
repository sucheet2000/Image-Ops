import { config } from './config';
import { OPERATION_BY_ID } from './operations';
import type { ExecuteResult, ExecuteStep } from './types';

type ExecuteContext = {
  token: string;
  idempotencyKey?: string;
  timeoutMs: number;
};

function withPathParams(route: string, params: Record<string, unknown>): string {
  return route.replace('{id}', encodeURIComponent(String(params.id || '')));
}

function toQueryString(operationId: string, params: Record<string, unknown>): string {
  if (operationId !== 'quota_get') {
    return '';
  }

  const subjectId = String(params.subjectId || '');
  return subjectId ? `?subjectId=${encodeURIComponent(subjectId)}` : '';
}

export async function executeStep(step: ExecuteStep, ctx: ExecuteContext): Promise<ExecuteResult> {
  const operation = OPERATION_BY_ID.get(step.operationId);
  if (!operation) {
    throw new Error(`Operation not allowed: ${step.operationId}`);
  }

  const params = step.params || {};
  const route = withPathParams(operation.route, params) + toQueryString(step.operationId, params);
  const url = `${config.apiBaseUrl}${route}`;

  const headers: Record<string, string> = {
    authorization: `Bearer ${ctx.token}`,
    'content-type': 'application/json',
  };

  if (ctx.idempotencyKey && operation.mutating) {
    headers['idempotency-key'] = ctx.idempotencyKey;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ctx.timeoutMs);

  try {
    const response = await fetch(url, {
      method: operation.method,
      headers,
      body: operation.method === 'POST' ? JSON.stringify(params) : undefined,
      signal: controller.signal,
    });

    let body: unknown = null;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      body = await response.json();
    } else {
      body = await response.text();
    }

    return {
      operationId: operation.operationId,
      status: response.status,
      body,
    };
  } finally {
    clearTimeout(timeout);
  }
}
