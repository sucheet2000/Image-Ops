import type { AddressInfo } from "node:net";
import type { Express } from "express";
import type { ApiConfig } from "../../src/config";
import { createApiApp } from "../../src/server";
import type { InMemoryJobRepository } from "../../src/services/job-repo";
import type { MalwareScanService } from "../../src/services/malware-scan";
import type { InMemoryJobQueueService } from "../../src/services/queue";
import type { InMemoryObjectStorageService } from "../../src/services/storage";

export type TestServices = {
  config: ApiConfig;
  storage: InMemoryObjectStorageService;
  queue: InMemoryJobQueueService;
  jobRepo: InMemoryJobRepository;
  malwareScan?: MalwareScanService;
};

type StartServerInput =
  | (TestServices & { now?: () => Date })
  | { app: Express };

/**
 * Starts the API application on an ephemeral port for use in tests.
 *
 * @param input - Test dependencies required to construct the API plus an optional `now` function to override the current time; when `now` is omitted it defaults to 2026-02-23T00:00:00.000Z
 * @returns An object containing `baseUrl` (the server URL, e.g. `http://127.0.0.1:<port>`) and `close` (a function that closes the server and completes once the server has shut down)
 */
export async function startApiTestServer(input: StartServerInput): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> {
  const app = "app" in input
    ? input.app
    : createApiApp({
        config: input.config,
        storage: input.storage,
        queue: input.queue,
        jobRepo: input.jobRepo,
        malwareScan: input.malwareScan,
        now: input.now || (() => new Date("2026-02-23T00:00:00.000Z"))
      });

  const server = app.listen(0);
  const address = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });

      const cleanupCallbacks = app.locals.__runtimeCleanup as Array<() => void> | undefined;
      if (cleanupCallbacks) {
        for (const cleanup of cleanupCallbacks) {
          cleanup();
        }
      }

      if ("malwareScan" in input && input.malwareScan) {
        await input.malwareScan.close();
      }
    }
  };
}
