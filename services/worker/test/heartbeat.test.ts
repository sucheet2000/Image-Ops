import { afterEach, describe, expect, it, vi } from "vitest";
import { startWorkerHeartbeat, type WorkerHeartbeatPayload } from "../src/heartbeat";

describe("startWorkerHeartbeat", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("emits heartbeat payloads on interval and stops cleanly", () => {
    vi.useFakeTimers();
    let uptime = 10;
    const events: WorkerHeartbeatPayload[] = [];

    const stop = startWorkerHeartbeat({
      queueName: "image-ops-jobs",
      intervalMs: 1000,
      pid: 999,
      now: () => new Date("2026-02-24T00:00:00.000Z"),
      uptimeSeconds: () => ++uptime,
      onHeartbeat: (payload) => {
        events.push(payload);
      }
    });

    vi.advanceTimersByTime(3000);
    expect(events).toHaveLength(3);
    expect(events[0]).toEqual({
      event: "worker.heartbeat",
      queue: "image-ops-jobs",
      pid: 999,
      ts: "2026-02-24T00:00:00.000Z",
      uptimeSeconds: 11
    });

    stop();
    vi.advanceTimersByTime(2000);
    expect(events).toHaveLength(3);
  });
});
