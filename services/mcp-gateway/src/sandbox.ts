import { config } from './config';
import type { ExecuteRequest } from './types';

const FORBIDDEN_PATTERNS = [
  /from\s+["']fs["']/,
  /from\s+["']child_process["']/,
  /require\(["']fs["']\)/,
  /require\(["']child_process["']\)/,
  /process\.env/,
  /fetch\(/,
  /XMLHttpRequest/,
];

export function assertSandboxPolicy(input: ExecuteRequest): void {
  if (input.code) {
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.test(input.code)) {
        throw new Error('Execute code violates sandbox policy.');
      }
    }

    // V1 keeps execution deterministic through approved wrappers.
    throw new Error('Raw code execution is disabled in V1. Use approved operation steps.');
  }

  if (input.steps.length > config.maxCallsPerExecute) {
    throw new Error(`Execute exceeds max calls per execution (${config.maxCallsPerExecute}).`);
  }
}
