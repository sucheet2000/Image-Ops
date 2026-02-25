import type IORedis from "ioredis";

export type WorkerHeartbeatPayload = {
  event: "worker.heartbeat";
  queue: string;
  workerId: string;
  pid: number;
  ts: string;
  uptimeSeconds: number;
};

export function startWorkerHeartbeat(input: {
  redis: Pick<IORedis, "set">;
  workerId: string;
  queueName: string;
  intervalMs: number;
  ttlSeconds: number;
  onHeartbeat: (payload: WorkerHeartbeatPayload) => void;
  now?: () => Date;
  uptimeSeconds?: () => number;
  pid?: number;
}): () => void {
  const now = input.now || (() => new Date());
  const uptimeSeconds = input.uptimeSeconds || (() => process.uptime());
  const pid = input.pid ?? process.pid;

  const heartbeatKey = `worker:heartbeat:${input.workerId}`;

  const timer = setInterval(() => {
    const payload: WorkerHeartbeatPayload = {
      event: "worker.heartbeat",
      queue: input.queueName,
      workerId: input.workerId,
      pid,
      ts: now().toISOString(),
      uptimeSeconds: Math.floor(uptimeSeconds())
    };
    void input.redis.set(heartbeatKey, payload.ts, "EX", input.ttlSeconds).catch((error) => {
      // eslint-disable-next-line no-console
      console.error(
        JSON.stringify({
          event: "worker.heartbeat.write_failed",
          heartbeatKey,
          ts: payload.ts,
          ttlSeconds: input.ttlSeconds,
          message: error instanceof Error ? error.message : String(error)
        })
      );
    });
    input.onHeartbeat(payload);
  }, input.intervalMs);

  timer.unref?.();
  return () => {
    clearInterval(timer);
  };
}
