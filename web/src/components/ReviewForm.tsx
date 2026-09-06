import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth";
import { BUCKET_LABELS, type Bucket } from "../api";

const FACTORS = [
  { code: "lighting", label: "Lighting" },
  { code: "security_presence", label: "Security presence" },
  { code: "crowd_density", label: "How busy it is" },
  { code: "transport_access", label: "Transport access" },
  { code: "harassment_free", label: "Free from harassment" },
  { code: "escape_routes", label: "Easy to leave" },
];

/** Local datetime string for <input type="datetime-local">, defaulting to now. */
function nowLocal(): string {
  const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
}

type Props = { locationId: number; onDone: (bucket: Bucket) => void; onCancel: () => void };

export function ReviewForm({ locationId, onDone, onCancel }: Props) {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [scores, setScores] = useState<Record<string, number>>(
    Object.fromEntries(FACTORS.map((f) => [f.code, 3])),
  );
  const [visitedAt, setVisitedAt] = useState(nowLocal);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        locationId,
        visitedAt: new Date(visitedAt).toISOString(),
        body: body.trim() || undefined,
        ratings: scores,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.message ?? "Could not save the review.");
      return;
    }
    // The score changed, so both the map and this panel are now stale.
    await queryClient.invalidateQueries({ queryKey: ["nearby"] });
    await queryClient.invalidateQueries({ queryKey: ["location", locationId] });
    onDone(data.timeBucket as Bucket);
  }

  return (
    <form onSubmit={submit} className="border-t border-navy-800 p-5">
      <h3 className="text-sm font-semibold text-slate-200">Rate this place</h3>
      <p className="mt-0.5 text-xs text-slate-500">
        The time you visited decides which part of the day your ratings count towards. You
        can rate this place once for each part of the day — a bus stop at noon and at
        midnight are not the same place.
      </p>

      <label className="mt-4 block text-xs text-slate-400">When did you visit?</label>
      <input
        type="datetime-local"
        value={visitedAt}
        max={nowLocal()}
        onChange={(e) => setVisitedAt(e.target.value)}
        className="mt-1 w-full rounded-md border border-navy-700 bg-navy-800 px-3 py-1.5 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
        required
      />

      <div className="mt-4 space-y-3">
        {FACTORS.map((f) => (
          <div key={f.code}>
            <div className="flex items-baseline justify-between">
              <label className="text-sm text-slate-300">{f.label}</label>
              <span className="text-sm tabular-nums text-emerald-300">{scores[f.code]}</span>
            </div>
            <input
              type="range" min={1} max={5} step={1} value={scores[f.code]}
              onChange={(e) => setScores({ ...scores, [f.code]: Number(e.target.value) })}
              aria-label={f.label}
              className="mt-1 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-navy-850
                         [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4
                         [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full
                         [&::-webkit-slider-thumb]:bg-emerald-400"
            />
          </div>
        ))}
      </div>

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={500}
        rows={2}
        placeholder="Anything else? (optional)"
        className="mt-4 w-full resize-none rounded-md border border-navy-700 bg-navy-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
      />

      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}

      <div className="mt-4 flex gap-2">
        <button type="submit" disabled={busy}
          className="flex-1 rounded-md bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50">
          {busy ? "Saving…" : "Submit review"}
        </button>
        <button type="button" onClick={onCancel}
          className="rounded-md border border-navy-700 px-4 py-2 text-sm text-slate-400 hover:text-slate-200">
          Cancel
        </button>
      </div>
      <p className="mt-2 text-center text-[11px] text-slate-600">
        Buckets: {Object.values(BUCKET_LABELS).join(" · ")}
      </p>
    </form>
  );
}
