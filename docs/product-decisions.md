# Product Decisions (V1 Lock)

Date: 2026-02-24

## Locked Defaults

1. Ad network: Google AdSense (`NEXT_PUBLIC_AD_NETWORK=adsense`)
2. Background removal provider: HTTP provider (`BG_REMOVE_PROVIDER=http`) with retry/backoff enabled
3. Free plan quota: 6 images per rolling 10 hours
4. Paid plan targets:
   - PRO: 2,000 images/month (policy target)
   - TEAM: 10,000 images/month (policy target)
   - Runtime defaults (enforced): PRO 250 images / 24 hours, TEAM 1000 images / 24 hours
5. Consent model: explicit opt-in banner; ads only render after user acceptance

## Notes

- Quota enforcement in runtime is plan-aware via env policy (`FREE_*`, `PRO_*`, `TEAM_*` limits and windows). Paid monthly allowance tracking remains a policy target and should be added as a dedicated quota table/periodic reset flow if strict monthly enforcement is required.
- Background removal provider can be switched to a managed vendor later by changing worker provider configuration without changing API contracts.
