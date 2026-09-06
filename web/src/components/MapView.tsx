import { MapContainer, TileLayer, CircleMarker, Tooltip } from "react-leaflet";
import type { Bucket, NearbyLocation } from "../api";
import { colorFor, labelFor } from "../lib/score";
import { Legend } from "./Legend";

type Props = {
  locations: NearbyLocation[];
  bucket: Bucket;
  selectedId: number | null;
  onSelect: (id: number) => void;
};

const VELLORE: [number, number] = [12.9165, 79.1325];

export function MapView({ locations, bucket, selectedId, onSelect }: Props) {
  return (
    <div className="relative h-full w-full">
      {/* SVG rendering, not canvas: 75 markers is far too few to need the canvas
          renderer, and real DOM nodes keep the pins accessible and testable. */}
      <MapContainer center={VELLORE} zoom={13} className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {locations.map((loc) => {
          const { score, sampleSize } = loc.buckets[bucket];
          const selected = loc.id === selectedId;
          return (
            // key is the location id only — never the bucket. Including the bucket
            // would remount every marker on each slider step and cause a visible flicker.
            <CircleMarker
              key={loc.id}
              center={[loc.lat, loc.lng]}
              radius={selected ? 11 : 7}
              pathOptions={{
                color: selected ? "#f8fafc" : "#0f172a",
                weight: selected ? 2.5 : 1,
                fillColor: colorFor(score),
                fillOpacity: 0.92,
              }}
              eventHandlers={{ click: () => onSelect(loc.id) }}
            >
              <Tooltip direction="top" offset={[0, -6]}>
                <div className="text-[11px] leading-tight">
                  <div className="font-semibold">{loc.name}</div>
                  <div className="text-slate-600">{loc.category}</div>
                  <div className="mt-0.5">
                    {score === null ? (
                      <span className="text-slate-500">
                        Not enough data ({sampleSize} review{sampleSize === 1 ? "" : "s"})
                      </span>
                    ) : (
                      <span>
                        <strong>{score.toFixed(2)}</strong> · {labelFor(score)} · {sampleSize} reviews
                      </span>
                    )}
                  </div>
                </div>
              </Tooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>
      <Legend />
    </div>
  );
}
