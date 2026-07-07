import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const LIMIT = 10;
const WINDOW_SECONDS = 60;

// Vercel's Upstash integration injects KV_REST_API_*; a raw Upstash setup
// injects UPSTASH_REDIS_REST_*. Accept both. Without either, fall back to a
// per-instance in-memory window (adequate behind a single container).
const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

const upstash =
  url && token
    ? new Ratelimit({
        redis: new Redis({ url, token }),
        limiter: Ratelimit.slidingWindow(LIMIT, `${WINDOW_SECONDS} s`),
        prefix: "engram",
      })
    : null;

const memoryHits = new Map<string, number[]>();

function memoryLimit(key: string, now: number): boolean {
  const windowStart = now - WINDOW_SECONDS * 1000;
  const hits = (memoryHits.get(key) ?? []).filter((t) => t > windowStart);
  if (hits.length >= LIMIT) {
    memoryHits.set(key, hits);
    return false;
  }
  hits.push(now);
  memoryHits.set(key, hits);
  return true;
}

/** Returns true when the request is allowed. */
export async function checkRateLimit(key: string): Promise<boolean> {
  if (upstash) {
    const { success } = await upstash.limit(key);
    return success;
  }
  return memoryLimit(key, Date.now());
}
