# SafeWay — architecture

## Shape

```
  React 18 + Vite          Express 5              PostgreSQL 16 + PostGIS 3.4
  ┌──────────────┐         ┌─────────────┐        ┌──────────────────────────┐
  │ Leaflet map  │         │ publicRouter│        │ 6 tables                 │
  │ time slider  │◄──────► │ authRouter  │◄─────► │ 1 view                   │
  │ detail panel │  /api   │reviewsRouter│ Prisma │ 1 BEFORE INSERT trigger  │
  └──────────────┘         └─────────────┘  6.19  └──────────────────────────┘
        │                                              ▲
        └── one fetch on load, all 4 buckets            │
            slider then runs entirely client-side       │ raw SQL only for
                                                        │ geography + scoring
```

Everything runs on one laptop. There is no deployment.

## Data model

Six tables. `users`, `location_categories`, `locations`, `safety_factors`, `reviews`,
`review_factor_ratings` — plus one view, `location_safety_score`.

Two things are unusual and deliberate:

**`locations.geog` is a PostGIS `geography(Point,4326)` that Prisma cannot model.** It is
declared `Unsupported()` in `schema.prisma`. Prisma responds by removing `create`,
`createMany` and `upsert` from `LocationDelegate` entirely — `prisma.location.create()` is a
*compile error*, not a runtime surprise. All location writes go through raw SQL in
`src/repo/locations.ts`. The upside: the column is invisible to Prisma Client reads, so it
can never leak into an API response by accident.

**`location_safety_score` is a view, not a table.** There is no recompute job, no trigger,
no cache to invalidate. Posting a review changes the score on the next read, for free.

## Scoring

For a location and a time bucket:

```
review_mean(r)  = mean of that review's 6 factor ratings          (1..5)
score(loc, b)   = mean of review_mean over all reviews of loc in bucket b
sample_size     = count of those reviews
score           = NULL whenever sample_size < 3
```

The `NULL` below 3 samples is a hard rule, enforced in the view itself rather than in the
API or the UI. A single review must not be able to colour a pin, and a stranger must not be
able to reshape the map by submitting once.

**Why a plain mean here, and what we would change at scale.** With a few hundred reviews per
category the mean is honest and easy to explain. It has one known weakness: a location with
exactly 3 reviews is noisier than one with 30, yet both render the same. The standard fix is
Bayesian shrinkage toward the global mean:

```
score = (C·m + Σ rᵢ) / (C + n)      m = global mean, C ≈ 5 prior reviews
```

Because the score lives in a **view**, that is a one-expression change in one migration —
no application code, no backfill. It is left out today because the minimum-3 rule already
covers the failure it would prevent, and an unexplainable formula is worse than a slightly
naive one in a demo.

## Time buckets

`morning 05–11 · afternoon 11–17 · evening 17–21 · night 21–05`, in **Asia/Kolkata**.

The bucket is derived from `visited_at` by the `BEFORE INSERT` trigger, never sent by the
client. The API physically cannot desynchronise the two. The seed script computes buckets
independently in TypeScript, and re-seeding with the trigger active produced a byte-identical
score checksum across all 1085 reviews — two implementations agreeing.

## The write gate, twice

1. **Middleware** — `requireAuth` loads the user from the database, `requireFemale` checks
   `gender`. The JWT carries only a subject id: gender is *never* a token claim, so a forged
   or stale claim grants nothing.
2. **`BEFORE INSERT` trigger on `reviews`** — raises `insufficient_privilege` if the author
   is not female, and `check_violation` if there is no author at all.

Layer 2 exists because an application bug must not become a data-integrity breach.
`tests/write-gate.test.ts` opens a raw `pg` connection, bypasses the API completely, and
asserts Postgres refuses the insert.

## One review per person per place, per bucket

`UNIQUE(user_id, location_id, time_bucket)`. A woman can rate the same bus stop for morning,
afternoon, evening and night — four separate reviews — because a place genuinely is a
different place at those hours.

The subtlety: `time_bucket` is written by the `BEFORE INSERT` trigger, not by the client.
Unique constraints are checked *after* `BEFORE` triggers run, so the constraint applies to
the derived value. A client cannot dodge it by sending a different bucket than its
`visited_at` implies.

`user_id` is nullable, and NULLs do not collide in a unique index, so anonymised reviews are
unaffected by this constraint.

## Place names

The map is presented in English. Names resolve as: OSM `name:en` → OSM `int_name` →
`NAME_OVERRIDES` in `src/seed/profiles.ts` → drop. Anything still not in Latin script after
that is excluded from the seed rather than rendered in a script the audience cannot read.

## Erasure

`DELETE /api/me` nulls `reviews.user_id` and then deletes the user. Reviews are **never**
cascade-deleted: the personal link is destroyed while the aggregate safety data other women
rely on survives. `reviews.user_id` is nullable with `ON DELETE SET NULL` precisely so this
is possible.

## Framing constraints

- Colour is per venue, never per neighbourhood. There is no area heat overlay — a map that
  reddens whole localities becomes a redlining tool.
- Only aggregates are shown publicly. Review text appears in the detail panel with **no
  author attached**, and never names an individual.
- No public endpoint exposes gender. A test enumerates the public router's own stack and
  asserts it, so a route added later is covered automatically.
