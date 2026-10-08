import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startTestServer } from "./helpers.js";
import { prisma } from "../src/db.js";
import { redis } from "../src/redis.js";
import { signToken } from "../src/lib/auth.js";
import { cacheKeys, TTL } from "../src/cache.js";

let base: string;
let close: () => Promise<void>;
let userId: number;
let token: string;
let locationId: number;

beforeAll(async () => {
  ({ base, close } = await startTestServer());
  const user = await prisma.user.create({
    data: { email: `cache.${Date.now()}@test.local`, displayName: "Cache Test", gender: "female", passwordHash: "x" },
  });
  userId = user.id;
  token = signToken(user.id);
  locationId = (await prisma.location.findFirstOrThrow({ select: { id: true } })).id;
});

afterAll(async () => {
  await prisma.review.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } });
  await close();
  await prisma.$disconnect();
});

const get = (path: string) => fetch(`${base}${path}`);

describe("response cache", () => {
  it("serves the second identical request from Redis, byte-for-byte", async () => {
    const first = await get("/api/locations/nearby");
    const second = await get("/api/locations/nearby");
    expect(first.headers.get("x-cache")).toBe("MISS");
    expect(second.headers.get("x-cache")).toBe("HIT");
    expect(second.headers.get("content-type")).toMatch(/application\/json/);
    expect(await second.text()).toBe(await first.text());
  });

  it("stores each key with its TTL, so nothing lives forever", async () => {
    await get("/api/factors");
    await get(`/api/locations/${locationId}`);

    const factorsTtl = await redis.ttl(cacheKeys.factors);
    const nearbyTtl = await redis.ttl(cacheKeys.nearbyDefault);
    const locationTtl = await redis.ttl(cacheKeys.location(locationId));

    expect(factorsTtl).toBeGreaterThan(TTL.factors - 10);
    expect(factorsTtl).toBeLessThanOrEqual(TTL.factors);
    for (const ttl of [nearbyTtl, locationTtl]) {
      expect(ttl).toBeGreaterThan(TTL.locations - 10);
      expect(ttl).toBeLessThanOrEqual(TTL.locations);
    }
  });

  it("does not cache custom viewports or unknown ids, so key count stays bounded", async () => {
    const custom = await get("/api/locations/nearby?lat=12.95&lng=79.15&radius_m=3000");
    expect(custom.status).toBe(200);
    expect(custom.headers.get("x-cache")).toBeNull();

    expect((await get("/api/locations/99999999")).status).toBe(404);
    expect(await redis.exists(cacheKeys.location(99999999))).toBe(0);

    const keys = (await redis.keys("sw:*")).filter((k) => !k.startsWith("sw:rl:")).sort();
    expect(keys).toEqual(
      [cacheKeys.factors, cacheKeys.location(locationId), cacheKeys.nearbyDefault].sort(),
    );
  });

  it("invalidates on a new review, so the next read shows it", async () => {
    const sampleOf = (body: { locations: { id: number; buckets: { afternoon: { sampleSize: number } } }[] }) =>
      body.locations.find((l) => l.id === locationId)!.buckets.afternoon.sampleSize;

    const before = await get("/api/locations/nearby");
    expect(before.headers.get("x-cache")).toBe("HIT");
    const n = sampleOf(await before.json());

    const posted = await fetch(`${base}/api/reviews`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        locationId,
        visitedAt: "2026-09-01T14:00:00+05:30", // afternoon in IST
        ratings: { lighting: 4, security_presence: 4, crowd_density: 4, transport_access: 4, harassment_free: 4, escape_routes: 4 },
      }),
    });
    expect(posted.status).toBe(201);
    expect(await redis.exists([cacheKeys.nearbyDefault, cacheKeys.location(locationId)])).toBe(0);

    const after = await get("/api/locations/nearby");
    expect(after.headers.get("x-cache")).toBe("MISS");
    expect(sampleOf(await after.json())).toBe(n + 1);

    const detail = await get(`/api/locations/${locationId}`);
    expect(detail.headers.get("x-cache")).toBe("MISS");
    expect((await detail.json()).buckets.afternoon.sampleSize).toBe(n + 1);
  });

  // Last: it closes the connection.
  it("fails open: with Redis gone, reads still come from Postgres", async () => {
    await redis.close();
    expect(redis.isReady).toBe(false);

    const res = await get("/api/locations/nearby");
    expect(res.status).toBe(200);
    expect(res.headers.get("x-cache")).toBe("MISS");
    expect((await res.json()).count).toBeGreaterThan(50);
    // No rate-limit headers either: the limiter let the request through.
    expect(res.headers.get("ratelimit-limit")).toBeNull();
  });
});
