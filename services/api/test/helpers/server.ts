import type { AddressInfo } from "node:net";
import type { ApiConfig } from "../../src/config";
import { createApiApp } from "../../src/server";
import type { InMemoryJobRepository } from "../../src/services/job-repo";
import type { InMemoryJobQueueService } from "../../src/services/queue";
import type { InMemoryObjectStorageService } from "../../src/services/storage";

export type TestServices = {
  config: ApiConfig;
  storage: InMemoryObjectStorageService;
  queue: InMemoryJobQueueService;
  jobRepo: InMemoryJobRepository;
};

export async function startApiTestServer(input: TestServices & { now?: () => Date }): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> {
  const app = createApiApp({
    config: input.config,
    storage: input.storage,
    queue: input.queue,
    jobRepo: input.jobRepo,
    now: input.now || (() => new Date("2026-02-23T00:00:00.000Z"))
  });

  const server = app.listen(0);
  const address = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      })
  };
}
