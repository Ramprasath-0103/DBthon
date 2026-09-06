import type { Bucket } from "../lib/time.js";

export const FACTORS = [
  { code: "lighting", label: "Lighting", displayOrder: 1 },
  { code: "security_presence", label: "Security presence", displayOrder: 2 },
  { code: "crowd_density", label: "How busy it is", displayOrder: 3 },
  { code: "transport_access", label: "Transport access", displayOrder: 4 },
  { code: "harassment_free", label: "Free from harassment", displayOrder: 5 },
  { code: "escape_routes", label: "Easy to leave", displayOrder: 6 },
] as const;

export type FactorCode = (typeof FACTORS)[number]["code"];

export const CATEGORIES = [
  { key: "bus_stop", name: "Bus stop" },
  { key: "cafe", name: "Café" },
  { key: "park", name: "Park" },
  { key: "market", name: "Market" },
  { key: "hostel", name: "Hostel" },
  { key: "atm", name: "ATM / Bank" },
  { key: "hospital", name: "Hospital" },
  { key: "college", name: "College" },
] as const;

export type CategoryKey = (typeof CATEGORIES)[number]["key"];

type FactorVector = Record<FactorCode, number>;
type BucketDeltas = Record<Bucket, Partial<FactorVector>>;

/**
 * Each category has a hidden "true profile": a baseline per factor, plus a per-bucket
 * modifier. Reviews are sampled around this with noise, so the data has structure
 * instead of being uniformly random.
 *
 * The demo depends on this table: bus stops and ATMs must fall off a cliff at night,
 * hospitals must stay flat, parks must peak in the morning.
 */
export const PROFILES: Record<CategoryKey, { base: FactorVector; deltas: BucketDeltas }> = {
  bus_stop: {
    base: { lighting: 3.2, security_presence: 2.6, crowd_density: 3.6, transport_access: 4.6, harassment_free: 3.0, escape_routes: 3.2 },
    deltas: {
      morning:   { lighting:  0.6, security_presence:  0.3, crowd_density:  0.2, harassment_free:  0.7 },
      afternoon: { lighting:  0.9, security_presence:  0.4, crowd_density:  0.9, harassment_free:  0.9, escape_routes: 0.2 },
      evening:   { lighting: -0.1, crowd_density: 0.5, harassment_free: 0.1 },
      night:     { lighting: -1.7, security_presence: -1.0, crowd_density: -2.0, harassment_free: -1.6, escape_routes: -0.9 },
    },
  },
  atm: {
    base: { lighting: 3.0, security_presence: 2.4, crowd_density: 2.4, transport_access: 3.2, harassment_free: 3.2, escape_routes: 2.8 },
    deltas: {
      morning:   { lighting:  0.5, security_presence:  0.2, crowd_density:  0.3, harassment_free:  0.6 },
      afternoon: { lighting:  0.9, security_presence:  0.4, crowd_density:  0.8, harassment_free:  0.8, escape_routes: 0.2 },
      evening:   { lighting:  0.1, crowd_density: 0.2 },
      night:     { lighting: -1.9, security_presence: -1.1, crowd_density: -1.5, harassment_free: -1.9, escape_routes: -1.0 },
    },
  },
  park: {
    base: { lighting: 2.8, security_presence: 2.6, crowd_density: 3.0, transport_access: 3.2, harassment_free: 3.2, escape_routes: 3.4 },
    deltas: {
      morning:   { lighting:  1.1, security_presence:  0.6, crowd_density:  1.0, harassment_free:  1.2, escape_routes: 0.4 },
      afternoon: { lighting:  0.6, security_presence:  0.3, crowd_density:  0.2, harassment_free:  0.5, escape_routes: 0.2 },
      evening:   { lighting:  0.1, crowd_density: 0.4 },
      night:     { lighting: -1.6, security_presence: -1.2, crowd_density: -1.8, harassment_free: -1.7, escape_routes: -0.9 },
    },
  },
  market: {
    base: { lighting: 3.2, security_presence: 3.0, crowd_density: 4.0, transport_access: 3.8, harassment_free: 3.2, escape_routes: 2.8 },
    deltas: {
      morning:   { lighting:  0.4, security_presence:  0.2, crowd_density:  0.2, harassment_free:  0.4, escape_routes: 0.2 },
      afternoon: { lighting:  0.7, security_presence:  0.4, crowd_density:  0.8, harassment_free:  0.6 },
      evening:   { lighting:  0.4, security_presence:  0.3, crowd_density:  0.7, harassment_free:  0.2, escape_routes: -0.2 },
      night:     { lighting: -1.2, security_presence: -0.9, crowd_density: -1.6, harassment_free: -1.1, escape_routes: -0.4 },
    },
  },
  cafe: {
    base: { lighting: 4.0, security_presence: 3.6, crowd_density: 3.4, transport_access: 3.6, harassment_free: 4.0, escape_routes: 3.6 },
    deltas: {
      morning:   { lighting:  0.2, crowd_density: -0.2, harassment_free: 0.2 },
      afternoon: { lighting:  0.3, security_presence: 0.1, crowd_density: 0.3, harassment_free: 0.3 },
      evening:   { lighting:  0.2, security_presence: 0.1, crowd_density: 0.4, harassment_free: 0.1 },
      night:     { lighting: -0.4, security_presence: -0.2, crowd_density: -0.6, harassment_free: -0.3, escape_routes: -0.1 },
    },
  },
  hospital: {
    base: { lighting: 4.2, security_presence: 4.2, crowd_density: 3.8, transport_access: 4.0, harassment_free: 4.2, escape_routes: 3.8 },
    deltas: {
      morning:   { crowd_density:  0.2 },
      afternoon: { crowd_density:  0.3, lighting: 0.1 },
      evening:   { crowd_density:  0.1 },
      night:     { crowd_density: -0.4, lighting: -0.2, harassment_free: -0.1 },
    },
  },
  college: {
    base: { lighting: 3.8, security_presence: 3.8, crowd_density: 3.6, transport_access: 3.8, harassment_free: 3.9, escape_routes: 3.6 },
    deltas: {
      morning:   { lighting:  0.3, security_presence:  0.2, crowd_density:  0.4, harassment_free:  0.3 },
      afternoon: { lighting:  0.4, security_presence:  0.3, crowd_density:  0.5, harassment_free:  0.4 },
      evening:   { crowd_density: -0.2 },
      night:     { lighting: -1.0, security_presence: -0.5, crowd_density: -1.5, harassment_free: -0.9, escape_routes: -0.3 },
    },
  },
  hostel: {
    base: { lighting: 3.8, security_presence: 4.0, crowd_density: 3.2, transport_access: 3.4, harassment_free: 4.0, escape_routes: 3.4 },
    deltas: {
      morning:   { crowd_density:  0.2, harassment_free: 0.2 },
      afternoon: { crowd_density:  0.2, lighting: 0.2 },
      evening:   { crowd_density:  0.1 },
      night:     { lighting: -0.5, security_presence: -0.2, crowd_density: -0.6, harassment_free: -0.4, escape_routes: -0.2 },
    },
  },
};

/** OSM tag -> our category. Order matters: first match wins. */
export function categoryForTags(tags: Record<string, string>): CategoryKey | null {
  if (tags.highway === "bus_stop" || tags.amenity === "bus_station") return "bus_stop";
  if (tags.amenity === "cafe" || tags.amenity === "restaurant") return "cafe";
  if (tags.leisure === "park") return "park";
  if (tags.amenity === "marketplace" || tags.shop === "supermarket") return "market";
  if (tags.tourism === "hostel") return "hostel";
  if (tags.amenity === "atm" || tags.amenity === "bank") return "atm";
  if (tags.amenity === "hospital" || tags.amenity === "clinic" || tags.amenity === "pharmacy") return "hospital";
  if (tags.amenity === "college" || tags.amenity === "university" || tags.amenity === "library") return "college";
  return null;
}

/** Caps keep the map balanced: raw Vellore OSM data is >50% hospitals and clinics. */
export const CATEGORY_CAPS: Record<CategoryKey, number> = {
  bus_stop: 16,
  hospital: 12,
  cafe: 12,
  atm: 10,
  college: 8,
  market: 8,
  park: 7,
  hostel: 5,
};
