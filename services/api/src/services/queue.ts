import type { ImageJobQueuePayload } from "@imageops/core";
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
  private readonly queue: Queue<ImageJobQueuePayload>;
  private closePromise: Promise<void> | null = null;

  constructor(input: { queueName: string; redisUrl: string }) {
    this.connection = new IORedis(input.redisUrl, { maxRetriesPerRequest: null });
    this.queue = new Queue<ImageJobQueuePayload>(input.queueName, { connection: this.connection });
  }

  async enqueue(payload: ImageJobQueuePayload): Promise<void> {
    await this.queue.add(payload.id, payload, {
      jobId: payload.id,
      removeOnComplete: false,
      removeOnFail: false,
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 1000
      }
    });
  }

  async getMetrics(): Promise<QueueMetrics> {
    const counts = await this.queue.getJobCounts("waiting", "active", "completed", "failed", "delayed");
    return {
      waiting: counts.waiting || 0,
      active: counts.active || 0,
      completed: counts.completed || 0,
      failed: counts.failed || 0,
      delayed: counts.delayed || 0
    };
  }

  async close(): Promise<void> {
    if (this.closePromise) {
      return this.closePromise;
    }

    this.closePromise = (async () => {
      try {
        await this.queue.close();
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
