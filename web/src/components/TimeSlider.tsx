import { TIME_BUCKETS, BUCKET_LABELS, BUCKET_HOURS, type Bucket } from "../api";

type Props = { value: Bucket; onChange: (b: Bucket) => void };

/**
 * Four discrete stops. Dragging changes local state only — the parent already holds
 * every bucket's score, so no request is made and the map never reloads.
 */
export function TimeSlider({ value, onChange }: Props) {
  const index = TIME_BUCKETS.indexOf(value);

  return (
    <div className="w-[440px]">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
          Time of day
        </span>
        <span className="text-xs text-slate-400">{BUCKET_HOURS[value]}</span>
      </div>

      <input
        type="range"
        min={0}
        max={TIME_BUCKETS.length - 1}
        step={1}
        value={index}
        onChange={(e) => onChange(TIME_BUCKETS[Number(e.target.value)]!)}
        aria-label="Time of day"
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-navy-700
                   accent-emerald-400 outline-none
                   [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5
                   [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full
                   [&::-webkit-slider-thumb]:bg-emerald-400
                   [&::-webkit-slider-thumb]:ring-2 [&::-webkit-slider-thumb]:ring-emerald-200/40"
      />

      <div className="mt-1 flex justify-between">
        {TIME_BUCKETS.map((b) => (
          <button
            key={b}
            onClick={() => onChange(b)}
            className={`text-xs transition-colors ${
              b === value ? "font-semibold text-emerald-300" : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {BUCKET_LABELS[b]}
          </button>
        ))}
      </div>
    </div>
  );
}
