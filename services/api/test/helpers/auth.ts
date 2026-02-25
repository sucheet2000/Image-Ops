import type { ImagePlan } from '@imageops/core';
import { InMemoryAuthService } from '../../src/services/auth';
import { createTestConfig } from './fakes';

export function bearerAuthHeaders(
  subjectId: string,
  plan: ImagePlan = 'free'
): Record<string, string> {
  const auth = new InMemoryAuthService(createTestConfig().authTokenSecret);
  const token = auth.issueApiToken({
    sub: subjectId,
    plan,
    now: new Date(),
  });

  return {
    authorization: `Bearer ${token}`,
  };
}
