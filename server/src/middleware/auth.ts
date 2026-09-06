import type { NextFunction, Request, Response } from "express";
import { prisma } from "../db.js";
import { userIdFromToken } from "../lib/auth.js";

export type AuthedUser = { id: number; email: string; displayName: string; gender: string };

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthedUser;
    }
  }
}

/** Loads the user fresh from the database on every request. Never trusts token claims. */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  const id = token ? userIdFromToken(token) : null;
  if (id === null) {
    res.status(401).json({ error: "sign in to continue" });
    return;
  }
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, displayName: true, gender: true },
  });
  if (!user) {
    res.status(401).json({ error: "sign in to continue" });
    return;
  }
  req.user = user;
  next();
}

/**
 * Layer 1 of the write gate. Layer 2 is a BEFORE INSERT trigger on reviews, which
 * holds even when this code is bypassed entirely.
 */
export function requireFemale(req: Request, res: Response, next: NextFunction) {
  if (req.user?.gender !== "female") {
    res.status(403).json({
      error: "read_only_account",
      message:
        "Anyone can read the map. Only accounts registered as female can post a review.",
    });
    return;
  }
  next();
}
