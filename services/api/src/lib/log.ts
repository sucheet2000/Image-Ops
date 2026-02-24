import { toStructuredLog } from "@imageops/core";
import {
  appendBufferedLogEntry,
  readBufferedLogs,
  resetBufferedLogs,
  type BufferedLogFilter,
  type BufferedLogSnapshot
} from "./log-buffer";

type StructuredLog = {
  ts?: unknown;
  event?: unknown;
  payload?: unknown;
};

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return { value };
}

function parseStructuredLog(rawLog: string, fallbackEvent: string, fallbackPayload: Record<string, unknown>): {
  ts: string;
  event: string;
  payload: Record<string, unknown>;
} {
  try {
    const parsed = JSON.parse(rawLog) as StructuredLog;
    return {
      ts: typeof parsed.ts === "string" ? parsed.ts : new Date().toISOString(),
      event: typeof parsed.event === "string" ? parsed.event : fallbackEvent,
      payload: asObject(parsed.payload ?? fallbackPayload)
    };
  } catch {
    return {
      ts: new Date().toISOString(),
      event: fallbackEvent,
      payload: fallbackPayload
    };
  }
}

function emitLog(level: "info" | "error", event: string, payload: Record<string, unknown>): void {
  const rawLog = toStructuredLog(event, payload);
  const parsed = parseStructuredLog(rawLog, event, payload);
  appendBufferedLogEntry({
    ts: parsed.ts,
    level,
    event: parsed.event,
    payload: parsed.payload,
    raw: rawLog
  });

  if (level === "error") {
    // eslint-disable-next-line no-console
    console.error(rawLog);
    return;
  }

  // eslint-disable-next-line no-console
  console.log(rawLog);
}

/**
 * Logs an informational structured event to stdout.
 *
 * @param event - Event name or type to include in the structured log
 * @param payload - Key/value data to attach to the log entry
 */
export function logInfo(event: string, payload: Record<string, unknown>): void {
  emitLog("info", event, payload);
}

/**
 * Logs an error-level structured message for a named event and associated data.
 *
 * @param event - Identifier or name of the event being logged
 * @param payload - Additional key/value data to include in the structured log
 */
export function logError(event: string, payload: Record<string, unknown>): void {
  emitLog("error", event, payload);
}

export function readLogBuffer(filter: BufferedLogFilter = {}): BufferedLogSnapshot {
  return readBufferedLogs(filter);
}

export function resetLogBuffer(): void {
  resetBufferedLogs();
}
