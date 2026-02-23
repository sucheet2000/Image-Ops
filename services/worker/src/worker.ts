/*
Worker placeholder.
Production implementation will:
1) Pull jobs from queue.
2) Transform image by tool settings.
3) Apply watermark for eligible free advanced outputs.
4) Upload output to temporary object storage.
5) Emit deletion schedule and audit events.
*/

setInterval(() => {
  // eslint-disable-next-line no-console
  console.log("Worker heartbeat", new Date().toISOString());
}, 30000);
