/**
 * Fetches real Vellore locations from the Overpass API (OpenStreetMap, free, no key)
 * and caches the raw response to data/cache/overpass-vellore.json.
 *
 * Run once. The seed script reads the cache, never the network. Re-run with --force
 * only if you want fresher OSM data.
 */
import { writeFile, readFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const CACHE = resolve(import.meta.dirname, "../../data/cache/overpass-vellore.json");

// Vellore city and its immediate surroundings (south, west, north, east).
const BBOX = "12.87,79.05,13.00,79.22";

// Each selector is an OSM tag filter. Both nodes and ways are queried because
// parks, hospitals and colleges are usually mapped as areas, not points.
const SELECTORS = [
  '["highway"="bus_stop"]',
  '["amenity"="bus_station"]',
  '["amenity"="cafe"]',
  '["amenity"="restaurant"]',
  '["leisure"="park"]',
  '["amenity"="marketplace"]',
  '["shop"="supermarket"]',
  '["tourism"="hostel"]',
  '["amenity"="atm"]',
  '["amenity"="bank"]',
  '["amenity"="hospital"]',
  '["amenity"="clinic"]',
  '["amenity"="pharmacy"]',
  '["amenity"="college"]',
  '["amenity"="university"]',
  '["amenity"="library"]',
];

const query = `[out:json][timeout:120];
(
${SELECTORS.map((s) => `  node${s}(${BBOX});\n  way${s}(${BBOX});`).join("\n")}
);
out center;`;

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

async function main() {
  const force = process.argv.includes("--force");
  if (!force) {
    try {
      const existing = JSON.parse(await readFile(CACHE, "utf8"));
      console.log(`Cache already present: ${existing.elements.length} elements. Use --force to refetch.`);
      return;
    } catch {
      // no cache yet, fall through and fetch
    }
  }

  // Overpass wants the query form-encoded as data=... ; a raw text/plain body is
  // rejected. The public endpoints are frequently busy, so retry across mirrors.
  const body = new URLSearchParams({ data: query }).toString();

  for (let attempt = 1; attempt <= 3; attempt++) {
    for (const url of ENDPOINTS) {
      console.log(`Attempt ${attempt}: querying ${url} ...`);
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            // Overpass answers 406 to Node's default undici User-Agent. A real one is required.
            "User-Agent": "SafeWay-DBMS/1.0 (student project; local only)",
            Accept: "application/json",
          },
          body,
        });
        if (!res.ok) {
          console.log(`  ${res.status} ${res.statusText}, trying next endpoint`);
          continue;
        }
        const json = (await res.json()) as { elements: unknown[] };
        if (!Array.isArray(json.elements) || json.elements.length === 0) {
          console.log("  empty element list, trying next endpoint");
          continue;
        }
        await mkdir(dirname(CACHE), { recursive: true });
        await writeFile(CACHE, JSON.stringify(json, null, 2));
        console.log(`Cached ${json.elements.length} elements to ${CACHE}`);
        return;
      } catch (err) {
        console.log(`  failed: ${(err as Error).message}`);
      }
    }
    if (attempt < 3) {
      console.log("  backing off 10s ...");
      await new Promise((r) => setTimeout(r, 10_000));
    }
  }
  throw new Error("All Overpass endpoints failed.");
}

await main();
