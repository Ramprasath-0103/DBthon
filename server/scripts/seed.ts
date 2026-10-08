/**
 * Seeds the database from the cached Overpass response. Deterministic: the same
 * seed constant always produces the same data.
 *
 * Usage: npm run db:seed
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import bcrypt from "bcryptjs";
import { prisma } from "../src/db.js";
import { createClient } from "redis";
import { env } from "../src/env.js";
import { insertLocations, type NewLocation } from "../src/repo/locations.js";
import { mulberry32, gaussian, intBetween, shuffled, clamp } from "../src/lib/random.js";
import { TIME_BUCKETS, BUCKET_HOURS, istInstant, type Bucket } from "../src/lib/time.js";
import {
  FACTORS, CATEGORIES, PROFILES, CATEGORY_CAPS, categoryForTags, englishName,
  type CategoryKey, type FactorCode,
} from "../src/seed/profiles.js";

const SEED = 20260906;
const CACHE = resolve(import.meta.dirname, "../../data/cache/overpass-vellore.json");

const FEMALE_NAMES = [
  "Aarthi", "Divya", "Kavya", "Meena", "Nandhini", "Priya", "Revathi", "Sangeetha",
  "Swetha", "Vaishnavi", "Anitha", "Bhavana", "Deepa", "Gayathri", "Harini", "Ishwarya",
  "Janani", "Keerthi", "Lakshmi", "Madhumitha", "Nivetha", "Pavithra", "Ramya", "Sowmya",
  "Thamizh", "Uma", "Vidya", "Yamini", "Abinaya", "Charulatha", "Dhanya", "Ezhil",
  "Gowri", "Hemalatha", "Indhu", "Jeeva", "Kalpana", "Malathi", "Nithya", "Oviya",
];
const MALE_NAMES = ["Arun", "Bharath", "Dinesh", "Karthik", "Manoj", "Naveen", "Prakash", "Vignesh"];
const SURNAMES = ["Raman", "Krishnan", "Selvam", "Iyer", "Balan", "Murugan", "Sundaram", "Natarajan"];

const REVIEW_BODIES: Record<"good" | "mixed" | "poor", string[]> = {
  good: [
    "Well lit and usually busy. Felt fine on my own.",
    "Staff and shopkeepers around, easy to find help.",
    "Wide open, good visibility, plenty of people about.",
    "Comfortable stopping here by myself.",
  ],
  mixed: [
    "Fine when there are people around, quieter than I expected otherwise.",
    "Depends a lot on the time. Better earlier in the day.",
    "Lighting is patchy in places but it is walkable.",
  ],
  poor: [
    "Very little lighting and almost nobody around.",
    "Would rather not wait here alone for long.",
    "Hard to find a way out quickly if you needed to.",
  ],
};

type OsmElement = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

function addressFrom(tags: Record<string, string>): string | null {
  const parts = [tags["addr:housenumber"], tags["addr:street"], tags["addr:suburb"], tags["addr:city"]]
    .filter(Boolean);
  if (parts.length > 0) return parts.join(", ");
  return "Vellore, Tamil Nadu";
}

async function main() {
  const rand = mulberry32(SEED);

  console.log("Wiping existing data ...");
  await prisma.$executeRawUnsafe(
    `TRUNCATE review_factor_ratings, reviews, locations, location_categories, safety_factors, users RESTART IDENTITY CASCADE`,
  );

  // ---------------------------------------------------------------- reference data
  const categories = await prisma.locationCategory.createManyAndReturn({
    data: CATEGORIES.map((c) => ({ name: c.name })),
  });
  const categoryIdByKey = new Map<CategoryKey, number>(
    CATEGORIES.map((c, i) => [c.key, categories[i]!.id]),
  );

  const factors = await prisma.safetyFactor.createManyAndReturn({ data: [...FACTORS] });
  const factorIdByCode = new Map<FactorCode, number>(
    FACTORS.map((f, i) => [f.code, factors[i]!.id]),
  );
  console.log(`Reference data: ${categories.length} categories, ${factors.length} factors`);

  // ---------------------------------------------------------------- locations
  const raw = JSON.parse(await readFile(CACHE, "utf8")) as { elements: OsmElement[] };
  const byCategory = new Map<CategoryKey, NewLocation[]>();
  const seenNames = new Set<string>();
  const dropped: string[] = [];

  for (const el of raw.elements) {
    const tags = el.tags;
    if (!tags?.name) continue;
    const key = categoryForTags(tags);
    if (!key) continue;

    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat === undefined || lon === undefined) continue;

    const name = englishName(tags);
    if (name === null) {
      dropped.push(tags.name.trim()); // no English name available — see englishName()
      continue;
    }
    if (seenNames.has(name.toLowerCase())) continue; // OSM repeats names across nodes
    seenNames.add(name.toLowerCase());

    const bucket = byCategory.get(key) ?? [];
    bucket.push({ name, categoryId: categoryIdByKey.get(key)!, address: addressFrom(tags), lat, lng: lon });
    byCategory.set(key, bucket);
  }

  const chosen: NewLocation[] = [];
  const categoryOfIndex: CategoryKey[] = [];
  for (const { key } of CATEGORIES) {
    const pool = shuffled(rand, byCategory.get(key) ?? []);
    for (const loc of pool.slice(0, CATEGORY_CAPS[key])) {
      chosen.push(loc);
      categoryOfIndex.push(key);
    }
  }

  const inserted = await insertLocations(chosen);
  console.log(`Locations: ${inserted.length} inserted`);
  if (dropped.length > 0) {
    console.warn(
      `Dropped ${dropped.length} place(s) with no English name and no override in ` +
        `NAME_OVERRIDES: ${dropped.join(", ")}`,
    );
  }

  // ---------------------------------------------------------------- users
  // One bcrypt hash reused across seed accounts. Real registrations hash per user;
  // hashing 48 times here would just make seeding slow for no benefit.
  const seedHash = await bcrypt.hash("password123", 10);
  const demoHash = await bcrypt.hash("demo1234", 10);

  const userData = [
    ...FEMALE_NAMES.map((first, i) => ({
      email: `${first.toLowerCase()}.${SURNAMES[i % SURNAMES.length]!.toLowerCase()}${i}@example.com`,
      displayName: `${first} ${SURNAMES[i % SURNAMES.length]}`,
      passwordHash: seedHash,
      gender: "female" as const,
    })),
    ...MALE_NAMES.map((first, i) => ({
      email: `${first.toLowerCase()}.${SURNAMES[i % SURNAMES.length]!.toLowerCase()}${i}@example.com`,
      displayName: `${first} ${SURNAMES[i % SURNAMES.length]}`,
      passwordHash: seedHash,
      gender: "male" as const,
    })),
    { email: "demo.female@safeway.test", displayName: "Demo (female)", passwordHash: demoHash, gender: "female" as const },
    { email: "demo.male@safeway.test", displayName: "Demo (male)", passwordHash: demoHash, gender: "male" as const },
  ];
  const users = await prisma.user.createManyAndReturn({ data: userData });
  // Demo accounts are deliberately excluded from seeded reviews, so all four
  // buckets on every place are free during a live demo.
  const femaleIds = users
    .filter((u) => u.gender === "female" && !u.email.endsWith("@safeway.test"))
    .map((u) => u.id);
  console.log(
    `Users: ${users.length} (${users.filter((u) => u.gender === "female").length} female, ` +
      `${users.filter((u) => u.gender === "male").length} male); ${femaleIds.length} seed reviewers`,
  );

  // ---------------------------------------------------------------- reviews
  // 5 locations are left under 3 reviews so the "insufficient data" state is visible.
  // 3 are contested: same place, high disagreement between reviewers.
  //
  // Contested picks must sit in mid-range categories. Choosing a hostel (base ~4.0)
  // hides the effect: high noise clamps at 5 and the variance is compressed away.
  // Index ranges follow CATEGORIES order: bus_stop 0-15, cafe 16-27, park 28-34,
  // market 35-42, hostel 43-47, atm 48-54, hospital 55-66, college 67-74.
  const sparse = new Set([4, 17, 33, 51, 66].map((i) => i % inserted.length));
  const contested = new Set([9, 28, 38].map((i) => i % inserted.length));

  type ReviewSeed = {
    userId: number; locationId: number; visitedAt: Date; timeBucket: Bucket;
    body: string | null; createdAt: Date; scores: Map<FactorCode, number>;
  };
  const reviewSeeds: ReviewSeed[] = [];

  for (let i = 0; i < inserted.length; i++) {
    const location = inserted[i]!;
    const key = categoryOfIndex[i]!;
    const profile = PROFILES[key];
    const sigma = contested.has(i) ? 1.45 : 0.55;

    // A per-location offset on top of the category profile, so two bus stops are
    // not identical.
    const locationOffset = new Map<FactorCode, number>(
      FACTORS.map((f) => [f.code, gaussian(rand) * 0.35]),
    );

    // Reviewers are drawn per bucket, so the same woman may rate this place in
    // more than one part of the day — which the (user, location, bucket) unique
    // constraint permits and the product depends on.
    const plan: { bucket: Bucket; userId: number }[] = [];
    if (sparse.has(i)) {
      const pool = shuffled(rand, femaleIds);
      for (let n = 0; n < intBetween(rand, 1, 2); n++) {
        plan.push({ bucket: TIME_BUCKETS[intBetween(rand, 0, 3)]!, userId: pool[n]! });
      }
    } else {
      for (const bucket of TIME_BUCKETS) {
        const n = intBetween(rand, 3, 5);
        for (const userId of shuffled(rand, femaleIds).slice(0, n)) {
          plan.push({ bucket, userId });
        }
      }
    }

    for (const { bucket, userId } of plan) {

      const daysAgo = intBetween(rand, 1, 545); // ~18 months
      const hours = BUCKET_HOURS[bucket];
      const hour = hours[intBetween(rand, 0, hours.length - 1)]!;
      const visitedAt = istInstant(daysAgo, hour, intBetween(rand, 0, 59));
      const createdAt = new Date(visitedAt.getTime() + intBetween(rand, 1, 72) * 3_600_000);

      const scores = new Map<FactorCode, number>();
      let total = 0;
      for (const f of FACTORS) {
        const base = profile.base[f.code];
        const delta = profile.deltas[bucket][f.code] ?? 0;
        const value = base + delta + locationOffset.get(f.code)! + gaussian(rand) * sigma;
        const score = clamp(Math.round(value), 1, 5);
        scores.set(f.code, score);
        total += score;
      }

      const mean = total / FACTORS.length;
      const tone = mean >= 3.8 ? "good" : mean >= 2.8 ? "mixed" : "poor";
      const pool = REVIEW_BODIES[tone];
      const body = rand() < 0.4 ? pool[intBetween(rand, 0, pool.length - 1)]! : null;

      reviewSeeds.push({
        userId, locationId: location.id, visitedAt, timeBucket: bucket, body, createdAt, scores,
      });
    }
  }

  const createdReviews = await prisma.review.createManyAndReturn({
    data: reviewSeeds.map((r) => ({
      userId: r.userId, locationId: r.locationId, visitedAt: r.visitedAt,
      timeBucket: r.timeBucket, body: r.body, createdAt: r.createdAt,
    })),
    select: { id: true },
  });

  const ratings = createdReviews.flatMap((row, idx) =>
    FACTORS.map((f) => ({
      reviewId: row.id,
      factorId: factorIdByCode.get(f.code)!,
      score: reviewSeeds[idx]!.scores.get(f.code)!,
    })),
  );
  await prisma.reviewFactorRating.createMany({ data: ratings });

  console.log(`Reviews: ${createdReviews.length}, factor ratings: ${ratings.length}`);
  console.log(`Sparse (<3 reviews): ${[...sparse].map((i) => inserted[i]!.name).join(", ")}`);
  console.log(`Contested (high reviewer disagreement): ${[...contested].map((i) => inserted[i]!.name).join(", ")}`);
  await prisma.$disconnect();
  await flushCache();
}

/**
 * Seeding rewrites every row behind the API's back, so cached responses would be
 * stale for up to a TTL. Drop them. Redis being down is fine: there is nothing to drop.
 */
async function flushCache() {
  // Its own client with no reconnects: the shared one retries forever, which would
  // keep this script from ever exiting while Redis is down.
  const redis = createClient({ url: env.REDIS_URL, socket: { reconnectStrategy: false } });
  redis.on("error", () => {});
  try {
    await redis.connect();
  } catch {
    console.log("Cache: Redis not reachable, nothing to flush");
    return;
  }
  let dropped = 0;
  for await (const keys of redis.scanIterator({ MATCH: "sw:*", COUNT: 100 })) {
    if (keys.length > 0) dropped += await redis.del(keys);
  }
  await redis.close();
  console.log(`Cache: ${dropped} key(s) flushed`);
}

await main();
