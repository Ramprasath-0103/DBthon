import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startTestServer, sleep } from "./helpers.js";
import { prisma } from "../src/db.js";

// A small limit and window so the sliding behaviour is testable in about a second.
// trustProxy lets each test pretend to be a different client via X-Forwarded-For.
const LIMIT = 5;
const WINDOW_MS = 1_000;

let base: string;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ base, close } = await startTestServer({
    rateLimit: { limit: LIMIT, windowMs: WINDOW_MS },
    trustProxy: true,
  }));
});
afterAll(async () => {
  await close();
  await prisma.$disconnect();
});

const hit = (ip: string) =>
  fetch(`${base}/api/factors`, { headers: { "X-Forwarded-For": ip } });

describe("sliding-window rate limit", () => {
  it("admits `limit` requests, counts down, then answers 429 with Retry-After", async () => {
    for (let i = 1; i <= LIMIT; i++) {
      const res = await hit("10.0.0.1");
      expect(res.status).toBe(200);
      expect(res.headers.get("ratelimit-limit")).toBe(String(LIMIT));
      expect(res.headers.get("ratelimit-remaining")).toBe(String(LIMIT - i));
    }
    const blocked = await hit("10.0.0.1");
    expect(blocked.status).toBe(429);
    const retryAfter = Number(blocked.headers.get("retry-after"));
    expect(retryAfter).toBeGreaterThanOrEqual(1);
    // The body repeats the wait so the web client can show it as-is.
    expect(await blocked.json()).toMatchObject({
      error: "rate_limited",
      retryAfterS: retryAfter,
      message: expect.stringContaining(`wait ${retryAfter} second`),
    });
  });

  it("counts each client separately", async () => {
    // 10.0.0.1 is exhausted by the previous test; a different client is not.
    expect((await hit("10.0.0.2")).status).toBe(200);
  });

  it("slides: requests leave the window one by one, not all at once", async () => {
    const ip = "10.0.0.3";
    // t=0: 3 requests. t≈600ms: 2 more. The limit is now reached.
    for (let i = 0; i < 3; i++) expect((await hit(ip)).status).toBe(200);
    await sleep(600);
    for (let i = 0; i < 2; i++) expect((await hit(ip)).status).toBe(200);
    expect((await hit(ip)).status).toBe(429);

    // t≈1100ms: the first 3 have slid out, the 2 from t≈600ms have not.
    // A fixed window would have reset to 5 here; a sliding one frees exactly 3.
    await sleep(500);
    for (let i = 0; i < 3; i++) expect((await hit(ip)).status).toBe(200);
    expect((await hit(ip)).status).toBe(429);
  });

  it("does not record rejected requests, so a blocked client recovers", async () => {
    const ip = "10.0.0.4";
    for (let i = 0; i < LIMIT; i++) await hit(ip);
    // Hammer while blocked. If these were recorded, the client would stay blocked.
    for (let i = 0; i < 10; i++) expect((await hit(ip)).status).toBe(429);
    await sleep(WINDOW_MS + 100);
    expect((await hit(ip)).status).toBe(200);
  });

  it("never limits /health", async () => {
    for (let i = 0; i < LIMIT + 2; i++) {
      const res = await fetch(`${base}/health`, { headers: { "X-Forwarded-For": "10.0.0.5" } });
      expect(res.status).toBe(200);
    }
  });
});
