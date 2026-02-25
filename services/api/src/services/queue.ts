import { JOB_QUEUE_NAMES, queueNameForTool, type ImageJobQueuePayload } from "@imageops/core";
import { Queue } from "bullmq";
import IORedis from "ioredis";

export type QueueMetrics = {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
};

export interface JobQueueService {
  enqueue(payload: ImageJobQueuePayload): Promise<void>;
  getMetrics(): Promise<QueueMetrics>;
  close(): Promise<void>;
}

export class BullMqJobQueueService implements JobQueueService {
  private readonly connection: IORedis;
  private readonly queues: Map<string, Queue<ImageJobQueuePayload>>;
  private closePromise: Promise<void> | null = null;

  constructor(input: { redisUrl: string }) {
    this.connection = new IORedis(input.redisUrl, { maxRetriesPerRequest: null });
    this.queues = new Map(
      Object.values(JOB_QUEUE_NAMES).map((queueName) => [
        queueName,
        new Queue<ImageJobQueuePayload>(queueName, { connection: this.connection })
      ])
    );
  }

  async enqueue(payload: ImageJobQueuePayload): Promise<void> {
    const queueName = queueNameForTool(payload.tool);
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue "${queueName}" is not configured`);
    }

    await queue.add(payload.id, payload, {
      jobId: payload.id,
      removeOnComplete: { count: 100, age: 86400 },
      removeOnFail: { count: 500 },
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 2000
      }
    });
  }

  async getMetrics(): Promise<QueueMetrics> {
    const countsByQueue = await Promise.all(
      [...this.queues.values()].map((queue) => queue.getJobCounts("waiting", "active", "completed", "failed", "delayed"))
    );
    const counts = countsByQueue.reduce(
      (acc, item) => ({
        waiting: acc.waiting + (item.waiting || 0),
        active: acc.active + (item.active || 0),
        completed: acc.completed + (item.completed || 0),
        failed: acc.failed + (item.failed || 0),
        delayed: acc.delayed + (item.delayed || 0)
      }),
      { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 }
    );
    return {
      waiting: counts.waiting,
      active: counts.active,
      completed: counts.completed,
      failed: counts.failed,
      delayed: counts.delayed
    };
  }

  async close(): Promise<void> {
    if (this.closePromise) {
      return this.closePromise;
    }

    this.closePromise = (async () => {
      try {
        await Promise.all([...this.queues.values()].map((queue) => queue.close()));
      } finally {
        try {
          await this.connection.quit();
        } catch {
          this.connection.disconnect(false);
        }
      }
    })();

    return this.closePromise;
  }
}

export class InMemoryJobQueueService implements JobQueueService {
  public readonly items: ImageJobQueuePayload[] = [];

  async enqueue(payload: ImageJobQueuePayload): Promise<void> {
    this.items.push(payload);
  }

  async getMetrics(): Promise<QueueMetrics> {
    return {
      waiting: this.items.length,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0
    };
  }

  async close(): Promise<void> {
    return Promise.resolve();
  }
}
