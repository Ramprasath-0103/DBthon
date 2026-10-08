import type { RequestHandler } from "express";
import { randomBytes } from "node:crypto";
import { redis } from "../redis.js";

export type RateLimitOptions = { limit: number; windowMs: number };

export const DEFAULT_RATE_LIMIT: RateLimitOptions = { limit: 100, windowMs: 60_000 };

/**
 * Sliding-window log. Each client has a sorted set of request timestamps; anything
 * older than the window is trimmed, and the request is admitted only if fewer than
 * `limit` remain. One script, so trim/count/add is atomic under concurrency.
 *
 * Rejected requests are NOT recorded — otherwise a client hammering past the limit
 * would keep itself blocked forever. At limit=100 the set stays under Redis's
 * 128-entry listpack threshold (~3 KB per client), and PEXPIRE drops it a window
 * after the client goes quiet.
 *
 * Returns {allowed, count, retryAfterMs}.
 */
const SLIDING_WINDOW = `
local key    = KEYS[1]
local now    = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit  = tonumber(ARGV[3])

redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
local count = redis.call('ZCARD', key)

if count < limit then
  redis.call('ZADD', key, now, ARGV[4])
  redis.call('PEXPIRE', key, window)
  return {1, count + 1, 0}
end

local oldest = tonumber(redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')[2])
return {0, count, oldest + window - now}
`;

export function rateLimit({ limit, windowMs }: RateLimitOptions): RequestHandler {
  return async (req, res, next) => {
    // Fail open: losing Redis must not take the site down with it.
    if (!redis.isReady) return next();

    const now = Date.now();
    let reply: [number, number, number];
    try {
      reply = (await redis.eval(SLIDING_WINDOW, {
        keys: [`sw:rl:${req.ip ?? "unknown"}`],
        // The random suffix keeps two requests in the same millisecond distinct.
        arguments: [String(now), String(windowMs), String(limit), `${now}-${randomBytes(4).toString("hex")}`],
      })) as [number, number, number];
    } catch {
      return next();
    }

    const [allowed, count, retryAfterMs] = reply;
    res.setHeader("RateLimit-Limit", String(limit));
    res.setHeader("RateLimit-Remaining", String(Math.max(0, limit - count)));

    if (allowed === 1) return next();

    const retryAfterS = Math.max(1, Math.ceil(retryAfterMs / 1000));
    res.setHeader("Retry-After", String(retryAfterS));
    res.status(429).json({
      error: "rate_limited",
      retryAfterS,
      message: `Too many requests. Please wait ${retryAfterS} second${retryAfterS === 1 ? "" : "s"} and try again.`,
    });
  };
}
