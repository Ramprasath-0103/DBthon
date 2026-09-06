import { z } from "zod";
import { prisma } from "../db.js";
import { TIME_BUCKETS, type Bucket } from "../lib/time.js";

/**
 * Raw-SQL rows are parsed through Zod before leaving this module. Two reasons:
 * $queryRaw has no compile-time guarantee that the SQL matches the type parameter,
 * and Postgres NUMERIC/COUNT come back as Prisma.Decimal / BigInt, which throw on
 * JSON.stringify. Every numeric is cast in SQL (::float8, ::int); Zod is what makes
 * a missed cast fail loudly in tests instead of silently on stage.
 */

const NearbyRow = z.object({
  id: z.number().int(),
  name: z.string(),
  category: z.string(),
  address: z.string().nullable(),
  lat: z.number(),
  lng: z.number(),
  distanceM: z.number(),
  morningScore: z.number().nullable(),
  morningN: z.number().int(),
  afternoonScore: z.number().nullable(),
  afternoonN: z.number().int(),
  eveningScore: z.number().nullable(),
  eveningN: z.number().int(),
  nightScore: z.number().nullable(),
  nightN: z.number().int(),
});

export type NearbyLocation = {
  id: number;
  name: string;
  category: string;
  address: string | null;
  lat: number;
  lng: number;
  distanceM: number;
  buckets: Record<Bucket, { score: number | null; sampleSize: number }>;
};

/**
 * ONE query. All four time buckets are pivoted into columns with FILTER, so the
 * client can prefetch everything on load and recolour the map with zero network
 * traffic while the slider is dragged.
 */
export async function findNearby(lat: number, lng: number, radiusM: number): Promise<NearbyLocation[]> {
  const rows = await prisma.$queryRaw`
    SELECT l.id,
           l.name,
           c.name    AS "category",
           l.address,
           ST_Y(l.geog::geometry)::float8 AS "lat",
           ST_X(l.geog::geometry)::float8 AS "lng",
           ST_Distance(l.geog, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography)::float8 AS "distanceM",
           (max(s.score) FILTER (WHERE s.time_bucket = 'morning'))::float8   AS "morningScore",
           coalesce(max(s.sample_size) FILTER (WHERE s.time_bucket = 'morning'), 0)::int   AS "morningN",
           (max(s.score) FILTER (WHERE s.time_bucket = 'afternoon'))::float8 AS "afternoonScore",
           coalesce(max(s.sample_size) FILTER (WHERE s.time_bucket = 'afternoon'), 0)::int AS "afternoonN",
           (max(s.score) FILTER (WHERE s.time_bucket = 'evening'))::float8   AS "eveningScore",
           coalesce(max(s.sample_size) FILTER (WHERE s.time_bucket = 'evening'), 0)::int   AS "eveningN",
           (max(s.score) FILTER (WHERE s.time_bucket = 'night'))::float8     AS "nightScore",
           coalesce(max(s.sample_size) FILTER (WHERE s.time_bucket = 'night'), 0)::int     AS "nightN"
    FROM locations l
    JOIN location_categories c ON c.id = l.category_id
    LEFT JOIN location_safety_score s ON s.location_id = l.id
    WHERE ST_DWithin(l.geog, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${radiusM})
    GROUP BY l.id, l.name, c.name, l.address, l.geog
    ORDER BY "distanceM"`;

  return NearbyRow.array()
    .parse(rows)
    .map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      address: r.address,
      lat: r.lat,
      lng: r.lng,
      distanceM: Math.round(r.distanceM),
      buckets: {
        morning: { score: r.morningScore, sampleSize: r.morningN },
        afternoon: { score: r.afternoonScore, sampleSize: r.afternoonN },
        evening: { score: r.eveningScore, sampleSize: r.eveningN },
        night: { score: r.nightScore, sampleSize: r.nightN },
      },
    }));
}

const DetailRow = z.object({
  id: z.number().int(),
  name: z.string(),
  category: z.string(),
  address: z.string().nullable(),
  lat: z.number(),
  lng: z.number(),
});

const BreakdownRow = z.object({
  timeBucket: z.enum(TIME_BUCKETS),
  code: z.string(),
  label: z.string(),
  displayOrder: z.number().int(),
  avgScore: z.number(),
});

const ScoreRow = z.object({
  timeBucket: z.enum(TIME_BUCKETS),
  score: z.number().nullable(),
  sampleSize: z.number().int(),
});

/** Review text only. No author, ever — see the defamation and privacy posture in the README. */
const NoteRow = z.object({ body: z.string(), timeBucket: z.enum(TIME_BUCKETS) });

export type LocationDetail = {
  id: number;
  name: string;
  category: string;
  address: string | null;
  lat: number;
  lng: number;
  buckets: Record<
    Bucket,
    { score: number | null; sampleSize: number; factors: { code: string; label: string; avg: number }[] }
  >;
  notes: { body: string; timeBucket: Bucket }[];
};

export async function findLocationDetail(id: number): Promise<LocationDetail | null> {
  const base = DetailRow.array().parse(
    await prisma.$queryRaw`
      SELECT l.id, l.name, c.name AS "category", l.address,
             ST_Y(l.geog::geometry)::float8 AS "lat",
             ST_X(l.geog::geometry)::float8 AS "lng"
      FROM locations l JOIN location_categories c ON c.id = l.category_id
      WHERE l.id = ${id}`,
  );
  const row = base[0];
  if (!row) return null;

  const [scores, breakdown, notes] = await Promise.all([
    prisma.$queryRaw`
      SELECT time_bucket AS "timeBucket", score::float8 AS "score", sample_size::int AS "sampleSize"
      FROM location_safety_score WHERE location_id = ${id}`,
    prisma.$queryRaw`
      SELECT r.time_bucket AS "timeBucket", f.code, f.label,
             f.display_order::int AS "displayOrder",
             avg(rf.score)::float8 AS "avgScore"
      FROM reviews r
      JOIN review_factor_ratings rf ON rf.review_id = r.id
      JOIN safety_factors f ON f.id = rf.factor_id
      WHERE r.location_id = ${id}
      GROUP BY r.time_bucket, f.code, f.label, f.display_order
      ORDER BY f.display_order`,
    prisma.$queryRaw`
      SELECT body, time_bucket AS "timeBucket"
      FROM reviews
      WHERE location_id = ${id} AND body IS NOT NULL
      ORDER BY created_at DESC LIMIT 5`,
  ]);

  const scoreByBucket = new Map(
    ScoreRow.array().parse(scores).map((s) => [s.timeBucket, s]),
  );
  const factorsByBucket = new Map<Bucket, { code: string; label: string; avg: number }[]>();
  for (const b of BreakdownRow.array().parse(breakdown)) {
    const list = factorsByBucket.get(b.timeBucket) ?? [];
    list.push({ code: b.code, label: b.label, avg: Math.round(b.avgScore * 100) / 100 });
    factorsByBucket.set(b.timeBucket, list);
  }

  const buckets = Object.fromEntries(
    TIME_BUCKETS.map((b) => {
      const s = scoreByBucket.get(b);
      const sampleSize = s?.sampleSize ?? 0;
      return [
        b,
        {
          score: s?.score ?? null,
          sampleSize,
          // Below 3 samples we publish nothing at all, not even the breakdown.
          factors: sampleSize >= 3 ? (factorsByBucket.get(b) ?? []) : [],
        },
      ];
    }),
  ) as LocationDetail["buckets"];

  return { ...row, buckets, notes: NoteRow.array().parse(notes) };
}
