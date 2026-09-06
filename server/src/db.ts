import { Prisma, PrismaClient } from "./generated/prisma/index.js";

/**
 * Set PRISMA_LOG_QUERIES=1 to emit query events. Used to prove endpoints issue the
 * query count they claim (no N+1) — see the Phase 2 evidence.
 */
const log: Prisma.LogDefinition[] =
  process.env.PRISMA_LOG_QUERIES === "1" ? [{ emit: "event", level: "query" }] : [];

export const prisma = new PrismaClient({ log });
