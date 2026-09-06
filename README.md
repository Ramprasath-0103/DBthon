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
cd server && npm install && npm run db:deploy && npm run dev
```

```bash
cd web && npm install && npm run dev
```

Then open <http://localhost:5174>.

## Useful

```bash
cd server && npm run db:reset     # wipe and re-migrate — recovers a botched rehearsal
```

## Notes

- The old Spring Boot attempt at `~/safeway` is untouched. Its container (`safeway-db`,
  port 5433) still runs independently of this one (`safeway-dbms-db`, port 5434).
- `locations.geog` is a PostGIS type Prisma cannot model. It is declared `Unsupported`,
  which means Prisma Client physically cannot write to `locations` — all location writes
  go through raw SQL. This is deliberate, not a workaround gone wrong.
- `location_safety_score` is a **view**, not a table. There is no recompute logic
  anywhere; posting a review moves the score on the next read.
