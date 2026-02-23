import { toStructuredLog } from "@image-ops/core";

export function logInfo(event: string, payload: Record<string, unknown>): void {
  // eslint-disable-next-line no-console
  console.log(toStructuredLog(event, payload));
}

export function logError(event: string, payload: Record<string, unknown>): void {
  // eslint-disable-next-line no-console
  console.error(toStructuredLog(event, payload));
}
