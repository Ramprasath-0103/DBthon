/**
 * Time buckets are defined in Asia/Kolkata local time:
 *   morning 05-11 · afternoon 11-17 · evening 17-21 · night 21-05
 */
export const TIME_BUCKETS = ["morning", "afternoon", "evening", "night"] as const;
export type Bucket = (typeof TIME_BUCKETS)[number];

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export const BUCKET_HOURS: Record<Bucket, readonly number[]> = {
  morning: [5, 6, 7, 8, 9, 10],
  afternoon: [11, 12, 13, 14, 15, 16],
  evening: [17, 18, 19, 20],
  night: [21, 22, 23, 0, 1, 2, 3, 4],
};

export function bucketForIstHour(hour: number): Bucket {
  if (hour >= 5 && hour < 11) return "morning";
  if (hour >= 11 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}

/** Build the UTC instant corresponding to a given IST wall-clock hour, N days ago. */
export function istInstant(daysAgo: number, hourIst: number, minuteIst: number): Date {
  const nowIst = new Date(Date.now() - daysAgo * 86_400_000 + IST_OFFSET_MS);
  const utcMs = Date.UTC(
    nowIst.getUTCFullYear(),
    nowIst.getUTCMonth(),
    nowIst.getUTCDate(),
    hourIst,
    minuteIst,
  );
  return new Date(utcMs - IST_OFFSET_MS);
}
