export type WorkerHeartbeatPayload = {
  event: "worker.heartbeat";
  queue: string;
  pid: number;
  ts: string;
  uptimeSeconds: number;
};

export function startWorkerHeartbeat(input: {
  queueName: string;
  intervalMs: number;
  onHeartbeat: (payload: WorkerHeartbeatPayload) => void;
  now?: () => Date;
  uptimeSeconds?: () => number;
  pid?: number;
}): () => void {
  const now = input.now || (() => new Date());
  const uptimeSeconds = input.uptimeSeconds || (() => process.uptime());
  const pid = input.pid ?? process.pid;

  const timer = setInterval(() => {
    input.onHeartbeat({
      event: "worker.heartbeat",
      queue: input.queueName,
      pid,
      ts: now().toISOString(),
      uptimeSeconds: Math.floor(uptimeSeconds())
    });
  }, input.intervalMs);

  timer.unref?.();
  return () => {
    clearInterval(timer);
  };
}
