import express from "express";
import cors from "cors";
import { env } from "./env.js";
import { prisma } from "./db.js";
import { publicRouter } from "./routes/public.js";

export function createApp() {
  const app = express();
  app.use(cors({ origin: env.WEB_ORIGIN }));
  app.use(express.json());

  // Cheap liveness + proof the PostGIS-enabled database is actually reachable.
  app.get("/health", async (_req, res) => {
    const rows = await prisma.$queryRaw<
      { postgis_version: string; now: Date }[]
    >`SELECT postgis_version() AS postgis_version, now() AS now`;
    res.json({ ok: true, db: "up", postgis: rows[0]?.postgis_version ?? null });
  });

  app.use("/api", publicRouter);

  return app;
}
