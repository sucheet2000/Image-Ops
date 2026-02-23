import type { ImageJobQueuePayload } from "@image-ops/core";
import { Queue } from "bullmq";
import IORedis from "ioredis";

export interface JobQueueService {
  enqueue(payload: ImageJobQueuePayload): Promise<void>;
}

export class BullMqJobQueueService implements JobQueueService {
  private readonly queue: Queue<ImageJobQueuePayload>;

  constructor(input: { queueName: string; redisUrl: string }) {
    const connection = new IORedis(input.redisUrl, { maxRetriesPerRequest: null });
    this.queue = new Queue<ImageJobQueuePayload>(input.queueName, { connection });
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
}

export class InMemoryJobQueueService implements JobQueueService {
  public readonly items: ImageJobQueuePayload[] = [];

  async enqueue(payload: ImageJobQueuePayload): Promise<void> {
    this.items.push(payload);
  }
}
