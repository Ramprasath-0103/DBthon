import { Prisma } from "../generated/prisma/index.js";
import { prisma } from "../db.js";

export type NewLocation = {
  name: string;
  categoryId: number;
  address: string | null;
  lat: number;
  lng: number;
};

/**
 * The ONLY way locations get written.
 *
 * locations.geog is a PostGIS type Prisma cannot model, so it is declared
 * Unsupported() in schema.prisma. Prisma then omits create/createMany/upsert from
 * LocationDelegate entirely — prisma.location.create() is a compile error. Raw SQL
 * is not a workaround here, it is the only path, and keeping it in one file is what
 * stops that fact from leaking across the codebase.
 */
export async function insertLocations(rows: NewLocation[]): Promise<{ id: number; name: string }[]> {
  if (rows.length === 0) return [];
  const values = rows.map(
    (r) => Prisma.sql`(${r.name}, ${r.categoryId}, ${r.address}, ST_SetSRID(ST_MakePoint(${r.lng}, ${r.lat}), 4326)::geography)`,
  );
  return prisma.$queryRaw<{ id: number; name: string }[]>`
    INSERT INTO locations (name, category_id, address, geog)
    VALUES ${Prisma.join(values)}
    RETURNING id, name`;
}
