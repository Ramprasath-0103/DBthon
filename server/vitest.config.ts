import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Every test file talks to the same database. Running them in parallel lets one
    // file's inserts change another file's sample counts mid-assertion, which shows up
    // as a flake that looks like a product bug. The whole suite runs in under a second,
    // so sequencing costs nothing.
    fileParallelism: false,
    sequence: { concurrent: false },
    // Tests use Redis database 1 so a FLUSHDB per file never touches dev data.
    // Set here, not in .env: dotenv does not override variables that already exist.
    env: { REDIS_URL: "redis://localhost:6380/1" },
  },
});
