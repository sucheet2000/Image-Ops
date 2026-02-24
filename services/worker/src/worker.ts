import type { ImageJobQueuePayload } from "@imageops/core";
import { Worker } from "bullmq";
import IORedis from "ioredis";
import { loadWorkerConfig } from "./config";
import { startWorkerHeartbeat } from "./heartbeat";
import { HttpBackgroundRemoveProvider } from "./providers/bg-remove-provider";
import { processImageJob } from "./processor";
import { PostgresWorkerJobRepository, RedisWorkerJobRepository, type WorkerJobRepository } from "./services/job-repo";
import { S3WorkerStorageService } from "./services/storage";

const config = loadWorkerConfig();
const connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });
const SHUTDOWN_TIMEOUT_MS = Number(process.env.WORKER_SHUTDOWN_TIMEOUT_MS || 10000);

const storage = new S3WorkerStorageService(config);
const jobRepo: WorkerJobRepository = config.jobRepoDriver === "postgres"
  ? new PostgresWorkerJobRepository({ connectionString: config.postgresUrl! })
  : new RedisWorkerJobRepository({ redisUrl: config.redisUrl });
const bgRemoveProvider = new HttpBackgroundRemoveProvider({
  endpointUrl: config.bgRemoveApiUrl,
  apiKey: config.bgRemoveApiKey,
  timeoutMs: config.bgRemoveTimeoutMs,
  maxRetries: config.bgRemoveMaxRetries
});

const worker = new Worker<ImageJobQueuePayload>(
  config.queueName,
  async (job) => {
    await processImageJob(job.data, {
      storage,
      jobRepo,
      bgRemoveProvider,
      now: () => new Date()
    });
  },
  {
    connection,
    concurrency: config.concurrency
  }
);

worker.on("ready", () => {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ event: "worker.ready", queue: config.queueName, concurrency: config.concurrency }));
});

worker.on("completed", (job) => {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ event: "worker.completed", jobId: job.id }));
});

worker.on("failed", (job, error) => {
  // eslint-disable-next-line no-console
  console.error(
    JSON.stringify({
      event: "worker.failed",
      jobId: job?.id,
      message: error.message
    })
  );
});

const stopHeartbeat = startWorkerHeartbeat({
  queueName: config.queueName,
  intervalMs: config.workerHeartbeatIntervalMs,
  onHeartbeat: (payload) => {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(payload));
  }
});

let shuttingDown = false;

async function withShutdownTimeout<T>(promise: Promise<T>, operation: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${operation} timed out after ${SHUTDOWN_TIMEOUT_MS}ms`));
        }, SHUTDOWN_TIMEOUT_MS);
      })
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

async function shutdown(reason: string, exitCode: number, error?: unknown): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ event: "worker.shutdown.start", reason }));

  if (error) {
    // eslint-disable-next-line no-console
    console.error(
      JSON.stringify({
        event: "worker.shutdown.error_context",
        reason,
        message: error instanceof Error ? error.message : String(error)
      })
    );
  }

  try {
    stopHeartbeat();
    await withShutdownTimeout(worker.close(), "worker.close");
    await withShutdownTimeout(jobRepo.close(), "jobRepo.close");
    await withShutdownTimeout(connection.quit(), "connection.quit");
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ event: "worker.shutdown.complete", reason }));
  } catch (closeError) {
    // eslint-disable-next-line no-console
    console.error(
      JSON.stringify({
        event: "worker.shutdown.failed",
        reason,
        message: closeError instanceof Error ? closeError.message : String(closeError)
      })
    );
    // eslint-disable-next-line no-console
    console.error(
      JSON.stringify({
        event: "worker.shutdown.force_exit",
        reason,
        timeoutMs: SHUTDOWN_TIMEOUT_MS
      })
    );

    connection.disconnect(false);
    exitCode = 1;
  }

  process.exit(exitCode);
}

process.on("SIGINT", () => {
  void shutdown("SIGINT", 0);
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM", 0);
});

process.on("uncaughtException", (error) => {
  void shutdown("uncaughtException", 1, error);
});

process.on("unhandledRejection", (reason) => {
  void shutdown("unhandledRejection", 1, reason);
});
