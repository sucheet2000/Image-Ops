import cors from "cors";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import { loadApiConfig, type ApiConfig } from "./config";
import { logError, logInfo } from "./lib/log";
import { registerCleanupRoutes } from "./routes/cleanup";
import { registerJobsRoutes } from "./routes/jobs";
import { registerQuotaRoutes } from "./routes/quota";
import { registerUploadsRoutes } from "./routes/uploads";
import { RedisJobRepository, type JobRepository } from "./services/job-repo";
import { BullMqJobQueueService, type JobQueueService } from "./services/queue";
import { S3ObjectStorageService, type ObjectStorageService } from "./services/storage";

export type ApiDependencies = {
  config: ApiConfig;
  storage: ObjectStorageService;
  queue: JobQueueService;
  jobRepo: JobRepository;
  now: () => Date;
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

export function createApiApp(incomingDeps?: Partial<ApiDependencies>) {
  const config = incomingDeps?.config || loadApiConfig();
  const deps: ApiDependencies = {
    config,
    storage: incomingDeps?.storage || new S3ObjectStorageService(config),
    queue: incomingDeps?.queue || new BullMqJobQueueService({ queueName: config.queueName, redisUrl: config.redisUrl }),
    jobRepo: incomingDeps?.jobRepo || new RedisJobRepository({ redisUrl: config.redisUrl }),
    now: incomingDeps?.now || (() => new Date())
  };

  const app = express();
  app.use(cors({ origin: deps.config.webOrigin }));
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  registerUploadsRoutes(app, { config: deps.config, storage: deps.storage, now: deps.now });
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
  return app;
}

if (require.main === module) {
  const config = loadApiConfig();
  const queue = new BullMqJobQueueService({ queueName: config.queueName, redisUrl: config.redisUrl });
  const app = createApiApp({ config, queue });
  const server = app.listen(config.port, () => {
    logInfo("api.started", { port: config.port });
  });

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logInfo("api.stopping", { signal });

    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });

    await queue.close();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}
