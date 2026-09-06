import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startTestServer } from "./helpers.js";
import { prisma } from "../src/db.js";

let base: string;
let close: () => Promise<void>;

beforeAll(async () => ({ base, close } = await startTestServer()));
afterAll(async () => {
  await close();
  await prisma.$disconnect();
});

describe("GET /api/locations/nearby", () => {
  it("returns every location with all four buckets in one response", async () => {
    const res = await fetch(`${base}/api/locations/nearby`);
    const body = await res.json();
    expect(body.count).toBeGreaterThan(50);
    for (const loc of body.locations) {
      expect(Object.keys(loc.buckets).sort()).toEqual(
        ["afternoon", "evening", "morning", "night"],
      );
    }
  });

  it("serialises scores as plain JSON numbers, not Decimal or BigInt", async () => {
    const body = await (await fetch(`${base}/api/locations/nearby`)).json();
    for (const loc of body.locations) {
      expect(typeof loc.distanceM).toBe("number");
      for (const b of Object.values(loc.buckets) as { score: unknown; sampleSize: unknown }[]) {
        expect(b.score === null || typeof b.score === "number").toBe(true);
        expect(Number.isInteger(b.sampleSize)).toBe(true);
      }
    }
  });

  it("never returns a score below 3 samples", async () => {
    const body = await (await fetch(`${base}/api/locations/nearby`)).json();
    let sparse = 0;
    for (const loc of body.locations) {
      for (const b of Object.values(loc.buckets) as { score: number | null; sampleSize: number }[]) {
        if (b.sampleSize < 3) {
          expect(b.score).toBeNull();
          if (b.sampleSize > 0) sparse++;
        }
      }
    }
    expect(sparse, "seed must contain under-sampled buckets to make this meaningful")
      .toBeGreaterThan(0);
  });

  it("rejects a nonsense radius with 400", async () => {
    const res = await fetch(`${base}/api/locations/nearby?radius_m=notanumber`);
    expect(res.status).toBe(400);
  });
});

describe("GET /api/locations/:id", () => {
  it("omits the factor breakdown for buckets under 3 samples", async () => {
    const nearby = await (await fetch(`${base}/api/locations/nearby`)).json();
    const sparse = nearby.locations.find((l: { buckets: Record<string, { sampleSize: number }> }) =>
      Object.values(l.buckets).every((b) => b.sampleSize < 3),
    );
    expect(sparse, "seed must include a location with no scored bucket").toBeTruthy();

    const detail = await (await fetch(`${base}/api/locations/${sparse.id}`)).json();
    for (const b of Object.values(detail.buckets) as { score: null; factors: unknown[] }[]) {
      expect(b.score).toBeNull();
      expect(b.factors).toHaveLength(0);
    }
  });

  it("returns six factors for a well-sampled bucket", async () => {
    const nearby = await (await fetch(`${base}/api/locations/nearby`)).json();
    const good = nearby.locations.find((l: { buckets: Record<string, { sampleSize: number }> }) =>
      l.buckets.afternoon.sampleSize >= 3,
    );
    const detail = await (await fetch(`${base}/api/locations/${good.id}`)).json();
    expect(detail.buckets.afternoon.factors).toHaveLength(6);
  });

  it("404s on an unknown id", async () => {
    expect((await fetch(`${base}/api/locations/999999`)).status).toBe(404);
  });
});
