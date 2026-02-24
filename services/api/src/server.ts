import cors from "cors";
import express from "express";
import type { Express, NextFunction, Request, Response } from "express";
import { loadApiConfig, type ApiConfig } from "./config";
import { requireApiAuth } from "./lib/auth-middleware";
import { logError, logInfo } from "./lib/log";
import { registerAuthRoutes } from "./routes/auth";
import { registerBillingRoutes } from "./routes/billing";
import { registerCleanupRoutes } from "./routes/cleanup";
import { registerJobsRoutes } from "./routes/jobs";
import { registerQuotaRoutes } from "./routes/quota";
import { registerUploadsRoutes } from "./routes/uploads";
import { HmacBillingService, StripeBillingService, type BillingService } from "./services/billing";
import { GoogleTokenAuthService, type AuthService } from "./services/auth";
import { createJobRepository, type JobRepository } from "./services/job-repo";
import { BullMqJobQueueService, type JobQueueService } from "./services/queue";
import { S3ObjectStorageService, TMP_PREFIX, type ObjectStorageService } from "./services/storage";

export type ApiDependencies = {
  config: ApiConfig;
  storage: ObjectStorageService;
  queue: JobQueueService;
  jobRepo: JobRepository;
  billing: BillingService;
  auth: AuthService;
  now: () => Date;
};

export type ApiRuntime = {
  app: Express;
  deps: ApiDependencies;
};

const INTERNAL_ERROR_MESSAGE = "An unexpected error occurred.";
const METRICS_CONTENT_TYPE = "text/plain; version=0.0.4; charset=utf-8";

type ReadyCheck = {
  status: "ok" | "error";
  message?: string;
};

function formatReadinessCheck(result: PromiseSettledResult<unknown>): ReadyCheck {
  if (result.status === "fulfilled") {
    return { status: "ok" };
  }

  const reason = result.reason;
  if (reason instanceof Error) {
    return { status: "error", message: reason.message };
  }

  return { status: "error", message: String(reason) };
}

function escapeMetricLabelValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

function formatErrorForLog(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack
    };
  }

  return { value: error };
}

function createBillingService(config: ApiConfig): BillingService {
  if (config.billingProvider === "stripe") {
    return new StripeBillingService({
      secretKey: config.stripeSecretKey || "",
      webhookSecret: config.stripeWebhookSecret || "",
      webhookToleranceSeconds: config.stripeWebhookToleranceSeconds,
      priceIdByPlan: {
        pro: config.stripePriceIdPro,
        team: config.stripePriceIdTeam
      }
    });
  }

  return new HmacBillingService({
    publicBaseUrl: config.billingPublicBaseUrl,
    providerSecret: config.billingProviderSecret,
    webhookSecret: config.billingWebhookSecret
  });
}

export function errorHandler(error: unknown, _req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    next(error);
    return;
  }

  logError("api.error", { error: formatErrorForLog(error) });
  res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: INTERNAL_ERROR_MESSAGE });
}

export function createApiRuntime(incomingDeps?: Partial<ApiDependencies>): ApiRuntime {
  const config = incomingDeps?.config || loadApiConfig();
  const deps: ApiDependencies = {
    config,
    storage: incomingDeps?.storage || new S3ObjectStorageService(config),
    queue: incomingDeps?.queue || new BullMqJobQueueService({ queueName: config.queueName, redisUrl: config.redisUrl }),
    jobRepo: incomingDeps?.jobRepo || createJobRepository(config),
    billing: incomingDeps?.billing || createBillingService(config),
    auth: incomingDeps?.auth || new GoogleTokenAuthService({
      googleClientId: config.googleClientId,
      authTokenSecret: config.authTokenSecret,
      authTokenTtlSeconds: config.authTokenTtlSeconds
    }),
    now: incomingDeps?.now || (() => new Date())
  };

  if (deps.config.webOrigin === "*" && process.env.NODE_ENV !== "development") {
    throw new Error("WEB_ORIGIN cannot be '*' outside development.");
  }

  const app = express();
  const requestMetrics = new Map<string, { count: number; durationSecondsTotal: number }>();
  const metricsStartMs = Date.now();
  let inflightRequests = 0;

  const observeRequest = (method: string, path: string, statusCode: number, durationSeconds: number): void => {
    const key = `${method}|${path}|${statusCode}`;
    const existing = requestMetrics.get(key) || { count: 0, durationSecondsTotal: 0 };
    existing.count += 1;
    existing.durationSecondsTotal += durationSeconds;
    requestMetrics.set(key, existing);
  };

  const renderMetrics = (): string => {
    const lines: string[] = [];
    lines.push("# HELP image_ops_up Service liveness state.");
    lines.push("# TYPE image_ops_up gauge");
    lines.push("image_ops_up 1");
    lines.push("# HELP image_ops_uptime_seconds Service uptime in seconds.");
    lines.push("# TYPE image_ops_uptime_seconds gauge");
    lines.push(`image_ops_uptime_seconds ${((Date.now() - metricsStartMs) / 1000).toFixed(3)}`);
    lines.push("# HELP image_ops_http_in_flight_requests Current in-flight HTTP requests.");
    lines.push("# TYPE image_ops_http_in_flight_requests gauge");
    lines.push(`image_ops_http_in_flight_requests ${inflightRequests}`);
    lines.push("# HELP image_ops_http_requests_total Total HTTP requests handled.");
    lines.push("# TYPE image_ops_http_requests_total counter");
    lines.push("# HELP image_ops_http_request_duration_seconds_total Total request duration in seconds.");
    lines.push("# TYPE image_ops_http_request_duration_seconds_total counter");

    const sorted = [...requestMetrics.entries()].sort((left, right) => left[0].localeCompare(right[0]));
    for (const [key, value] of sorted) {
      const [method, path, statusCode] = key.split("|");
      const labels = `method="${escapeMetricLabelValue(method)}",path="${escapeMetricLabelValue(path)}",status_code="${escapeMetricLabelValue(statusCode)}"`;
      lines.push(`image_ops_http_requests_total{${labels}} ${value.count}`);
      lines.push(`image_ops_http_request_duration_seconds_total{${labels}} ${value.durationSecondsTotal.toFixed(6)}`);
    }

    return `${lines.join("\n")}\n`;
  };

  app.use(cors({ origin: deps.config.webOrigin, credentials: true }));
  app.use("/api/webhooks/billing", express.raw({ type: "application/json", limit: "1mb" }));
  app.use(express.json({ limit: "1mb" }));
  app.use((req, res, next) => {
    const startedAtNs = process.hrtime.bigint();
    inflightRequests += 1;

    res.on("finish", () => {
      inflightRequests = Math.max(0, inflightRequests - 1);
      if (req.path === "/metrics") {
        return;
      }

      const routePath = typeof (req.route as { path?: string } | undefined)?.path === "string"
        ? String((req.route as { path?: string }).path)
        : "unmatched";
      const durationSeconds = Number(process.hrtime.bigint() - startedAtNs) / 1_000_000_000;
      observeRequest(req.method, routePath, res.statusCode, durationSeconds);
    });

    next();
  });

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/ready", async (_req, res) => {
    const [storageResult, jobRepoResult] = await Promise.allSettled([
      deps.storage.headObject(`${TMP_PREFIX}__ready_probe__`),
      deps.jobRepo.getQuotaWindow("__ready_probe_subject__")
    ]);

    const checks = {
      storage: formatReadinessCheck(storageResult),
      jobRepo: formatReadinessCheck(jobRepoResult)
    };
    const isReady = checks.storage.status === "ok" && checks.jobRepo.status === "ok";

    res.status(isReady ? 200 : 503).json({
      status: isReady ? "ready" : "degraded",
      checks,
      timestamp: deps.now().toISOString()
    });
  });

  app.get("/metrics", (_req, res) => {
    res.setHeader("Content-Type", METRICS_CONTENT_TYPE);
    res.send(renderMetrics());
  });

  if (deps.config.apiAuthRequired) {
    app.use("/api/jobs", requireApiAuth(deps.auth));
    app.use("/api/cleanup", requireApiAuth(deps.auth));
    app.use("/api/quota", requireApiAuth(deps.auth));
    app.use("/api/billing/checkout", requireApiAuth(deps.auth));
    app.use("/api/billing/reconcile", requireApiAuth(deps.auth));
  }

  registerUploadsRoutes(app, { config: deps.config, storage: deps.storage, jobRepo: deps.jobRepo, now: deps.now });
  registerAuthRoutes(app, { config: deps.config, jobRepo: deps.jobRepo, auth: deps.auth, now: deps.now });
  registerBillingRoutes(app, { config: deps.config, jobRepo: deps.jobRepo, billing: deps.billing, now: deps.now });
  registerJobsRoutes(app, {
    config: deps.config,
    storage: deps.storage,
    queue: deps.queue,
    jobRepo: deps.jobRepo,
    now: deps.now
  });
  registerCleanupRoutes(app, {
    config: deps.config,
    storage: deps.storage,
    jobRepo: deps.jobRepo,
    now: deps.now
  });
  registerQuotaRoutes(app, { jobRepo: deps.jobRepo, now: deps.now });

  app.use(errorHandler);
  return { app, deps };
}

export function createApiApp(incomingDeps?: Partial<ApiDependencies>): Express {
  return createApiRuntime(incomingDeps).app;
}

if (require.main === module) {
  const config = loadApiConfig();
  const runtime = createApiRuntime({ config });
  const server = runtime.app.listen(config.port, () => {
    logInfo("api.started", { port: config.port });
  });

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logInfo("api.stopping", { signal });

    let exitCode = 0;
    try {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    } catch (error) {
      exitCode = 1;
      logError("api.shutdown.server_close_failed", { error: formatErrorForLog(error) });
    }

    const dependencyResults = await Promise.allSettled([
      runtime.deps.queue.close(),
      runtime.deps.jobRepo.close(),
      runtime.deps.storage.close()
    ]);
    for (const result of dependencyResults) {
      if (result.status === "rejected") {
        exitCode = 1;
        logError("api.shutdown.dependency_close_failed", { error: formatErrorForLog(result.reason) });
      }
    }

    process.exit(exitCode);
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}
