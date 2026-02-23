import { describe, expect, it } from "vitest";
import { loadApiConfig } from "../src/config";
import { PostgresJobRepository, createJobRepository } from "../src/services/job-repo";
import { createTestConfig } from "./helpers/fakes";

describe("job repository driver", () => {
  it("defaults to redis driver", () => {
    const config = loadApiConfig({
      S3_BUCKET: "image-ops-temp",
      S3_ACCESS_KEY: "minioadmin",
      S3_SECRET_KEY: "minioadmin"
    });
    expect(config.jobRepoDriver).toBe("redis");
  });

  it("requires POSTGRES_URL when postgres driver is selected", () => {
    expect(() =>
      loadApiConfig({
        JOB_REPO_DRIVER: "postgres",
        S3_BUCKET: "image-ops-temp",
        S3_ACCESS_KEY: "minioadmin",
        S3_SECRET_KEY: "minioadmin"
      })
    ).toThrow(/POSTGRES_URL is required/i);
  });

  it("throws on postgres driver config when postgresUrl is missing", () => {
    expect(() =>
      createJobRepository({
        ...createTestConfig(),
        jobRepoDriver: "postgres",
        postgresUrl: undefined
      })
    ).toThrow(/POSTGRES_URL is required/i);
  });

  it("creates postgres repository when driver=postgres", async () => {
    const config = {
      ...createTestConfig(),
      jobRepoDriver: "postgres" as const,
      postgresUrl: "postgres://postgres:postgres@localhost:5432/image_ops"
    };

    const repo = createJobRepository(config);
    expect(repo).toBeInstanceOf(PostgresJobRepository);
    await repo.close();
  });
});
