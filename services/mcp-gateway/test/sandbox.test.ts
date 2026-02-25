import { describe, expect, it } from 'vitest';
import { assertSandboxPolicy } from '../src/sandbox';

describe('sandbox policy', () => {
  it('allows execute requests with operation steps and no code', () => {
    expect(() => {
      assertSandboxPolicy({
        steps: [{ operationId: 'jobs_get', params: { id: 'job-1' } }],
      });
    }).not.toThrow();
  });

  it('blocks raw code execution in v1', () => {
    expect(() => {
      assertSandboxPolicy({
        steps: [{ operationId: 'jobs_get', params: { id: 'job-1' } }],
        code: "console.log('test')",
      });
    }).toThrow('Raw code execution is disabled');
  });

  it('blocks forbidden imports', () => {
    expect(() => {
      assertSandboxPolicy({
        steps: [{ operationId: 'jobs_get', params: { id: 'job-1' } }],
        code: "import fs from 'fs'",
      });
    }).toThrow('violates sandbox policy');
  });
});
