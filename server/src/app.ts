import express from "express";
import cors from "cors";
import { env } from "./env.js";
import { prisma } from "./db.js";
import { publicRouter } from "./routes/public.js";
import { authRouter } from "./routes/auth.js";
import { reviewsRouter } from "./routes/reviews.js";
import { rateLimit, DEFAULT_RATE_LIMIT, type RateLimitOptions } from "./middleware/rateLimit.js";

export type AppOptions = {
  rateLimit?: RateLimitOptions;
  /** Set when running behind a reverse proxy, so req.ip is the client, not the proxy. */
  trustProxy?: boolean;
};

export function createApp(options: AppOptions = {}) {
  const app = express();
  if (options.trustProxy) app.set("trust proxy", 1);
  app.use(cors({ origin: env.WEB_ORIGIN }));
  // After cors so the browser can read a 429; before the body parser so a rejected
  // request costs nothing. /health is outside /api and never limited.
  app.use("/api", rateLimit(options.rateLimit ?? DEFAULT_RATE_LIMIT));
  app.use(express.json());

  // Cheap liveness + proof the PostGIS-enabled database is actually reachable.
  app.get("/health", async (_req, res) => {
    const rows = await prisma.$queryRaw<
      { postgis_version: string; now: Date }[]
    >`SELECT postgis_version() AS postgis_version, now() AS now`;
    res.json({ ok: true, db: "up", postgis: rows[0]?.postgis_version ?? null });
  });

  // Three routers, deliberately separate. Nothing on publicRouter may expose gender;
  // a test walks that router's own stack and asserts it.
  app.use("/api", publicRouter);
  app.use("/api", authRouter);
  app.use("/api", reviewsRouter);

  return app;
}
