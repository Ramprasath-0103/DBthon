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
the numbers below are reviewable. 75 locations, 50 users (41 female, 9 male), 1085 reviews,
6510 factor ratings.

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

## Notes

- The old Spring Boot attempt at `~/safeway` is untouched. Its container (`safeway-db`,
  port 5433) still runs independently of this one (`safeway-dbms-db`, port 5434).
- `locations.geog` is a PostGIS type Prisma cannot model. It is declared `Unsupported`,
  which means Prisma Client physically cannot write to `locations` — all location writes
  go through raw SQL. This is deliberate, not a workaround gone wrong.
- `location_safety_score` is a **view**, not a table. There is no recompute logic
  anywhere; posting a review moves the score on the next read.
