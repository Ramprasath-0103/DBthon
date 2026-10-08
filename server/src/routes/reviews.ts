import { Router } from "express";
import { z } from "zod";
import { Prisma } from "../generated/prisma/index.js";
import { prisma } from "../db.js";
import { requireAuth, requireFemale } from "../middleware/auth.js";
import { FACTOR_COUNT } from "../lib/factors.js";
import { cacheKeys, invalidate } from "../cache.js";
import type { ReviewChecker } from "../lib/reviewCheck.js";

const NewReview = z.object({
  locationId: z.number().int().positive(),
  visitedAt: z.coerce.date(),
  body: z.string().max(500).trim().optional(),
  ratings: z.record(z.string(), z.number().int().min(1).max(5)),
});

/** The checker is injected so tests can substitute a fake and never call the LLM. */
export function createReviewsRouter(checkReview: ReviewChecker) {
  const reviewsRouter = Router();

  reviewsRouter.post("/reviews", requireAuth, requireFemale, async (req, res) => {
    const parsed = NewReview.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_input", details: parsed.error.flatten().fieldErrors });
      return;
    }
    const { locationId, visitedAt, body, ratings } = parsed.data;

    if (visitedAt.getTime() > Date.now()) {
      res.status(400).json({ error: "future_visit", message: "You cannot rate a visit that has not happened." });
      return;
    }

    const factors = await prisma.safetyFactor.findMany({ select: { id: true, code: true } });
    const missing = factors.filter((f) => ratings[f.code] === undefined).map((f) => f.code);
    if (missing.length > 0 || Object.keys(ratings).length !== FACTOR_COUNT) {
      res.status(400).json({ error: "incomplete_ratings", missing });
      return;
    }

    // Only a note is sent to the LLM. Not good to go → nothing is saved and she can
    // edit and resubmit; good to go, or no verdict at all → the review is added.
    const note = body && body.length > 0 ? body : null;
    if (note) {
      const place = await prisma.location.findUnique({
        where: { id: locationId },
        select: { name: true, address: true, category: { select: { name: true } } },
      });
      if (!place) {
        res.status(404).json(errorBody({ code: "23503" }));
        return;
      }
      const verdict = await checkReview(
        { name: place.name, category: place.category.name, address: place.address ?? "unknown" },
        note,
      );
      if (verdict?.good_to_go === false) {
        res.status(422).json({
          error: "note_not_relevant",
          message: `${verdict.reason} Edit your note or leave it out to post your ratings.`,
        });
        return;
      }
    }

    try {
      const review = await prisma.$transaction(async (tx) => {
        // time_bucket is overwritten by the BEFORE INSERT trigger; the value sent here
        // is a placeholder the database will replace.
        const created = await tx.review.create({
          data: {
            userId: req.user!.id,
            locationId,
            visitedAt,
            timeBucket: "morning",
            body: note,
          },
          select: { id: true, timeBucket: true },
        });
        // One statement for all six ratings.
        const values = factors.map((f) => Prisma.sql`(${created.id}, ${f.id}, ${ratings[f.code]!})`);
        await tx.$executeRaw`INSERT INTO review_factor_ratings (review_id, factor_id, score) VALUES ${Prisma.join(values)}`;
        return created;
      });

      // After commit, before anyone can read: the map and this place's detail now
      // reflect the new review on the very next request.
      await invalidate(cacheKeys.nearbyDefault, cacheKeys.location(locationId));

      // Return the freshly recomputed score so the map can update without a refetch.
      const scores = await prisma.$queryRaw<{ score: number | null; sampleSize: number }[]>`
        SELECT score::float8 AS "score", sample_size::int AS "sampleSize"
        FROM location_safety_score
        WHERE location_id = ${locationId} AND time_bucket = ${review.timeBucket}::"TimeBucket"`;

      res.status(201).json({
        id: review.id,
        locationId,
        timeBucket: review.timeBucket,
        score: scores[0]?.score ?? null,
        sampleSize: scores[0]?.sampleSize ?? 0,
      });
    } catch (err) {
      res.status(mapError(err)).json(errorBody(err));
    }
  });

  return reviewsRouter;
}

/** Postgres error codes raised by the schema and the write-gate trigger. */
function pgCode(err: unknown): string | undefined {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") return "23505"; // unique violation via Prisma Client
    if (err.code === "P2003") return "23503";
  }
  const meta = (err as { meta?: { code?: string } })?.meta;
  return meta?.code ?? (err as { code?: string })?.code;
}

function mapError(err: unknown): number {
  switch (pgCode(err)) {
    case "42501": return 403; // insufficient_privilege — the write-gate trigger fired
    case "23505": return 409; // one review per place per person per time bucket
    case "23503": return 404; // location does not exist
    default: return 500;
  }
}

function errorBody(err: unknown) {
  switch (pgCode(err)) {
    case "42501":
      return { error: "read_only_account", message: "Only accounts registered as female can post a review." };
    case "23505":
      return {
        error: "already_reviewed",
        message:
          "You have already rated this place for that time of day. Pick a different part of the day.",
      };
    case "23503":
      return { error: "unknown_location", message: "That place does not exist." };
    default:
      return { error: "server_error", message: "Could not save the review." };
  }
}
