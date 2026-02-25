import { JOB_QUEUE_NAMES, type ImageJobQueuePayload } from "@imageops/core";
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
const WORKER_ID = process.env.HOSTNAME ?? `worker-${process.pid}`;
const HEARTBEAT_TTL_SECONDS = 90;

const storage = new S3WorkerStorageService(config);
const jobRepo: WorkerJobRepository = config.jobRepoDriver === "postgres"
  ? new PostgresWorkerJobRepository({ connectionString: config.postgresUrl! })
  : new RedisWorkerJobRepository({ redisUrl: config.redisUrl });
const bgRemoveProvider = new HttpBackgroundRemoveProvider({
  endpointUrl: config.bgRemoveApiUrl,
  apiKey: config.bgRemoveApiKey,
  timeoutMs: config.bgRemoveTimeoutMs,
  maxRetries: config.bgRemoveMaxRetries,
  onCircuitStateChange: (state) => {
    const event = `worker.bg_remove_breaker.${state}`;
    if (state === "open") {
      // eslint-disable-next-line no-console
      console.error(JSON.stringify({ event, workerId: WORKER_ID }));
      return;
    }
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ event, workerId: WORKER_ID }));
  }
});

const workerDefinitions = [
  { queueName: JOB_QUEUE_NAMES.fast, concurrency: config.fastConcurrency },
  { queueName: JOB_QUEUE_NAMES.slow, concurrency: config.slowConcurrency },
  { queueName: JOB_QUEUE_NAMES.bulk, concurrency: config.bulkConcurrency }
] as const;

const workers = workerDefinitions.map(({ queueName, concurrency }) =>
  new Worker<ImageJobQueuePayload>(
    queueName,
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
      concurrency
    }
  )
);

workers.forEach((worker, index) => {
  const { queueName, concurrency } = workerDefinitions[index];
  worker.on("ready", () => {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ event: "worker.ready", workerId: WORKER_ID, queue: queueName, concurrency }));
  });

  worker.on("completed", (job) => {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ event: "worker.completed", workerId: WORKER_ID, queue: queueName, jobId: job.id }));
  });

  worker.on("failed", (job, error) => {
    // eslint-disable-next-line no-console
    console.error(
      JSON.stringify({
        event: "worker.failed",
        workerId: WORKER_ID,
        queue: queueName,
        jobId: job?.id,
        tool: job?.data?.tool,
        subjectId: job?.data?.subjectId,
        attempts: job?.attemptsMade,
        message: error.message
      })
    );
  });
});

const stopHeartbeat = startWorkerHeartbeat({
  redis: connection,
  workerId: WORKER_ID,
  queueName: "multi",
  intervalMs: config.workerHeartbeatIntervalMs,
  ttlSeconds: HEARTBEAT_TTL_SECONDS,
  onHeartbeat: (payload) => {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(payload));
  }
});

async function closeWorkers(): Promise<void> {
  await Promise.all(workers.map((worker) => worker.close()));
}

void (async () => {
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      event: "worker.boot",
      workerId: WORKER_ID,
      queues: workerDefinitions.map((entry) => ({ queue: entry.queueName, concurrency: entry.concurrency }))
    })
  );
})();

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

let shuttingDown = false;

async function shutdown(reason: string, exitCode: number, error?: unknown): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ event: "worker.shutdown.start", workerId: WORKER_ID, reason }));

  if (error) {
    // eslint-disable-next-line no-console
    console.error(
      JSON.stringify({
        event: "worker.shutdown.error_context",
        workerId: WORKER_ID,
        reason,
        message: error instanceof Error ? error.message : String(error)
      })
    );
  }

  try {
    stopHeartbeat();
    await withShutdownTimeout(closeWorkers(), "workers.close");
    await withShutdownTimeout(jobRepo.close(), "jobRepo.close");
    await withShutdownTimeout(connection.quit(), "connection.quit");
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ event: "worker.shutdown.complete", workerId: WORKER_ID, reason }));
  } catch (closeError) {
    // eslint-disable-next-line no-console
    console.error(
      JSON.stringify({
        event: "worker.shutdown.failed",
        workerId: WORKER_ID,
        reason,
        message: closeError instanceof Error ? closeError.message : String(closeError)
      })
    );
    // eslint-disable-next-line no-console
    console.error(
      JSON.stringify({
        event: "worker.shutdown.force_exit",
        workerId: WORKER_ID,
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
