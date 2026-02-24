import { z } from "zod";
import type { Router } from "express";
import { asyncHandler } from "../lib/async-handler";
import { readLogBuffer } from "../lib/log";

const observabilityLogsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(200),
  level: z.enum(["all", "info", "error"]).default("all"),
  event: z.string().trim().min(1).max(120).optional()
});

export function registerObservabilityRoutes(router: Router): void {
  router.get("/api/observability/logs", asyncHandler(async (req, res) => {
    const parsedQuery = observabilityLogsQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      res.status(400).json({ error: "INVALID_OBSERVABILITY_QUERY", details: parsedQuery.error.flatten() });
      return;
    }

    const snapshot = readLogBuffer(parsedQuery.data);
    const logs = snapshot.logs.map((entry) => ({
      id: entry.id,
      ts: entry.ts,
      level: entry.level,
      event: entry.event,
      payload: entry.payload
    }));
    res.json({
      generatedAt: new Date().toISOString(),
      filters: {
        limit: parsedQuery.data.limit,
        level: parsedQuery.data.level,
        event: parsedQuery.data.event || null
      },
      retention: {
        mode: "in_memory",
        maxEntries: snapshot.capacity
      },
      summary: {
        total: snapshot.total,
        info: snapshot.info,
        error: snapshot.error,
        returned: logs.length
      },
      logs
    });
  }));
}
