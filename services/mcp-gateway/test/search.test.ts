import { describe, expect, it } from "vitest";
import { searchOperations } from "../src/openapi";

describe("searchOperations", () => {
  it("returns reduced operation set", () => {
    const results = searchOperations();
    expect(results.length).toBe(5);
    expect(results.map((item) => item.operationId).sort()).toEqual([
      "cleanup_create",
      "jobs_create",
      "jobs_get",
      "quota_get",
      "uploads_init"
    ]);
  });

  it("filters by query", () => {
    const results = searchOperations("quota");
    expect(results.length).toBe(1);
    expect(results[0]?.operationId).toBe("quota_get");
  });
});
