import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startTestServer } from "./helpers.js";
import { prisma } from "../src/db.js";
import { signToken } from "../src/lib/auth.js";
import { checkWithPython, type PlaceContext, type ReviewVerdict } from "../src/lib/reviewCheck.js";

// A fake checker for the route tests: no LLM call, no key, no cost.
let nextVerdict: ReviewVerdict | null = null;
const calls: { place: PlaceContext; note: string }[] = [];

let base: string;
let close: () => Promise<void>;
let userId: number;
let token: string;
let location: { id: number; name: string };

beforeAll(async () => {
  ({ base, close } = await startTestServer({
    reviewChecker: async (place, note) => {
      calls.push({ place, note });
      return nextVerdict;
    },
  }));
  const user = await prisma.user.create({
    data: { email: `check.${Date.now()}@test.local`, displayName: "Check Test", gender: "female", passwordHash: "x" },
  });
  userId = user.id;
  token = signToken(user.id);
  location = await prisma.location.findFirstOrThrow({ select: { id: true, name: true } });
});

afterAll(async () => {
  await prisma.review.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } });
  await close();
  await prisma.$disconnect();
});

const RATINGS = { lighting: 3, security_presence: 3, crowd_density: 3, transport_access: 3, harassment_free: 3, escape_routes: 3 };

// Each test uses its own time bucket: one review per place per person per bucket.
function post(visitedAt: string, body?: string) {
  calls.length = 0;
  return fetch(`${base}/api/reviews`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ locationId: location.id, visitedAt, body, ratings: RATINGS }),
  });
}

describe("POST /api/reviews with a note", () => {
  it("not good to go: 422, and the review is not saved", async () => {
    nextVerdict = { good_to_go: false, reason: "This reads like an advert, not a visit." };
    const res = await post("2026-09-01T08:00:00+05:30", "BUY CHEAP PHONES www.example.com");

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      error: "note_not_relevant",
      message: "This reads like an advert, not a visit. Edit your note or leave it out to post your ratings.",
    });
    expect(await prisma.review.count({ where: { userId } })).toBe(0);
  });

  it("good to go: the review is added, and only place + note reach the checker", async () => {
    nextVerdict = { good_to_go: true, reason: "Describes the place." };
    const res = await post("2026-09-01T14:00:00+05:30", "  Well lit, guards at the gate.  ");
    expect(res.status).toBe(201);

    const { place, note } = calls[0]!;
    expect(note).toBe("Well lit, guards at the gate.");
    expect(place.name).toBe(location.name);
    expect(Object.keys(place).sort()).toEqual(["address", "category", "name"]); // no author data

    const saved = await prisma.review.findFirstOrThrow({ where: { userId, timeBucket: "afternoon" } });
    expect(saved.body).toBe("Well lit, guards at the gate.");
  });

  it("no verdict (LLM down): the review is still added", async () => {
    nextVerdict = null;
    expect((await post("2026-09-01T18:00:00+05:30", "Crowded near the bus bay.")).status).toBe(201);
  });

  it("no note: the checker is never called", async () => {
    nextVerdict = { good_to_go: false, reason: "unused" };
    expect((await post("2026-09-01T23:00:00+05:30")).status).toBe(201);
    expect(calls).toHaveLength(0);
  });
});

describe("checkWithPython", () => {
  const place = { name: "Bus stand", category: "transit", address: "unknown" };
  const saved = { key: process.env.REVIEW_CHECK_API_KEY, url: process.env.REVIEW_CHECK_BASE_URL };
  afterAll(() => {
    for (const [k, v] of [["REVIEW_CHECK_API_KEY", saved.key], ["REVIEW_CHECK_BASE_URL", saved.url]] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("returns null without starting Python when no key is set", async () => {
    delete process.env.REVIEW_CHECK_API_KEY;
    expect(await checkWithPython(place, "dark at night")).toBeNull();
  });

  it("returns null, not an error, when the script runs but the LLM is unreachable", async () => {
    process.env.REVIEW_CHECK_API_KEY = "test";
    process.env.REVIEW_CHECK_BASE_URL = "http://127.0.0.1:9/v1"; // nothing listens here
    expect(await checkWithPython(place, "dark at night")).toBeNull();
  }, 40_000);
});
