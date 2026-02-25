export {
  FREE_PLAN_LIMIT,
  FREE_PLAN_WINDOW_HOURS,
  applyQuota,
  quotaWindowResetAt
} from "./types";

const QUOTA_SCRIPT = `
  local key = KEYS[1]
  local limit = tonumber(ARGV[1])
  local ttl = tonumber(ARGV[2])
  local current = tonumber(redis.call('GET', key) or '0')
  if current >= limit then
    return -1
  end
  local new_val = redis.call('INCR', key)
  if new_val == 1 then
    redis.call('EXPIRE', key, ttl)
  end
  return new_val
`;

export type QuotaRedisClient = {
  script(subcommand: "LOAD", script: string): Promise<string>;
  evalsha(
    sha: string,
    numKeys: number,
    key: string,
    limit: number | string,
    ttlSeconds: number | string
  ): Promise<number | string>;
};

const quotaScriptShaByClient = new WeakMap<QuotaRedisClient, string>();

function parseQuotaReply(reply: number | string): number {
  if (typeof reply === "number") {
    return reply;
  }
  const parsed = Number.parseInt(reply, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid Redis quota script reply: ${String(reply)}`);
  }
  return parsed;
}

export async function loadQuotaScript(redis: QuotaRedisClient): Promise<void> {
  const sha = await redis.script("LOAD", QUOTA_SCRIPT);
  quotaScriptShaByClient.set(redis, sha);
}

export async function checkAndIncrementQuota(
  redis: QuotaRedisClient,
  userId: string,
  limit: number,
  windowSeconds: number,
  nowMs = Date.now()
): Promise<boolean> {
  if (!Number.isFinite(windowSeconds) || windowSeconds <= 0) {
    throw new Error("windowSeconds must be a positive number");
  }

  const windowKey = Math.floor(nowMs / (windowSeconds * 1000));
  const key = `quota:${userId}:${windowKey}`;

  let quotaScriptSha = quotaScriptShaByClient.get(redis);
  if (!quotaScriptSha) {
    await loadQuotaScript(redis);
    quotaScriptSha = quotaScriptShaByClient.get(redis);
  }
  if (!quotaScriptSha) {
    throw new Error("Failed to load Redis quota script SHA");
  }

  try {
    const result = await redis.evalsha(quotaScriptSha, 1, key, limit, windowSeconds);
    return parseQuotaReply(result) !== -1;
  } catch (error) {
    if (error instanceof Error && /NOSCRIPT/i.test(error.message)) {
      await loadQuotaScript(redis);
      quotaScriptSha = quotaScriptShaByClient.get(redis);
      if (!quotaScriptSha) {
        throw new Error("Failed to reload Redis quota script SHA");
      }
      const result = await redis.evalsha(quotaScriptSha, 1, key, limit, windowSeconds);
      return parseQuotaReply(result) !== -1;
    }
    throw error;
  }
}
