import { afterEach, describe, expect, it, vi } from 'vitest';
import { startWorkerHeartbeat, type WorkerHeartbeatPayload } from '../src/heartbeat';

describe('startWorkerHeartbeat', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits heartbeat payloads on interval and stops cleanly', async () => {
    vi.useFakeTimers();
    let uptime = 10;
    const events: WorkerHeartbeatPayload[] = [];
    const redis = {
      set: vi.fn().mockResolvedValue('OK'),
    };

    const stop = startWorkerHeartbeat({
      redis: redis as never,
      workerId: 'worker-123',
      queueName: 'image-ops-jobs',
      intervalMs: 1000,
      ttlSeconds: 90,
      pid: 999,
      now: () => new Date('2026-02-24T00:00:00.000Z'),
      uptimeSeconds: () => ++uptime,
      onHeartbeat: (payload) => {
        events.push(payload);
      },
    });

    await vi.advanceTimersByTimeAsync(3000);
    expect(events).toHaveLength(3);
    expect(events[0]).toEqual({
      event: 'worker.heartbeat',
      queue: 'image-ops-jobs',
      workerId: 'worker-123',
      pid: 999,
      ts: '2026-02-24T00:00:00.000Z',
      uptimeSeconds: 11,
    });
    expect(redis.set).toHaveBeenCalledWith(
      'worker:heartbeat:worker-123',
      '2026-02-24T00:00:00.000Z',
      'EX',
      90
    );

    stop();
    await vi.advanceTimersByTimeAsync(2000);
    expect(events).toHaveLength(3);
  });
});
