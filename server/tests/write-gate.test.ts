import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import jwt from "jsonwebtoken";
import { startTestServer } from "./helpers.js";
import { prisma } from "../src/db.js";
import { env } from "../src/env.js";

let base: string;
let close: () => Promise<void>;
let pg: Client;
let maleId: number;
let femaleId: number;
let locationId: number;

const stamp = Date.now();
const emails = [`wg.male.${stamp}@test.local`, `wg.female.${stamp}@test.local`];

beforeAll(async () => {
  ({ base, close } = await startTestServer());
  pg = new Client({ connectionString: env.DATABASE_URL });
  await pg.connect();

  const male = await prisma.user.create({
    data: { email: emails[0]!, displayName: "WG Male", gender: "male", passwordHash: "x" },
  });
  const female = await prisma.user.create({
    data: { email: emails[1]!, displayName: "WG Female", gender: "female", passwordHash: "x" },
  });
  maleId = male.id;
  femaleId = female.id;
  locationId = (await prisma.location.findFirstOrThrow({ select: { id: true } })).id;
});

afterAll(async () => {
  await prisma.review.deleteMany({ where: { userId: { in: [maleId, femaleId] } } });
  await prisma.user.deleteMany({ where: { email: { in: emails } } });
  await pg.end();
  await close();
  await prisma.$disconnect();
});

const INSERT = `INSERT INTO reviews (user_id, location_id, visited_at, time_bucket)
                VALUES ($1, $2, $3, 'morning') RETURNING id, time_bucket`;

describe("layer 2: the database rejects what the API would have rejected", () => {
  it("blocks a male author inserted directly via pg, bypassing the API entirely", async () => {
    await expect(
      pg.query(INSERT, [maleId, locationId, new Date("2026-09-01T14:00:00+05:30")]),
    ).rejects.toMatchObject({
      code: "42501", // insufficient_privilege, raised by safeway_review_gate()
      message: expect.stringContaining("female"),
    });
  });

  it("blocks an authorless review", async () => {
    await expect(
      pg.query(INSERT, [null, locationId, new Date("2026-09-01T14:00:00+05:30")]),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("allows a female author and derives time_bucket from visited_at in IST", async () => {
    // 22:30 IST is the night bucket. The statement above sends 'morning'; the
    // trigger must overwrite it.
    const r = await pg.query(INSERT, [femaleId, locationId, new Date("2026-09-01T22:30:00+05:30")]);
    expect(r.rows[0].time_bucket).toBe("night");
    await pg.query("DELETE FROM reviews WHERE id = $1", [r.rows[0].id]);
  });

  it("derives every bucket boundary correctly", async () => {
    const cases: [string, string][] = [
      ["2026-09-01T05:00:00+05:30", "morning"],
      ["2026-09-01T10:59:00+05:30", "morning"],
      ["2026-09-01T11:00:00+05:30", "afternoon"],
      ["2026-09-01T16:59:00+05:30", "afternoon"],
      ["2026-09-01T17:00:00+05:30", "evening"],
      ["2026-09-01T20:59:00+05:30", "evening"],
      ["2026-09-01T21:00:00+05:30", "night"],
      ["2026-09-01T04:59:00+05:30", "night"],
    ];
    for (const [iso, expected] of cases) {
      const r = await pg.query(INSERT, [femaleId, locationId, new Date(iso)]);
      expect(r.rows[0].time_bucket, `${iso} should be ${expected}`).toBe(expected);
      await pg.query("DELETE FROM reviews WHERE id = $1", [r.rows[0].id]);
    }
  });
});

describe("layer 1: the API does not trust token claims", () => {
  it("ignores a forged gender claim on an otherwise valid token", async () => {
    // Signed with the REAL secret, for a real male user, carrying a female claim.
    const token = jwt.sign({ gender: "female", canReview: true }, env.JWT_SECRET, {
      subject: String(maleId),
    });
    const res = await fetch(`${base}/api/reviews`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        locationId,
        visitedAt: "2026-09-01T14:00:00+05:30",
        ratings: { lighting: 3, security_presence: 3, crowd_density: 3, transport_access: 3, harassment_free: 3, escape_routes: 3 },
      }),
    });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("read_only_account");
  });

  it("rejects a token signed with the wrong secret", async () => {
    const token = jwt.sign({}, "not-the-real-secret", { subject: String(femaleId) });
    const res = await fetch(`${base}/api/reviews`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ locationId, visitedAt: "2026-09-01T14:00:00+05:30", ratings: {} }),
    });
    expect(res.status).toBe(401);
  });
});
