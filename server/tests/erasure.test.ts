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

/**
 * India's DPDP Act 2023 grants a right to erasure. Deleting an account must destroy
 * the personal link without destroying the aggregate safety data other women rely on.
 */
describe("DELETE /api/me anonymises rather than cascade-deletes", () => {
  it("keeps the review and its effect on the score after the author is gone", async () => {
    const email = `erase.${Date.now()}@test.local`;
    const reg = await (
      await fetch(`${base}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: "password123", displayName: "Erase Me", gender: "female" }),
      })
    ).json();

    const location = await prisma.location.findFirstOrThrow({ select: { id: true } });
    const posted = await (
      await fetch(`${base}/api/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${reg.token}` },
        body: JSON.stringify({
          locationId: location.id,
          visitedAt: "2026-09-01T14:00:00+05:30",
          ratings: { lighting: 5, security_presence: 5, crowd_density: 5, transport_access: 5, harassment_free: 5, escape_routes: 5 },
        }),
      })
    ).json();

    const before = await prisma.$queryRaw<{ n: number }[]>`
      SELECT sample_size::int AS n FROM location_safety_score
      WHERE location_id = ${location.id} AND time_bucket = ${posted.timeBucket}::"TimeBucket"`;

    const del = await (
      await fetch(`${base}/api/me`, { method: "DELETE", headers: { Authorization: `Bearer ${reg.token}` } })
    ).json();
    expect(del).toEqual({ deleted: true, reviewsAnonymised: 1 });

    // The user is gone.
    expect(await prisma.user.findUnique({ where: { email } })).toBeNull();

    // The review survives, with no author.
    const review = await prisma.review.findUniqueOrThrow({ where: { id: posted.id } });
    expect(review.userId).toBeNull();

    // Its six ratings survive, so the sample size is unchanged.
    expect(await prisma.reviewFactorRating.count({ where: { reviewId: posted.id } })).toBe(6);
    const after = await prisma.$queryRaw<{ n: number }[]>`
      SELECT sample_size::int AS n FROM location_safety_score
      WHERE location_id = ${location.id} AND time_bucket = ${posted.timeBucket}::"TimeBucket"`;
    expect(after[0]!.n).toBe(before[0]!.n);

    // The token no longer authenticates anyone.
    const me = await fetch(`${base}/api/me`, { headers: { Authorization: `Bearer ${reg.token}` } });
    expect(me.status).toBe(401);

    await prisma.review.delete({ where: { id: posted.id } });
  });
});
