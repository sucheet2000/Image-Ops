import cors from "cors";
import express from "express";
import type { Express, NextFunction, Request, Response } from "express";
import { loadApiConfig, type ApiConfig } from "./config";
import { logError, logInfo } from "./lib/log";
import { registerAuthRoutes } from "./routes/auth";
import { registerBillingRoutes } from "./routes/billing";
import { registerCleanupRoutes } from "./routes/cleanup";
import { registerJobsRoutes } from "./routes/jobs";
import { registerQuotaRoutes } from "./routes/quota";
import { registerUploadsRoutes } from "./routes/uploads";
import { HmacBillingService, type BillingService } from "./services/billing";
import { createJobRepository, type JobRepository } from "./services/job-repo";
import { BullMqJobQueueService, type JobQueueService } from "./services/queue";
import { S3ObjectStorageService, type ObjectStorageService } from "./services/storage";

export type ApiDependencies = {
  config: ApiConfig;
  storage: ObjectStorageService;
  queue: JobQueueService;
  jobRepo: JobRepository;
  billing: BillingService;
  now: () => Date;
};

export type ApiRuntime = {
  app: Express;
  deps: ApiDependencies;
};

const INTERNAL_ERROR_MESSAGE = "An unexpected error occurred.";

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
    billing: incomingDeps?.billing || new HmacBillingService({
      publicBaseUrl: config.billingPublicBaseUrl,
      providerSecret: config.billingProviderSecret,
      webhookSecret: config.billingWebhookSecret
    }),
    now: incomingDeps?.now || (() => new Date())
  };

  const app = express();
  app.use(cors({ origin: deps.config.webOrigin }));
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  registerUploadsRoutes(app, { config: deps.config, storage: deps.storage, now: deps.now });
  registerAuthRoutes(app, { jobRepo: deps.jobRepo, now: deps.now });
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
