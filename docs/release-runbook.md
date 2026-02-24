# Release Runbook

## Goal
Ship API + worker safely with fast detection and rollback.

## Preconditions
1. `master` CI green (`test` + `integration`).
2. Release preflight passes:
```bash
npm run preflight:production
```
3. Staging smoke passes:
```bash
STAGING_API_BASE_URL=https://api-staging.example.com \
API_BEARER_TOKEN=<token> \
npm run smoke:staging
```

## Canary Rollout
1. Deploy API + worker with the same release version.
2. Route a small traffic slice (for example 5-10%).
3. Monitor for 10-15 minutes:
   - API 5xx rate
   - worker failed jobs
   - billing webhook failures
   - auth refresh failures
4. Increase traffic only if all checks remain healthy.

## Rollback
1. Roll back API + worker to the previous release together.
2. Re-run smoke against rolled-back environment.
3. Keep rollout paused until root cause is identified and fixed.

## Post-Deploy Verification
1. Run smoke script once more on full traffic.
2. Verify billing webhooks are processing normally.
3. Verify cleanup endpoint and job completion flow for a sample subject.
