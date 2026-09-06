import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../env.js";

const TOKEN_TTL = "7d";

export const hashPassword = (plain: string) => bcrypt.hash(plain, 10);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

/**
 * The token carries the user id and nothing else — deliberately.
 *
 * If gender were a claim, a tampered or stale token could grant write access. The
 * write gate reads gender from the database on every request instead, so forging a
 * claim achieves nothing even if the secret leaked.
 */
export function signToken(userId: number): string {
  return jwt.sign({}, env.JWT_SECRET, { subject: String(userId), expiresIn: TOKEN_TTL });
}

export function userIdFromToken(token: string): number | null {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    if (typeof payload === "string" || !payload.sub) return null;
    const id = Number(payload.sub);
    return Number.isInteger(id) ? id : null;
  } catch {
    return null;
  }
}
