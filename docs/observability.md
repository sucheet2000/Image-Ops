# Observability and Alerting

This project exports Prometheus-style metrics from the API at `/metrics`.
It also exposes an owner-facing log stream endpoint at `/api/observability/logs` for dashboard "Watch Tower" views.

## Key Metrics

- `image_ops_http_requests_total{method,path,status_code}`
- `image_ops_http_request_duration_seconds_total{method,path,status_code}` (counter of cumulative request duration)
- `image_ops_http_in_flight_requests`
- `image_ops_queue_jobs{state="waiting|active|completed|failed|delayed"}`

## Watch Tower Logs API

- Endpoint: `GET /api/observability/logs`
- Query params:
  - `limit` (1-500, default `200`)
  - `level` (`all|info|error`, default `all`)
  - `event` (optional event-name contains filter)
- Response includes:
  - `summary` counts (`total`, `info`, `error`, `returned`)
  - `logs` array ordered newest-first with `id`, `ts`, `level`, `event`, `payload`
  - in-memory retention metadata (`maxEntries`)

Operational behavior:

- Logs are buffered in API memory only (current process, rolling buffer).
- Existing structured-log redaction rules remain in effect because entries come from `toStructuredLog`.
- If `API_AUTH_REQUIRED=true`, `/api/observability/*` routes require valid bearer auth.

## Alert Rules

Alert definitions live at:

- `infra/observability/prometheus-alerts.yml`

Current coverage:

- High average API latency
- Cleanup endpoint error ratio spikes
- Queue waiting depth growth
- Failed job backlog

## Prometheus Scrape Example

```yaml
scrape_configs:
  - job_name: image-ops-api
    static_configs:
      - targets: ["api-hostname:4000"]
    metrics_path: /metrics
```

## Dashboard Starter Panels

Recommended initial Grafana panels:

1. Request throughput: `sum(rate(image_ops_http_requests_total[5m])) by (path, status_code)`
2. Average latency: `sum(rate(image_ops_http_request_duration_seconds_total[5m])) / sum(rate(image_ops_http_requests_total[5m]))`
3. In-flight requests: `image_ops_http_in_flight_requests`
4. Queue depth by state: `image_ops_queue_jobs`

## Operational Notes

- Route labels use resolved route templates where available; unmatched paths are grouped under `path="unmatched"` to avoid high-cardinality metric explosions.
- For multi-instance deployments, aggregate queue metrics at the service level and pair alerts with deployment metadata (`instance`, `pod`, or `node`).
- Request latency is exported as a duration-total counter, so percentile queries (P95/P99) are not currently supported without switching to histogram metrics.
