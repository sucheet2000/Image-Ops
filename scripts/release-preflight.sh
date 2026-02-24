#!/usr/bin/env bash
set -euo pipefail

RELEASE_ENV="${RELEASE_ENV:-staging}"
if [[ "${RELEASE_ENV}" != "staging" && "${RELEASE_ENV}" != "production" ]]; then
  echo "RELEASE_ENV must be 'staging' or 'production' (received: ${RELEASE_ENV})"
  exit 1
fi

missing=()
warnings=()

require_var() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    missing+=("${name}")
  fi
}

warn() {
  warnings+=("$1")
}

for key in \
  WEB_ORIGIN \
  API_AUTH_REQUIRED \
  AUTH_TOKEN_SECRET \
  GOOGLE_CLIENT_ID \
  JOB_REPO_DRIVER \
  REDIS_URL \
  S3_REGION \
  S3_BUCKET \
  S3_ACCESS_KEY \
  S3_SECRET_KEY \
  BILLING_PROVIDER \
  BILLING_PUBLIC_BASE_URL
do
  require_var "${key}"
done

if [[ "${JOB_REPO_DRIVER:-}" == "postgres" ]]; then
  require_var "POSTGRES_URL"
fi

if [[ "${BILLING_PROVIDER:-}" == "stripe" ]]; then
  for key in STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET STRIPE_PRICE_ID_PRO STRIPE_PRICE_ID_TEAM; do
    require_var "${key}"
  done
else
  for key in BILLING_PROVIDER_SECRET BILLING_WEBHOOK_SECRET; do
    require_var "${key}"
  done
fi

if [[ "${AUTH_REFRESH_COOKIE_SAMESITE:-lax}" == "none" && "${AUTH_REFRESH_COOKIE_SECURE:-false}" != "true" ]]; then
  missing+=("AUTH_REFRESH_COOKIE_SECURE=true (required when AUTH_REFRESH_COOKIE_SAMESITE=none)")
fi

if [[ "${RELEASE_ENV}" == "production" ]]; then
  if [[ "${WEB_ORIGIN:-}" == "http://localhost:3000" || "${WEB_ORIGIN:-}" == "http://127.0.0.1:3000" ]]; then
    missing+=("WEB_ORIGIN must be a real production origin")
  fi
  if [[ "${AUTH_REFRESH_COOKIE_SECURE:-false}" != "true" ]]; then
    missing+=("AUTH_REFRESH_COOKIE_SECURE=true")
  fi
  if [[ "${API_AUTH_REQUIRED:-false}" != "true" ]]; then
    missing+=("API_AUTH_REQUIRED=true")
  fi
fi

if [[ "${S3_ENDPOINT:-}" == "" ]]; then
  warn "S3_ENDPOINT is empty; this is valid for AWS S3 but ensure VPC/network routing is correct."
fi

if [[ "${#missing[@]}" -gt 0 ]]; then
  echo "Release preflight failed (${RELEASE_ENV}). Missing/invalid settings:"
  for item in "${missing[@]}"; do
    echo " - ${item}"
  done
  exit 1
fi

echo "Release preflight passed (${RELEASE_ENV})."
if [[ "${#warnings[@]}" -gt 0 ]]; then
  echo "Warnings:"
  for item in "${warnings[@]}"; do
    echo " - ${item}"
  done
fi
