# SafeWay

A map where women rate places in **Vellore** on specific safety factors, tagged with the
time of day they visited. Scores are computed per location *per time bucket*, so dragging
a time slider from afternoon to night visibly recolours the map.

Anyone can read the map. Only accounts registered as female can post a review.

**Local only. Laptop only.** There is no deployment and no mobile layout. Target width
is 1366×768 and up.

## Stack

Node 22 · Express 5 · **Prisma 6.19.3** · PostgreSQL 16 + PostGIS 3.4 · React 18 · Vite 6
· Leaflet · Tailwind 3

## Ports

Chosen to avoid what is already running on this machine:

| Service  | Port | Why not the default |
|----------|------|---------------------|
| Postgres | 5434 | 5432 is your local Postgres, 5433 is the old `~/safeway` container |
| Redis    | 6380 | 6379 is your standalone `redis` container |
| API      | 8787 | 8080 is in use |
| Web      | 5174 | 5173 is in use |

## Run it

Three commands, two terminals.

```bash
docker compose up -d
```

```bash
cd server && npm install && npm run db:deploy && npm run db:seed && npm run dev
```

```bash
cd web && npm install && npm run dev
```

Optional — the review note check (Python + LangChain, in `server/ai/`). Set
`REVIEW_CHECK_API_KEY` in `server/.env`; without it the check is off and every note is accepted.

```bash
cd server && python3 -m venv ai/.venv && ai/.venv/bin/pip install -r ai/requirements.txt
```

Then open <http://localhost:5174>.

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
| POST | `/api/reviews` | bearer token **and** a female account |

## Tests

```bash
cd server && npm test
```

19 tests. The ones worth knowing about:

- `write-gate.test.ts` opens a raw `pg` connection, bypasses the API entirely, and asserts
  Postgres refuses a review from a male account — plus all 8 time-bucket boundaries, and
  that a JWT carrying a forged `gender: "female"` claim is ignored.
- `privacy.test.ts` enumerates the public router's own stack and asserts no response
  mentions gender. Mutation-tested: injecting a leak makes it fail.
- `erasure.test.ts` asserts deleting an account keeps the review, its 6 ratings, and the
  sample size intact.
- `write-gate.test.ts` also asserts one account can rate a single place in all four buckets,
  and that a fifth review repeating a bucket is refused by both the API and Postgres.

Test files run sequentially (`vitest.config.ts`): they share one database, and running them
in parallel let one file's inserts change another's sample counts mid-assertion.

## Docs

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — data model, scoring, the two-layer write gate
- [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md) — 4 beats with the exact click path
- [`docs/JUDGE_QA.md`](docs/JUDGE_QA.md) — scripted answers to the hard questions

## Look

Navy shell (`navy` palette in `web/tailwind.config.js`), and the SafeWay wordmark is set in
**Comfortaa** — a geometric sans with circular bowls and a single-storey `a`, chosen to match
the reference wordmark. Comfortaa, Poppins and Quicksand are **self-hosted** in
`web/public/fonts`, so the app never needs the network for its own chrome; only the map tiles
are remote. Swapping the wordmark font is one line in `tailwind.config.js` (`fontFamily.brand`).

## Notes

- The old Spring Boot attempt at `~/safeway` is untouched. Its container (`safeway-db`,
  port 5433) still runs independently of this one (`safeway-dbms-db`, port 5434).
- `locations.geog` is a PostGIS type Prisma cannot model. It is declared `Unsupported`,
  which means Prisma Client physically cannot write to `locations` — all location writes
  go through raw SQL. This is deliberate, not a workaround gone wrong.
- Redis (`safeway-dbms-redis`) is an optimisation, never a dependency. It caches the
  three public reads (factors 24 h; the default map view and each place's detail 10 min,
  dropped immediately whenever a review is posted) and enforces a sliding-window limit of
  100 requests per minute per IP on `/api`. If it is down, reads go to Postgres and
  nothing is limited. Responses carry `X-Cache: HIT|MISS` and `RateLimit-*` headers.
  Behind a reverse proxy, use `createApp({ trustProxy: true })` or every client shares
  the proxy's IP — and one limit. Tests use Redis database 1 and flush it per file.
- Review notes are judged by `server/ai/check_review.py` before anything is saved. It sends
  the place and the note (never the author) with `ai/review_check_prompt.txt`, and the model
  must answer in the shape of `ai/verdict.schema.json`. `good_to_go: false` → 422 and nothing
  is saved; true → the review is added. If the check cannot run, the review is added.
- `location_safety_score` is a **view**, not a table. There is no recompute logic
  anywhere; posting a review moves the score on the next read.
- Gender is **self-declared at registration**. The enforcement layer is real (middleware
  plus a Postgres trigger); the identity check is not. See `docs/JUDGE_QA.md`.
- **One review per person per place, per time bucket.** The same woman can rate a bus stop
  separately for morning, afternoon, evening and night — that is the point of the product.
  A repeat within the same bucket returns a clean 409, not a database error.
- Place names are shown in English. OSM's `name:en` / `int_name` tags are used when present,
  then an override table in `src/seed/profiles.ts`; anything still not in Latin script is
  dropped from the seed rather than shown in a script the audience cannot read.
- The two `@safeway.test` demo accounts are excluded from seeded reviews, so all four
  buckets on every place are free during a live demo.
