import { describe, expect, it } from "vitest";
import { FREE_PLAN_LIMIT, type ImageJobRecord } from "@image-ops/core";
import { InMemoryJobRepository } from "../src/services/job-repo";

function buildJob(id: string, subjectId: string): ImageJobRecord {
  return {
    id,
    subjectId,
    tool: "compress",
    plan: "free",
    isAdvanced: false,
    watermarkRequired: false,
    inputObjectKey: `tmp/${subjectId}/input/2026/02/23/compress/${id}.jpg`,
    inputMime: "image/jpeg",
    outputMime: "image/jpeg",
    options: { quality: 80 },
    status: "queued",
    createdAt: "2026-02-23T00:00:00.000Z",
    updatedAt: "2026-02-23T00:00:00.000Z"
  };
}

describe("JobRepository atomic quota+job", () => {
  it("persists both quota and job when allowed", async () => {
    const repo = new InMemoryJobRepository();

    const result = await repo.reserveQuotaAndCreateJob({
      subjectId: "seller_1",
      requestedImages: 1,
      now: new Date("2026-02-23T00:00:00.000Z"),
      job: buildJob("job_1", "seller_1")
    });

    expect(result.allowed).toBe(true);
    expect(result.window.usedCount).toBe(1);

    const stored = await repo.getJob("job_1");
    expect(stored?.status).toBe("queued");
  });

  it("does not create job when quota is exceeded", async () => {
    const repo = new InMemoryJobRepository();

    for (let index = 0; index < FREE_PLAN_LIMIT; index += 1) {
      const allowed = await repo.reserveQuotaAndCreateJob({
        subjectId: "seller_2",
        requestedImages: 1,
        now: new Date("2026-02-23T00:00:00.000Z"),
        job: buildJob(`job_${index}`, "seller_2")
      });
      expect(allowed.allowed).toBe(true);
    }

    const denied = await repo.reserveQuotaAndCreateJob({
      subjectId: "seller_2",
      requestedImages: 1,
      now: new Date("2026-02-23T00:00:00.000Z"),
      job: buildJob("job_blocked", "seller_2")
    });

    expect(denied.allowed).toBe(false);
    expect(await repo.getJob("job_blocked")).toBeNull();

    const quota = await repo.getQuotaWindow("seller_2");
    expect(quota?.usedCount).toBe(FREE_PLAN_LIMIT);
  });
});
