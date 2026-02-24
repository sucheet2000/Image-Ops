# Observability and Alerting

This project exports Prometheus-style metrics from the API at `/metrics`.

## Key Metrics

- `image_ops_http_requests_total{method,path,status_code}`
- `image_ops_http_request_duration_seconds_total{method,path,status_code}`
- `image_ops_http_in_flight_requests`
- `image_ops_queue_jobs{state="waiting|active|completed|failed|delayed"}`

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
