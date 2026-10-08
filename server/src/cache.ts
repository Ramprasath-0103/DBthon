import type { Response } from "express";
import { redis } from "./redis.js";

/**
 * TTLs are a safety net, not the freshness mechanism. Writes through the API
 * invalidate explicitly (see routes/reviews.ts); the TTL only bounds staleness from
 * writes that bypass it — the seed script and raw SQL.
 */
export const TTL = {
  /** Reference data. Only the seed script changes it, and it flushes the cache. */
  factors: 24 * 60 * 60,
  /** Scores move on every review, but every review invalidates these keys. */
  locations: 10 * 60,
} as const;

export const cacheKeys = {
  factors: "sw:factors",
  /** Only the default viewport is cached — see routes/public.ts. */
  nearbyDefault: "sw:nearby:default",
  location: (id: number) => `sw:loc:${id}`,
};

export type Cached = { json: string; hit: boolean };

/**
 * Cache-aside. Stores the serialised JSON string so a hit is sent as-is, with no
 * re-stringify. A loader returning null (not found) is never cached, so probing
 * random ids cannot fill memory.
 */
export async function cachedJson(
  key: string,
  ttlSeconds: number,
  load: () => Promise<unknown>,
): Promise<Cached | null> {
  if (redis.isReady) {
    try {
      const hit = await redis.get(key);
      if (hit !== null) return { json: hit, hit: true };
    } catch {
      // Fall through to the database.
    }
  }

  const value = await load();
  if (value === null) return null;
  const json = JSON.stringify(value);
  if (redis.isReady) {
    redis.set(key, json, { expiration: { type: "EX", value: ttlSeconds } }).catch(() => {});
  }
  return { json, hit: false };
}

export async function invalidate(...keys: string[]): Promise<void> {
  if (!redis.isReady || keys.length === 0) return;
  try {
    await redis.del(keys);
  } catch {
    // The TTL bounds how stale the entry can get.
  }
}

/** X-Cache makes hits observable from curl and from the tests. */
export function sendCached(res: Response, cached: Cached): void {
  res.setHeader("X-Cache", cached.hit ? "HIT" : "MISS");
  res.type("json").send(cached.json);
}
