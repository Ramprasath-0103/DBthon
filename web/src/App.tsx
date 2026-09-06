import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchNearby, type Bucket } from "./api";
import { MapView } from "./components/MapView";
import { TimeSlider } from "./components/TimeSlider";
import { LocationPanel } from "./components/LocationPanel";

export default function App() {
  const [bucket, setBucket] = useState<Bucket>("afternoon");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // One request, on load, carrying all four buckets. Nothing else hits the network
  // while the slider moves.
  const { data, isLoading, error } = useQuery({
    queryKey: ["nearby"],
    queryFn: fetchNearby,
    staleTime: Infinity,
  });

  return (
    <div className="flex h-screen min-w-[1100px] flex-col bg-slate-900 text-slate-100">
      <header className="flex shrink-0 items-center gap-8 border-b border-slate-800 px-6 py-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">SafeWay</h1>
          <p className="text-xs text-slate-500">
            Women-rated safety by time of day · Vellore
          </p>
        </div>
        <TimeSlider value={bucket} onChange={setBucket} />
        <div className="ml-auto text-xs text-slate-500">
          {data ? `${data.count} places` : ""}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <main className="relative min-w-0 flex-1">
          {isLoading && (
            <div className="flex h-full items-center justify-center text-slate-500">
              Loading map…
            </div>
          )}
          {error && (
            <div className="flex h-full items-center justify-center text-red-400">
              Could not reach the API. Is the server running on port 8787?
            </div>
          )}
          {data && (
            <MapView
              locations={data.locations}
              bucket={bucket}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          )}
        </main>

        <aside className="w-[380px] shrink-0 border-l border-slate-800 bg-slate-900">
          <LocationPanel locationId={selectedId} bucket={bucket} />
        </aside>
      </div>
    </div>
  );
}
