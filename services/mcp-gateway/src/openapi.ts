import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import type { SearchResult } from "./types";
import { OPERATIONS } from "./operations";

export function loadReducedOpenApiPath(): string {
  return path.resolve(__dirname, "..", "openapi", "reduced.v1.yaml");
}

export function assertReducedSpecLoadable(): void {
  const file = fs.readFileSync(loadReducedOpenApiPath(), "utf8");
  const doc = yaml.load(file);
  if (!doc || typeof doc !== "object") {
    throw new Error("Reduced OpenAPI spec could not be parsed.");
  }
}

export function searchOperations(query?: string): SearchResult[] {
  const needle = (query || "").trim().toLowerCase();
  return OPERATIONS.filter((item) => {
    if (!needle) {
      return true;
    }

    return [item.operationId, item.method, item.route, item.summary, ...item.keyInputFields]
      .join(" ")
      .toLowerCase()
      .includes(needle);
  }).map(({ operationId, method, route, summary, keyInputFields }) => ({
    operationId,
    method,
    route,
    summary,
    keyInputFields
  }));
}
