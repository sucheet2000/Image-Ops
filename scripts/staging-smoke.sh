#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${STAGING_API_BASE_URL:-}" ]]; then
  echo "STAGING_API_BASE_URL is required (example: https://api-staging.example.com)"
  exit 1
fi

BASE_URL="${STAGING_API_BASE_URL%/}"
CURL_LONG=(--connect-timeout 5 --max-time 30)
CURL_POLL=(--connect-timeout 5 --max-time 10)

curl_with_optional_auth() {
  if [[ -n "${API_BEARER_TOKEN:-}" ]]; then
    curl "$@" -H "authorization: Bearer ${API_BEARER_TOKEN}"
    return
  fi

  curl "$@"
}

echo "==> health check"
curl -fsS "${CURL_LONG[@]}" "${BASE_URL}/health" >/dev/null

SUBJECT_ID="staging_smoke_$(date +%Y%m%d%H%M%S)_$$"
TMP_PNG="$(mktemp /tmp/image-ops-smoke-XXXXXX.png)"
TMP_JOB="$(mktemp /tmp/image-ops-smoke-job-XXXXXX.json)"
TMP_CLEANUP="$(mktemp /tmp/image-ops-smoke-cleanup-XXXXXX.json)"
trap 'rm -f "${TMP_PNG}" "${TMP_JOB}" "${TMP_CLEANUP}"' EXIT
printf '%s' "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2p6i8AAAAASUVORK5CYII=" | base64 -d >"${TMP_PNG}"
PNG_SIZE="$(wc -c <"${TMP_PNG}" | tr -d ' ')"

echo "==> init upload"
UPLOAD_INIT_RESPONSE="$(curl -fsS "${CURL_LONG[@]}" -X POST "${BASE_URL}/api/uploads/init" \
  -H "content-type: application/json" \
  -d "{\"subjectId\":\"${SUBJECT_ID}\",\"tool\":\"resize\",\"filename\":\"smoke.png\",\"mime\":\"image/png\",\"size\":${PNG_SIZE}}")"

OBJECT_KEY="$(node -e 'const v=JSON.parse(process.argv[1]);process.stdout.write(v.objectKey||"")' "${UPLOAD_INIT_RESPONSE}")"
UPLOAD_URL="$(node -e 'const v=JSON.parse(process.argv[1]);process.stdout.write(v.uploadUrl||"")' "${UPLOAD_INIT_RESPONSE}")"
if [[ -z "${OBJECT_KEY}" || -z "${UPLOAD_URL}" ]]; then
  echo "upload init did not return objectKey/uploadUrl"
  exit 1
fi

echo "==> upload object"
UPLOAD_STATUS="$(curl -sS "${CURL_LONG[@]}" -o /dev/null -w "%{http_code}" -X PUT "${UPLOAD_URL}" \
  -H "content-type: image/png" \
  --data-binary @"${TMP_PNG}")"
if [[ "${UPLOAD_STATUS}" != "200" && "${UPLOAD_STATUS}" != "204" ]]; then
  echo "unexpected upload status: ${UPLOAD_STATUS}"
  exit 1
fi

echo "==> complete upload"
curl_with_optional_auth -fsS "${CURL_LONG[@]}" -X POST "${BASE_URL}/api/uploads/complete" \
  -H "content-type: application/json" \
  -d "{\"subjectId\":\"${SUBJECT_ID}\",\"objectKey\":\"${OBJECT_KEY}\"}" >/dev/null

echo "==> create job (requires auth when API_AUTH_REQUIRED=true)"
CREATE_JOB_STATUS="$(curl_with_optional_auth -sS "${CURL_LONG[@]}" -o "${TMP_JOB}" -w "%{http_code}" -X POST "${BASE_URL}/api/jobs" \
  -H "content-type: application/json" \
  -d "{\"subjectId\":\"${SUBJECT_ID}\",\"plan\":\"free\",\"tool\":\"resize\",\"inputObjectKey\":\"${OBJECT_KEY}\",\"options\":{\"width\":1,\"height\":1}}")"

if [[ "${CREATE_JOB_STATUS}" == "401" ]]; then
  echo "jobs endpoint is auth-protected; set API_BEARER_TOKEN and rerun for full smoke"
  echo "partial smoke passed: health + upload init/put/complete"
  exit 0
fi

if [[ "${CREATE_JOB_STATUS}" != "201" ]]; then
  echo "unexpected job create status: ${CREATE_JOB_STATUS}"
  cat "${TMP_JOB}" || true
  exit 1
fi

JOB_ID="$(node -e 'const v=require("fs").readFileSync(process.argv[1],"utf8");const p=JSON.parse(v);process.stdout.write(p.id||"")' "${TMP_JOB}")"
if [[ -z "${JOB_ID}" ]]; then
  echo "job create did not return job id"
  exit 1
fi

echo "==> poll job status"
DEADLINE=$(( $(date +%s) + 45 ))
OUTPUT_KEY=""
DOWNLOAD_URL=""
while [[ "$(date +%s)" -lt "${DEADLINE}" ]]; do
  STATUS_JSON="$(curl_with_optional_auth -fsS "${CURL_POLL[@]}" -X GET "${BASE_URL}/api/jobs/${JOB_ID}")"
  STATUS_VALUE="$(node -e 'const v=JSON.parse(process.argv[1]);process.stdout.write(v.status||"")' "${STATUS_JSON}")"
  if [[ "${STATUS_VALUE}" == "done" ]]; then
    OUTPUT_KEY="$(node -e 'const v=JSON.parse(process.argv[1]);process.stdout.write(v.outputObjectKey||"")' "${STATUS_JSON}")"
    DOWNLOAD_URL="$(node -e 'const v=JSON.parse(process.argv[1]);process.stdout.write(v.downloadUrl||"")' "${STATUS_JSON}")"
    break
  fi
  if [[ "${STATUS_VALUE}" == "failed" ]]; then
    echo "job failed"
    echo "${STATUS_JSON}"
    exit 1
  fi
  sleep 1
done

if [[ -z "${OUTPUT_KEY}" || -z "${DOWNLOAD_URL}" ]]; then
  echo "job did not complete before timeout"
  exit 1
fi

echo "==> verify download"
curl -fsS "${CURL_LONG[@]}" "${DOWNLOAD_URL}" >/dev/null

echo "==> cleanup"
CLEANUP_STATUS="$(curl_with_optional_auth -sS "${CURL_LONG[@]}" -o "${TMP_CLEANUP}" -w "%{http_code}" -X POST "${BASE_URL}/api/cleanup" \
  -H "content-type: application/json" \
  -H "idempotency-key: staging-smoke-${SUBJECT_ID}" \
  -d "{\"objectKeys\":[\"${OBJECT_KEY}\",\"${OUTPUT_KEY}\"],\"reason\":\"manual\"}")"
if [[ "${CLEANUP_STATUS}" != "202" ]]; then
  echo "unexpected cleanup status: ${CLEANUP_STATUS}"
  cat "${TMP_CLEANUP}" || true
  exit 1
fi

echo "staging smoke passed"
