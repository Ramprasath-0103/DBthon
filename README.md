# SafeWay

A map where women rate places in **Vellore** on specific safety factors, tagged with the
time of day they visited. Scores are computed per location *per time bucket*, so dragging
a time slider from afternoon to night visibly recolours the map.

Anyone can read the map. Only accounts registered as female can post a review.

**Local only. Laptop only.** There is no deployment and no mobile layout. Target width
is 1366×768 and up.

## Stack

Node 22 · Express 5 · **Prisma 6.19.3** · PostgreSQL 16 + PostGIS 3.4 · **Redis 7** · React 18
· Vite 6 · Leaflet · Tailwind 3 · Python 3.12 + **LangChain** (review check)

## Ports

| Service  | Port | 
|----------|------|
| Postgres | 5434 | 
| API      | 8787 |
| Web      | 5174 | 
| Redis    | 6380 |  

## Run it

Three commands, two terminals.

```bash
docker compose up -d          # Postgres + Redis
```

```bash
cd server && npm install && npm run db:deploy && npm run db:seed && npm run dev
```

```bash
cd web && npm install && npm run dev
```

Then open <http://localhost:5174>.

**Review check (optional).** Install its Python environment once, and set the key in
`server/.env` (copy `.env.example`). Without a key the check is off and every note is accepted.

```bash
cd server && python3 -m venv ai/.venv && ai/.venv/bin/pip install -r ai/requirements.txt
```

```bash
REVIEW_CHECK_BASE_URL="****"
REVIEW_CHECK_MODEL="***"
REVIEW_CHECK_API_KEY="..."
```

## Features

**Redis response cache.** The three public reads are cached as ready-to-send JSON.
Responses carry `X-Cache: HIT|MISS`.

| Key | Endpoint | TTL |
|---|---|---|
| `sw:factors` | `GET /api/factors` | 24 h — only the seed changes it |
| `sw:nearby:default` | `GET /api/locations/nearby` | 10 min |
| `sw:loc:{id}` | `GET /api/locations/:id` | 10 min |

Posting a review deletes the two keys it affects, so the map is fresh on the next request;
the TTL only covers writes that bypass the API (the seed script flushes the cache itself).

**Rate limit — 100 requests per minute per IP** on `/api`, as a sliding window: a Redis
sorted set of request timestamps, trimmed, counted and added to in one atomic Lua script.
Over the limit returns `429` with `Retry-After`; every response carries `RateLimit-Limit` /
`RateLimit-Remaining`, and the web app shows the wait time instead of a generic error.
Rejected requests are not counted, so a blocked client recovers as the window slides.

**Review note check.** Before a review with a note is saved, `server/ai/check_review.py`
(LangChain + `ChatOpenAI`) sends the place and the note — never the author — to the LLM with
`ai/review_check_prompt.txt`, and the answer must match `ai/verdict.schema.json`:
`{ "good_to_go": bool, "reason": string }`. `false` → `422` with the reason, nothing saved;
`true` → the review is added. It rejects only clear junk (gibberish, off-topic, another
named place); short, informal safety notes pass.

**Nothing new is a hard dependency.** If Redis is down, reads go straight to Postgres and
nothing is limited; if the LLM is unreachable, the review is added.

## How it keeps the database efficient

- **The map is one query, then zero.** `/nearby` returns all 75 places with all four time
  buckets in a single query (pivoted with `FILTER`), so the time slider never hits the network.
  After the first load that response comes from Redis, so Postgres stops re-aggregating every
  review through the `location_safety_score` view on each page view.
- **Writes invalidate precisely.** A review clears only the map key and that one place's key;
  everything else stays cached.
- **Bounded memory.** Redis is capped at 32 MB with `volatile-lru` and no persistence; real use
  is about 1.6 MB. Only the default map view is cached (arbitrary coordinates would let anyone
  fill memory) and `404`s never are. A client's rate-limit set holds at most 100 entries
  (~3.6 KB) and expires a minute after they go quiet.
- **Floods stop before the database.** The rate limiter runs before body parsing and before any
  query, so a burst of requests costs Redis lookups, not Postgres connections.
- **Junk never becomes a row.** The note check runs before the insert, so rejected notes leave
  nothing to clean up; ratings-only reviews skip the LLM entirely.
- **Indexes where the queries are:** a GiST index on `locations.geog` for the radius search,
  and `(location_id, time_bucket)` on reviews for the per-bucket scores.

## Useful

```bash
cd server && npm run db:reset      # wipe and re-migrate
cd server && npm run db:seed       # re-seed — recovers a botched rehearsal in under a second
cd server && npm run seed:fetch    # refetch from Overpass (only if you want fresher OSM data)
```

## Seed data

`data/cache/overpass-vellore.json` is a cached Overpass API response (262 real Vellore
elements) and is **committed**, so seeding never needs the network.

The seed is deterministic — the same RNG seed always produces identical data, which is why
the numbers below are reviewable. 75 locations, 50 users (41 female, 9 male; 40 of them
seeded reviewers), 1130 reviews, 6780 factor ratings.

Reviewers are drawn per time bucket, so some women have rated the same place at several
times of day — 136 person/place pairs cover two buckets, 13 cover three, and one covers
all four.

Reviews are not uniform noise. Each category has a hidden "true profile" in
`server/src/seed/profiles.ts` with a per-time-bucket modifier, and ratings are sampled
around it with Gaussian noise:

| Category | Morning | Afternoon | Evening | Night | Day–night gap |
|---|---|---|---|---|---|
| Bus stop | 3.58 | 3.94 | 3.41 | 2.10 | **1.84** |
| ATM / Bank | 3.12 | 3.34 | 2.84 | 1.66 | **1.69** |
| Park | **3.87** | 3.48 | 3.12 | 2.00 | 1.48 |
| Market | 3.49 | 3.73 | 3.52 | 2.53 | 1.21 |
| College | 3.90 | 3.96 | 3.63 | 3.01 | 0.95 |
| Café | 3.67 | 3.89 | 3.89 | 3.46 | 0.43 |
| Hostel | 3.69 | 3.62 | 3.52 | 3.34 | 0.27 |
| Hospital | 4.00 | 4.08 | 4.02 | 3.88 | **0.20** |

Two deliberate edge cases: 5 locations are left under 3 reviews so the "insufficient data"
state is visible, and 3 (Vellore New Bus Stand, Children's Park, Anna Bazaar) are contested
— reviewers genuinely disagree, at roughly 3x the median within-bucket spread.

## Demo accounts

| Email | Password | Can review? |
|---|---|---|
| `demo.female@safeway.test` | `demo1234` | yes |
| `demo.male@safeway.test` | `demo1234` | no, read-only |

All seeded users share the password `password123`.

## API

| Method | Path | Auth |
|---|---|---|
| GET | `/api/locations/nearby` | none — all 4 buckets in one response |
| GET | `/api/locations/:id` | none — per-factor breakdown, review text without authors |
| GET | `/api/factors` | none |
| POST | `/api/auth/register` | none |
| POST | `/api/auth/login` | none |
| GET | `/api/me` | bearer token |
| DELETE | `/api/me` | bearer token — anonymises reviews, then deletes the account |
| POST | `/api/reviews` | bearer token **and** a female account — `422` if the note is not about the place |

Every `/api` route is rate-limited (`429` past 100 requests a minute); `/health` is not.

## Tests

```bash
cd server && npm test
```

35 tests. They need Postgres and Redis running (tests use Redis database 1 and flush it per
file); none of them call the LLM. The ones worth knowing about:

- `write-gate.test.ts` opens a raw `pg` connection, bypasses the API entirely, and asserts
  Postgres refuses a review from a male account — plus all 8 time-bucket boundaries, and
  that a JWT carrying a forged `gender: "female"` claim is ignored.
- `privacy.test.ts` enumerates the public router's own stack and asserts no response
  mentions gender. Mutation-tested: injecting a leak makes it fail.
- `erasure.test.ts` asserts deleting an account keeps the review, its 6 ratings, and the
  sample size intact.
- `write-gate.test.ts` also asserts one account can rate a single place in all four buckets,
  and that a fifth review repeating a bucket is refused by both the API and Postgres.
- `cache.test.ts` asserts a second read is a byte-identical `HIT`, every key has its TTL,
  custom viewports and `404`s create no keys, a new review shows up on the next read, and the
  API still serves with Redis gone.
- `rate-limit.test.ts` proves the window *slides* (a fixed window would fail it), that clients
  are counted separately, and that a blocked client recovers.
- `review-check.test.ts` covers good to go, not good to go (nothing saved), no verdict
  (still saved), no note (checker never called), and the real Python script failing safely.

Test files run sequentially (`vitest.config.ts`): they share one database, and running them
in parallel let one file's inserts change another's sample counts mid-assertion.

## Docs

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — data model, scoring, the two-layer write gate
- [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md) — 4 beats with the exact click path
- [`docs/JUDGE_QA.md`](docs/JUDGE_QA.md) — scripted answers to the hard questions




