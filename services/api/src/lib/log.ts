import { toStructuredLog } from "@image-ops/core";

/**
 * Logs an informational structured event to stdout.
 *
 * @param event - Event name or type to include in the structured log
 * @param payload - Key/value data to attach to the log entry
 */
export function logInfo(event: string, payload: Record<string, unknown>): void {
  // eslint-disable-next-line no-console
  console.log(toStructuredLog(event, payload));
}

/**
 * Logs an error-level structured message for a named event and associated data.
 *
 * @param event - Identifier or name of the event being logged
 * @param payload - Additional key/value data to include in the structured log
 */
export function logError(event: string, payload: Record<string, unknown>): void {
  // eslint-disable-next-line no-console
  console.error(toStructuredLog(event, payload));
}
