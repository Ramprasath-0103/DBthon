import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { findNearby, findLocationDetail } from "../repo/nearby.js";

/**
 * Everything mounted here is readable with no authentication.
 *
 * Nothing on this router may expose gender or any identity beyond a location name.
 * A test walks this router's own stack and asserts that — see tests/privacy.test.ts.
 */
export const publicRouter = Router();

// Vellore. The map is deliberately one city.
const DEFAULT_CENTER = { lat: 12.9165, lng: 79.1325 };

const NearbyQuery = z.object({
  lat: z.coerce.number().min(-90).max(90).default(DEFAULT_CENTER.lat),
  lng: z.coerce.number().min(-180).max(180).default(DEFAULT_CENTER.lng),
  radius_m: z.coerce.number().int().min(100).max(50_000).default(12_000),
});

publicRouter.get("/locations/nearby", async (req, res) => {
  const parsed = NearbyQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid query", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const { lat, lng, radius_m } = parsed.data;
  const locations = await findNearby(lat, lng, radius_m);
  res.json({ center: { lat, lng }, radiusM: radius_m, count: locations.length, locations });
});

publicRouter.get("/locations/:id", async (req, res) => {
  const id = z.coerce.number().int().positive().safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const detail = await findLocationDetail(id.data);
  if (!detail) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json(detail);
});

publicRouter.get("/factors", async (_req, res) => {
  const factors = await prisma.safetyFactor.findMany({
    orderBy: { displayOrder: "asc" },
    select: { code: true, label: true, displayOrder: true },
  });
  res.json({ factors });
});
