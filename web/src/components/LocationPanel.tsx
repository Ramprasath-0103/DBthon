import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchLocation, BUCKET_LABELS, BUCKET_HOURS, type Bucket } from "../api";
import { colorFor, labelFor } from "../lib/score";
import { useAuth } from "../auth";
import { ReviewForm } from "./ReviewForm";

type Props = {
  locationId: number | null;
  bucket: Bucket;
  onBucketChange: (b: Bucket) => void;
  onRequestSignIn: () => void;
};

function FactorBar({ label, avg }: { label: string; avg: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-40 shrink-0 text-sm text-slate-300">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-navy-850">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${(avg / 5) * 100}%`, backgroundColor: colorFor(avg) }}
        />
      </div>
      <span className="w-9 shrink-0 text-right text-sm tabular-nums text-slate-400">
        {avg.toFixed(1)}
      </span>
    </div>
  );
}

export function LocationPanel({ locationId, bucket, onBucketChange, onRequestSignIn }: Props) {
  const { user } = useAuth();
  const [writing, setWriting] = useState(false);
  // Keyed by id only. The response carries all four buckets, so moving the slider
  // while a pin is open does not refetch anything.
  const { data, isLoading } = useQuery({
    queryKey: ["location", locationId],
    queryFn: () => fetchLocation(locationId!),
    enabled: locationId !== null,
    staleTime: Infinity,
  });

  if (locationId === null) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-sm text-slate-500">
        Select a place on the map to see how it scores on each safety factor.
      </div>
    );
  }
  if (isLoading || !data) {
    return <div className="p-6 text-sm text-slate-500">Loading…</div>;
  }

  const current = data.buckets[bucket];
  const notes = data.notes.filter((n) => n.timeBucket === bucket);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="border-b border-navy-800 p-5">
        <h2 className="text-lg font-semibold leading-tight text-slate-100">{data.name}</h2>
        <p className="mt-0.5 text-sm text-slate-400">{data.category}</p>
        {data.address && <p className="mt-1 text-xs text-slate-500">{data.address}</p>}
      </div>

      <div className="border-b border-navy-800 p-5">
        <div className="mb-3 flex items-baseline justify-between">
          <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
            {BUCKET_LABELS[bucket]}
          </span>
          <span className="text-xs text-slate-500">{BUCKET_HOURS[bucket]}</span>
        </div>

        {current.score === null ? (
          <div className="rounded-md border border-navy-700 bg-navy-850/60 p-4 text-center">
            <div className="text-sm font-medium text-slate-400">Not enough data</div>
            <div className="mt-1 text-xs text-slate-500">
              {current.sampleSize} review{current.sampleSize === 1 ? "" : "s"} — at least 3 are
              needed before a score is shown.
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-end gap-3">
              <span
                className="text-4xl font-bold tabular-nums"
                style={{ color: colorFor(current.score) }}
              >
                {current.score.toFixed(2)}
              </span>
              <span className="pb-1 text-sm text-slate-400">
                {labelFor(current.score)} · {current.sampleSize} reviews
              </span>
            </div>
            <div className="mt-4 space-y-2.5">
              {current.factors.map((f) => (
                <FactorBar key={f.code} label={f.label} avg={f.avg} />
              ))}
            </div>
          </>
        )}
      </div>

      {writing && locationId !== null ? (
        <ReviewForm
          locationId={locationId}
          onCancel={() => setWriting(false)}
          onDone={(b) => {
            setWriting(false);
            // Jump to the bucket the review actually landed in, so the change is visible.
            onBucketChange(b);
          }}
        />
      ) : (
        <div className="border-t border-navy-800 p-5">
          {!user && (
            <button
              onClick={onRequestSignIn}
              className="w-full rounded-md border border-navy-700 py-2 text-sm text-slate-300 hover:border-navy-600 hover:text-slate-100"
            >
              Sign in to rate this place
            </button>
          )}
          {user?.canReview && (
            <button
              onClick={() => setWriting(true)}
              className="w-full rounded-md bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-500"
            >
              Rate this place
            </button>
          )}
          {user && !user.canReview && (
            <div className="rounded-md border border-amber-700/40 bg-amber-900/20 p-3 text-xs leading-relaxed text-amber-200/90">
              <span className="font-medium">This account is read-only.</span> Anyone can read the
              map. Only accounts registered as female can post a review.
            </div>
          )}
        </div>
      )}

      {notes.length > 0 && (
        <div className="p-5">
          <div className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400">
            What women said
          </div>
          <ul className="space-y-2">
            {notes.map((n, i) => (
              <li
                key={i}
                className="rounded-md border border-navy-800 bg-navy-850/50 p-3 text-sm text-slate-300"
              >
                {n.body}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
