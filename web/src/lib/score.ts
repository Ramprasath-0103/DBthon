/**
 * Colour is per venue, never per neighbourhood — no area heat overlay. A map that
 * reddens whole localities becomes a redlining tool.
 *
 * Language surfaces safer options rather than labelling places dangerous.
 */
export const SCALE = [
  { min: 4.0, color: "#15803d", label: "Safer" },
  { min: 3.4, color: "#65a30d", label: "Good" },
  { min: 2.8, color: "#ca8a04", label: "Mixed" },
  { min: 2.2, color: "#ea580c", label: "Caution" },
  { min: -Infinity, color: "#dc2626", label: "Low" },
] as const;

export const NO_DATA_COLOR = "#94a3b8";

export function colorFor(score: number | null): string {
  if (score === null) return NO_DATA_COLOR;
  return SCALE.find((s) => score >= s.min)!.color;
}

export function labelFor(score: number | null): string {
  if (score === null) return "Not enough data";
  return SCALE.find((s) => score >= s.min)!.label;
}
