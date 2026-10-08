import "dotenv/config";
import { z } from "zod";

// Fail loudly at boot rather than mysteriously at request time.
const schema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(8787),
  JWT_SECRET: z.string().min(8),
  WEB_ORIGIN: z.string().url().default("http://localhost:5174"),
  REDIS_URL: z.string().url().default("redis://localhost:6380"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment. Check server/.env\n", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
