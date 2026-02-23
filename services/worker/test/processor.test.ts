import sharp from "sharp";
import { describe, expect, it } from "vitest";
import type { BackgroundRemoveProvider } from "../src/providers/bg-remove-provider";
import { processImageJob } from "../src/processor";
import { InMemoryWorkerJobRepository } from "../src/services/job-repo";
import { InMemoryWorkerStorageService } from "../src/services/storage";

async function makeJpeg(width = 1200, height = 800): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 120, g: 90, b: 60 }
    }
  })
    .jpeg({ quality: 92 })
    .toBuffer();
}

class PassthroughBgProvider implements BackgroundRemoveProvider {
  async removeBackground(input: { bytes: Buffer; contentType: string }): Promise<{ bytes: Buffer; contentType: string }> {
    return { bytes: input.bytes, contentType: "image/png" };
  }
}

class FailingBgProvider implements BackgroundRemoveProvider {
  async removeBackground(): Promise<{ bytes: Buffer; contentType: string }> {
    throw new Error("background provider timeout");
  }
}

describe("processImageJob", () => {
  it("processes resize job and marks done", async () => {
    const storage = new InMemoryWorkerStorageService();
    const repo = new InMemoryWorkerJobRepository();
    const inputKey = "tmp/seller_1/input.jpg";
    const outputKey = "tmp/seller_1/output.jpg";

    storage.seedObject(inputKey, await makeJpeg(1200, 800), "image/jpeg");
    repo.seedJob({
      id: "job_resize",
      subjectId: "seller_1",
      tool: "resize",
      plan: "free",
      isAdvanced: false,
      watermarkRequired: false,
      inputObjectKey: inputKey,
      outputObjectKey: outputKey,
      inputMime: "image/jpeg",
      options: { width: 300, height: 300, fit: "inside" },
      status: "queued",
      createdAt: "2026-02-23T00:00:00.000Z",
      updatedAt: "2026-02-23T00:00:00.000Z"
    });

    await processImageJob(
      {
        id: "job_resize",
        subjectId: "seller_1",
        tool: "resize",
        plan: "free",
        watermarkRequired: false,
        inputObjectKey: inputKey,
        outputObjectKey: outputKey,
        inputMime: "image/jpeg",
        options: { width: 300, height: 300, fit: "inside" }
      },
      {
        storage,
        jobRepo: repo,
        bgRemoveProvider: new PassthroughBgProvider(),
        now: () => new Date("2026-02-23T00:00:00.000Z")
      }
    );

    const job = await repo.getJob("job_resize");
    expect(job?.status).toBe("done");

    const output = storage.getObject(outputKey);
    expect(output).toBeDefined();
    const metadata = await sharp(output!.bytes).metadata();
    expect(metadata.width).toBeLessThanOrEqual(300);
    expect(metadata.height).toBeLessThanOrEqual(300);

    const inputAfter = storage.getObject(inputKey);
    expect(inputAfter).toBeUndefined();
  });

  it("processes convert job into requested format", async () => {
    const storage = new InMemoryWorkerStorageService();
    const repo = new InMemoryWorkerJobRepository();
    const inputKey = "tmp/seller_2/input.jpg";
    const outputKey = "tmp/seller_2/output.webp";

    storage.seedObject(inputKey, await makeJpeg(), "image/jpeg");
    repo.seedJob({
      id: "job_convert",
      subjectId: "seller_2",
      tool: "convert",
      plan: "pro",
      isAdvanced: false,
      watermarkRequired: false,
      inputObjectKey: inputKey,
      outputObjectKey: outputKey,
      inputMime: "image/jpeg",
      options: { format: "webp", quality: 70 },
      status: "queued",
      createdAt: "2026-02-23T00:00:00.000Z",
      updatedAt: "2026-02-23T00:00:00.000Z"
    });

    await processImageJob(
      {
        id: "job_convert",
        subjectId: "seller_2",
        tool: "convert",
        plan: "pro",
        watermarkRequired: false,
        inputObjectKey: inputKey,
        outputObjectKey: outputKey,
        inputMime: "image/jpeg",
        options: { format: "webp", quality: 70 }
      },
      {
        storage,
        jobRepo: repo,
        bgRemoveProvider: new PassthroughBgProvider(),
        now: () => new Date("2026-02-23T00:00:00.000Z")
      }
    );

    const output = storage.getObject(outputKey);
    expect(output?.contentType).toBe("image/webp");

    const meta = await sharp(output!.bytes).metadata();
    expect(meta.format).toBe("webp");
  });

  it("applies watermark on advanced free-plan outputs", async () => {
    const storage = new InMemoryWorkerStorageService();
    const repo = new InMemoryWorkerJobRepository();
    const inputKey = "tmp/seller_3/input.jpg";
    const outputKey = "tmp/seller_3/output.png";
    const input = await makeJpeg(800, 600);

    storage.seedObject(inputKey, input, "image/jpeg");
    repo.seedJob({
      id: "job_bg",
      subjectId: "seller_3",
      tool: "background-remove",
      plan: "free",
      isAdvanced: true,
      watermarkRequired: true,
      inputObjectKey: inputKey,
      outputObjectKey: outputKey,
      inputMime: "image/jpeg",
      options: { outputFormat: "png" },
      status: "queued",
      createdAt: "2026-02-23T00:00:00.000Z",
      updatedAt: "2026-02-23T00:00:00.000Z"
    });

    await processImageJob(
      {
        id: "job_bg",
        subjectId: "seller_3",
        tool: "background-remove",
        plan: "free",
        watermarkRequired: true,
        inputObjectKey: inputKey,
        outputObjectKey: outputKey,
        inputMime: "image/jpeg",
        options: { outputFormat: "png" }
      },
      {
        storage,
        jobRepo: repo,
        bgRemoveProvider: new PassthroughBgProvider(),
        now: () => new Date("2026-02-23T00:00:00.000Z")
      }
    );

    const output = storage.getObject(outputKey);
    expect(output?.contentType).toBe("image/png");
    expect(Buffer.compare(output!.bytes, input)).not.toBe(0);
  });

  it("marks job failed when provider errors", async () => {
    const storage = new InMemoryWorkerStorageService();
    const repo = new InMemoryWorkerJobRepository();
    const inputKey = "tmp/seller_4/input.jpg";
    const outputKey = "tmp/seller_4/output.png";

    storage.seedObject(inputKey, await makeJpeg(), "image/jpeg");
    repo.seedJob({
      id: "job_fail",
      subjectId: "seller_4",
      tool: "background-remove",
      plan: "free",
      isAdvanced: true,
      watermarkRequired: true,
      inputObjectKey: inputKey,
      outputObjectKey: outputKey,
      inputMime: "image/jpeg",
      options: { outputFormat: "png" },
      status: "queued",
      createdAt: "2026-02-23T00:00:00.000Z",
      updatedAt: "2026-02-23T00:00:00.000Z"
    });

    await expect(
      processImageJob(
        {
          id: "job_fail",
          subjectId: "seller_4",
          tool: "background-remove",
          plan: "free",
          watermarkRequired: true,
          inputObjectKey: inputKey,
          outputObjectKey: outputKey,
          inputMime: "image/jpeg",
          options: { outputFormat: "png" }
        },
        {
          storage,
          jobRepo: repo,
          bgRemoveProvider: new FailingBgProvider(),
          now: () => new Date("2026-02-23T00:00:00.000Z")
        }
      )
    ).rejects.toThrow();

    const job = await repo.getJob("job_fail");
    expect(job?.status).toBe("failed");
    expect(job?.errorCode).toBe("BACKGROUND_REMOVE_FAILED");
  });
});
