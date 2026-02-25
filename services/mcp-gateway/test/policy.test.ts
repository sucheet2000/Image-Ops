import { describe, expect, it } from 'vitest';
import { validateExecuteRequest } from '../src/policy';

describe('validateExecuteRequest', () => {
  it('accepts valid read-only request', () => {
    expect(() => {
      validateExecuteRequest({
        steps: [{ operationId: 'jobs_get', params: { id: 'job_1' } }],
      });
    }).not.toThrow();
  });

  it('requires idempotency key for mutating operations', () => {
    expect(() => {
      validateExecuteRequest({
        steps: [{ operationId: 'jobs_create', params: { tool: 'resize' } }],
      });
    }).toThrow('idempotency key');
  });

  it('rejects unknown operations', () => {
    expect(() => {
      validateExecuteRequest({
        steps: [{ operationId: 'billing_admin_delete_all' }],
      });
    }).toThrow('Operation not allowed');
  });
});
