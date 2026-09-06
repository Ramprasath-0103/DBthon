import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { hashPassword, verifyPassword, signToken } from "../lib/auth.js";
import { requireAuth } from "../middleware/auth.js";

export const authRouter = Router();

const Credentials = z.object({
  email: z.string().email().max(200),
  password: z.string().min(8).max(200),
});

const Registration = Credentials.extend({
  displayName: z.string().min(1).max(60),
  gender: z.enum(["female", "male", "other"]),
});

function publicUser(u: { id: number; email: string; displayName: string; gender: string }) {
  return {
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    gender: u.gender,
    canReview: u.gender === "female",
  };
}

authRouter.post("/auth/register", async (req, res) => {
  const parsed = Registration.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const { email, password, displayName, gender } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    res.status(409).json({ error: "email_taken", message: "That email is already registered." });
    return;
  }

  const user = await prisma.user.create({
    data: { email, displayName, gender, passwordHash: await hashPassword(password) },
    select: { id: true, email: true, displayName: true, gender: true },
  });
  res.status(201).json({ token: signToken(user.id), user: publicUser(user) });
});

authRouter.post("/auth/login", async (req, res) => {
  const parsed = Credentials.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input" });
    return;
  }
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  // Same response for unknown email and wrong password, so this cannot be used to
  // discover which addresses are registered.
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    res.status(401).json({ error: "invalid_credentials", message: "Email or password is wrong." });
    return;
  }
  res.json({ token: signToken(user.id), user: publicUser(user) });
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user!) });
});

/**
 * Erasure by anonymisation. Reviews are never cascade-deleted: the personal link is
 * destroyed while the aggregate safety data everyone else relies on survives.
 */
authRouter.delete("/me", requireAuth, async (req, res) => {
  const id = req.user!.id;
  const [anonymised] = await prisma.$transaction([
    prisma.review.updateMany({ where: { userId: id }, data: { userId: null } }),
    prisma.user.delete({ where: { id } }),
  ]);
  res.json({ deleted: true, reviewsAnonymised: anonymised.count });
});
