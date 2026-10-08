import { createClient } from "redis";
import { env } from "./env.js";

/**
 * One shared client for the cache and the rate limiter.
 *
 * Redis is an optimisation here, never a dependency: every caller checks isReady and
 * falls through to Postgres (cache) or lets the request pass (rate limit) when it is
 * down. disableOfflineQueue makes commands fail immediately instead of queueing
 * behind a dead connection and stalling requests.
 */
export const redis = createClient({
  url: env.REDIS_URL,
  disableOfflineQueue: true,
  socket: { reconnectStrategy: (retries) => Math.min(retries * 200, 5_000) },
});

let warned = false;
redis.on("error", (err: Error & { code?: string }) => {
  // ECONNREFUSED arrives as an AggregateError with an empty message.
  const reason = err.code ?? err.message;
  if (!warned) console.warn(`Redis unavailable, serving without cache/rate limit: ${reason}`);
  warned = true;
});
redis.on("ready", () => {
  if (warned) console.log("Redis reconnected");
  warned = false;
});

/** Not awaited at boot: with retries on, connect() would block until Redis comes up. */
export function connectRedis(): void {
  if (!redis.isOpen) redis.connect().catch(() => {});
}
