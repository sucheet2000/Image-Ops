type ClaimedJob = {
  id: string;
  subjectId: string;
  tool: string;
  inputObjectKey: string;
  options: Record<string, unknown>;
  status: "running";
  createdAt: string;
  updatedAt: string;
};

type ClaimResponse = {
  claimed: boolean;
  job?: ClaimedJob;
};

const API_BASE = process.env.WORKER_API_BASE_URL || "http://localhost:4000";
const POLL_MS = Number(process.env.WORKER_POLL_MS || 2000);
const SWEEP_EVERY = Number(process.env.WORKER_SWEEP_EVERY || 10);
const TOKEN = process.env.WORKER_INTERNAL_TOKEN || "dev-worker-token";

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function outputKeyFor(job: ClaimedJob): string {
  const extension = job.inputObjectKey.split(".").pop() || "jpg";
  return `tmp/${job.subjectId}/processed/${job.id}.${extension}`;
}

async function claimJob(): Promise<ClaimedJob | null> {
  const response = await fetch(`${API_BASE}/api/internal/queue/claim`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-worker-token": TOKEN
    }
  });

  if (!response.ok) {
    throw new Error(`Claim failed with status ${response.status}`);
  }

  const payload = (await response.json()) as ClaimResponse;
  if (!payload.claimed || !payload.job) {
    return null;
  }

  return payload.job;
}

async function markComplete(jobId: string, success: boolean, outputObjectKey?: string, errorCode?: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/internal/jobs/${encodeURIComponent(jobId)}/complete`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-worker-token": TOKEN
    },
    body: JSON.stringify({ success, outputObjectKey, errorCode })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Complete failed with status ${response.status}: ${body}`);
  }
}

async function processClaimedJob(job: ClaimedJob): Promise<void> {
  // Processing stub: simulate deterministic work and fail only when requested.
  await sleep(250);
  const shouldFail = Boolean(job.options?.forceFail);

  if (shouldFail) {
    await markComplete(job.id, false, undefined, "SIMULATED_WORKER_FAILURE");
    return;
  }
);

  await markComplete(job.id, true, outputKeyFor(job));
}

async function sweepExpired(): Promise<void> {
  const response = await fetch(`${API_BASE}/api/internal/temp/sweep`, {
    method: "POST",
    headers: {
      "x-worker-token": TOKEN
    }
  });

  if (!response.ok) {
    throw new Error(`Sweep failed with status ${response.status}`);
  }
}

async function pollLoop(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`Worker started. Polling ${API_BASE} every ${POLL_MS}ms`);
  let cycle = 0;

  for (;;) {
    try {
      cycle += 1;
      if (cycle % SWEEP_EVERY === 0) {
        await sweepExpired();
      }

      const job = await claimJob();
      if (!job) {
        await sleep(POLL_MS);
        continue;
      }

worker.on("completed", (job) => {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ event: "worker.completed", jobId: job.id }));
});

worker.on("failed", (job, error) => {
  // eslint-disable-next-line no-console
  console.error(
    JSON.stringify({
      event: "worker.failed",
      jobId: job?.id,
      message: error.message
    })
  );
});
