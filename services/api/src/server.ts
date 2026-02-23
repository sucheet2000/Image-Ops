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

function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  const message = error instanceof Error ? error.message : "Internal server error";
  logError("api.error", { message });
  res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message });
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
  const app = createApiApp({ config });
  app.listen(config.port, () => {
    logInfo("api.started", { port: config.port });
  });
}
