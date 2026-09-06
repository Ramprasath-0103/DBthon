import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startTestServer } from "./helpers.js";
import { publicRouter } from "../src/routes/public.js";
import { prisma } from "../src/db.js";

let base: string;
let close: () => Promise<void>;

beforeAll(async () => ({ base, close } = await startTestServer()));
afterAll(async () => {
  await close();
  await prisma.$disconnect();
});

/** Enumerated from the router itself, not hand-maintained. */
function publicGetPaths(): string[] {
  type Layer = { route?: { path: string; methods: Record<string, boolean> } };
  return (publicRouter as unknown as { stack: Layer[] }).stack
    .filter((l) => l.route?.methods.get)
    .map((l) => l.route!.path);
}

const FORBIDDEN = /tier|gender|verif/i;

describe("public API leaks nothing about who reviewers are", () => {
  it("covers every GET route registered on the public router", () => {
    expect(publicGetPaths().sort()).toEqual(
      ["/factors", "/locations/:id", "/locations/nearby"].sort(),
    );
  });

  it("no public response body mentions tier, gender or verification", async () => {
    // :id is substituted with a real location so the route returns 200, not 404.
    const nearby = await (await fetch(`${base}/api/locations/nearby`)).json();
    const realId: number = nearby.locations[0].id;

    for (const path of publicGetPaths()) {
      const url = `${base}/api${path.replace(":id", String(realId))}`;
      const res = await fetch(url);
      expect(res.status, `${url} should be reachable`).toBe(200);
      const text = await res.text();
      expect(FORBIDDEN.test(text), `${url} leaked an identity field`).toBe(false);
    }
  });

  it("review text is returned without any author", async () => {
    const nearby = await (await fetch(`${base}/api/locations/nearby`)).json();
    const withNotes = nearby.locations.find((l: { buckets: Record<string, { sampleSize: number }> }) =>
      Object.values(l.buckets).some((b) => b.sampleSize >= 3),
    );
    const detail = await (await fetch(`${base}/api/locations/${withNotes.id}`)).json();
    for (const note of detail.notes) {
      expect(Object.keys(note).sort()).toEqual(["body", "timeBucket"]);
    }
  });
});
