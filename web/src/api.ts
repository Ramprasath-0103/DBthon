export const TIME_BUCKETS = ["morning", "afternoon", "evening", "night"] as const;
export type Bucket = (typeof TIME_BUCKETS)[number];

export const BUCKET_LABELS: Record<Bucket, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
  night: "Night",
};

export const BUCKET_HOURS: Record<Bucket, string> = {
  morning: "5am – 11am",
  afternoon: "11am – 5pm",
  evening: "5pm – 9pm",
  night: "9pm – 5am",
};

export type BucketScore = { score: number | null; sampleSize: number };

export type NearbyLocation = {
  id: number;
  name: string;
  category: string;
  address: string | null;
  lat: number;
  lng: number;
  distanceM: number;
  buckets: Record<Bucket, BucketScore>;
};

export type NearbyResponse = {
  center: { lat: number; lng: number };
  radiusM: number;
  count: number;
  locations: NearbyLocation[];
};

export type LocationDetail = {
  id: number;
  name: string;
  category: string;
  address: string | null;
  lat: number;
  lng: number;
  buckets: Record<Bucket, BucketScore & { factors: { code: string; label: string; avg: number }[] }>;
  notes: { body: string; timeBucket: Bucket }[];
};

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

/**
 * Fetched exactly once, on load, with all four buckets included. This is what lets
 * the time slider recolour the map without a single network request.
 */
export const fetchNearby = () => get<NearbyResponse>("/api/locations/nearby");
export const fetchLocation = (id: number) => get<LocationDetail>(`/api/locations/${id}`);
