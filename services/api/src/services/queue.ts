import type { ImageJobQueuePayload } from "@image-ops/core";
import { Queue } from "bullmq";
import IORedis from "ioredis";

export interface JobQueueService {
  enqueue(payload: ImageJobQueuePayload): Promise<void>;
  close(): Promise<void>;
}

export class BullMqJobQueueService implements JobQueueService {
  private readonly connection: IORedis;
  private readonly queue: Queue<ImageJobQueuePayload>;
  private closed = false;

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

  async close(): Promise<void> {
    if (this.closed) {
      return;
    }

    this.closed = true;

    try {
      await this.queue.close();
    } finally {
      await this.connection.quit();
    }
  }
}

export class InMemoryJobQueueService implements JobQueueService {
  public readonly items: ImageJobQueuePayload[] = [];

  async enqueue(payload: ImageJobQueuePayload): Promise<void> {
    this.items.push(payload);
  }

  async close(): Promise<void> {
    return Promise.resolve();
  }
}
