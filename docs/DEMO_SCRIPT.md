# Demo script — 4 beats, about 3 minutes

## Before you start

```bash
docker compose up -d
cd server && npm run db:seed && npm run dev
cd web && npm run dev
```

Open <http://localhost:5174>, **signed out**, slider on **Afternoon**. Re-seeding takes
under a second, so if a rehearsal leaves stray reviews behind, just run `npm run db:seed`
again.

One dependency you do not control: map tiles come from `tile.openstreetmap.org`. Load the
page once on the demo network before you present.

---

## Beat 1 — the map (20s)

> "This is Vellore. Seventy-five real places — bus stops, parks, ATMs, hospitals — each
> rated by women on six specific safety factors. Green is safer. Grey means fewer than
> three reviews, so we refuse to show a score at all."

Point at a grey pin. Do not click yet.

## Beat 2 — the slider (40s) — **this is the demo**

> "Every other review site gives a place one score. But a bus stop at 2pm and the same bus
> stop at 10pm are not the same place."

Drag the slider slowly from **Afternoon** to **Night**.

> "Same seventy-five places. Bus stops and ATMs collapse. Hospitals and cafés barely move."

Numbers if asked: at afternoon 23 pins are "Safer" and none are "Low"; at night 3 are
"Safer" and 20 are "Low". The grey pins stay grey in both.

## Beat 3 — why a place is unsafe (30s)

Click **Vellore Old Bus Stand**, slider on **Night**.

> "It's not one number. Lighting drops from 4 to 1.25. Freedom from harassment, 4 to 1.25.
> But transport access actually goes *up* — the buses still run. The problem isn't getting
> there, it's waiting there."

Drag back to Afternoon with the panel open. Same place, different profile.

## Beat 4 — who gets to write (60s)

Sign in as **`demo.male@safeway.test` / `demo1234`**.

> "Anyone can read this map. I'm signed in as a male account."

Click any pin. The header reads *Read-only*; the panel shows the notice, with no rate button.

> "And this isn't just the button being hidden. There's a trigger in Postgres that refuses
> the insert even if you bypass the API completely with a direct database connection.
> There's a test that does exactly that."

Sign out. Sign in as **`demo.female@safeway.test` / `demo1234`**.

Click **Nethajimarket**, hit **Rate this place**, set the visit time to **10:30 PM**, drag
Lighting / Security / Harassment down to 1, submit.

> "I said I was there at half ten at night. I never told it which time bucket that is — the
> database worked that out."

The slider jumps to **Night** on its own and the score drops.

If you have time, rate the *same* place again with a 9am visit:

> "Same place, same account, but a different time of day — so it's a separate review. That
> constraint is `UNIQUE(user_id, location_id, time_bucket)`, and the bucket in it is the one
> the database derived, not one I typed."

---

## If something breaks

| Symptom | Fix |
|---|---|
| Map is a dark rectangle | No internet — tiles are remote. Nothing else is. |
| "Could not reach the API" | The server on 8787 died. `cd server && npm run dev` |
| "You have already rated this place for that time of day" | Change the visit time to a different part of the day. The demo accounts start with zero reviews, so all four buckets are free. |
| Scores look wrong after rehearsing | `cd server && npm run db:seed` |
