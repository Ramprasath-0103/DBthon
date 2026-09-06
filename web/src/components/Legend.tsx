import { SCALE, NO_DATA_COLOR } from "../lib/score";

export function Legend() {
  return (
    <div className="absolute bottom-6 left-4 z-[1000] rounded-lg border border-navy-700
                    bg-navy-900/90 px-3 py-2 text-xs text-slate-300 backdrop-blur">
      <div className="mb-1.5 font-medium text-slate-200">Safety score</div>
      <div className="space-y-1">
        {SCALE.map((s) => (
          <div key={s.label} className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: s.color }} />
            <span>{s.label}</span>
            <span className="text-slate-500">
              {s.min === -Infinity ? "below 2.2" : `${s.min.toFixed(1)}+`}
            </span>
          </div>
        ))}
        <div className="flex items-center gap-2 border-t border-navy-700 pt-1">
          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: NO_DATA_COLOR }} />
          <span>Not enough data</span>
          <span className="text-slate-500">&lt; 3 reviews</span>
        </div>
      </div>
    </div>
  );
}
