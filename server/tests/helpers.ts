import type { Server } from "node:http";
import { createApp, type AppOptions } from "../src/app.js";
import { redis } from "../src/redis.js";

/**
 * Every file starts with an empty Redis. Some tests write with raw SQL behind the
 * API's back, which would otherwise leave a stale cache for the next file; it also
 * resets rate-limit counters, since the whole suite comes from 127.0.0.1.
 */
export async function startTestServer(
  options?: AppOptions,
): Promise<{ base: string; close: () => Promise<void> }> {
  if (!redis.isOpen) await redis.connect();
  await redis.flushDb();

  const server: Server = createApp(options).listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const addr = server.address();
  if (typeof addr === "string" || addr === null) throw new Error("no port assigned");
  return {
    base: `http://127.0.0.1:${addr.port}`,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      if (redis.isOpen) await redis.close();
    },
  };
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
