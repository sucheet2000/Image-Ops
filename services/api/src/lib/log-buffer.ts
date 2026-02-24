export type BufferedLogLevel = "info" | "error";

export type BufferedLogEntry = {
  id: number;
  ts: string;
  level: BufferedLogLevel;
  event: string;
  payload: Record<string, unknown>;
  raw: string;
};

export type BufferedLogFilter = {
  limit?: number;
  level?: "all" | BufferedLogLevel;
  event?: string;
};

export type BufferedLogSnapshot = {
  capacity: number;
  total: number;
  info: number;
  error: number;
  logs: BufferedLogEntry[];
};

const DEFAULT_CAPACITY = 500;

let capacity = DEFAULT_CAPACITY;
let sequence = 0;
const entries: BufferedLogEntry[] = [];

function normalizeCapacity(value: number): number {
  if (!Number.isInteger(value) || value < 10) {
    return DEFAULT_CAPACITY;
  }
  return Math.min(5000, value);
}

export function setLogBufferCapacity(nextCapacity: number): void {
  capacity = normalizeCapacity(nextCapacity);
  if (entries.length > capacity) {
    entries.splice(0, entries.length - capacity);
  }
}

export function getLogBufferCapacity(): number {
  return capacity;
}

export function appendBufferedLogEntry(entry: Omit<BufferedLogEntry, "id">): void {
  sequence += 1;
  entries.push({ ...entry, id: sequence });
  if (entries.length > capacity) {
    entries.shift();
  }
}

export function readBufferedLogs(filter: BufferedLogFilter = {}): BufferedLogSnapshot {
  const resolvedLimit = Number.isInteger(filter.limit) ? Math.min(Math.max(filter.limit || 200, 1), 500) : 200;
  const resolvedLevel = filter.level || "all";
  const eventFilter = (filter.event || "").trim().toLowerCase();

  const info = entries.reduce((count, entry) => count + (entry.level === "info" ? 1 : 0), 0);
  const error = entries.length - info;

  const filtered = entries.filter((entry) => {
    if (resolvedLevel !== "all" && entry.level !== resolvedLevel) {
      return false;
    }
    if (eventFilter && !entry.event.toLowerCase().includes(eventFilter)) {
      return false;
    }
    return true;
  });

  return {
    capacity,
    total: entries.length,
    info,
    error,
    logs: [...filtered].reverse().slice(0, resolvedLimit)
  };
}

export function resetBufferedLogs(): void {
  entries.splice(0, entries.length);
  sequence = 0;
}
