import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import {
  LuTrophy,
  LuTriangleAlert,
  LuMapPin,
  LuPencil,
  LuCheck,
  LuX,
  LuTrash2,
} from "react-icons/lu";
import api from "../../api/client";
import { apiError } from "../../lib/apiError";
import ErrorBoundary from "../ErrorBoundary";

// Attendance heatmap, on a real map.
//
// Each field is a circle the supervisor places: pick the field, click the map
// to drop the pin, drag the slider for the diameter, save. Stored in the
// zones.polygon_geojson column that has existed since V1 and was never used —
// no migration.
//
// The circle is filled by how much of that field's assigned crew turned up,
// using the register on the page. A field nobody is assigned to is drawn grey
// rather than red: "nobody works here today" is not "nobody turned up".
//
// Leaflet is lazy-loaded behind an ErrorBoundary because it touches
// window/document and must not run during the first paint.
const ZoneHeatmapMap = lazy(() => import("./ZoneHeatmapMap"));

const BANDS = {
  high: { cls: "bg-[#3f8f43]", label: "High (90%+)" },
  avg: { cls: "bg-[#95c260]", label: "Average (70%+)" },
  low: { cls: "bg-[#d98b8b]", label: "Low" },
  late: { cls: "bg-[#e0a92b]", label: "Late-heavy" },
  empty: { cls: "bg-[#9bb99b]", label: "No one assigned" },
};

function bandFor(t) {
  if (t.assigned === 0) return "empty";
  const pct = (t.present / t.assigned) * 100;
  if (t.late > 0 && t.late >= t.present) return "late";
  if (pct >= 90) return "high";
  if (pct >= 70) return "avg";
  return "low";
}

function MapLoading() {
  return (
    <div className="grid h-[420px] place-items-center rounded-xl bg-cg-lime/20 text-sm text-cg-ink/40">
      {"Loading map…"}
    </div>
  );
}

function MapFallback() {
  return (
    <div className="grid h-[420px] place-items-center rounded-xl border border-dashed border-[#13483B59] px-6 text-center text-sm text-cg-ink/50">
      Map unavailable. The attendance figures beside it are unaffected.
    </div>
  );
}

export default function ZoneHeatmap({ rows, zones, onZonesChanged }) {
  const [geo, setGeo] = useState([]); // zones with lat/lng/radius from /zones
  const [editingId, setEditingId] = useState(null);
  const [draftPos, setDraftPos] = useState(null);
  const [draftDiameter, setDraftDiameter] = useState(500); // metres, diameter
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Which field is being taken off the map. Confirmed first, because a pin that
  // took someone a walk to place should not vanish on a mis-tap.
  const [confirmRemove, setConfirmRemove] = useState(null);

  const loadGeo = async () => {
    try {
      const { data } = await api.get("/zones");
      setGeo(data || []);
    } catch (err) {
      setError(apiError(err, "Could not load field positions."));
    }
  };

  useEffect(() => {
    loadGeo();
  }, []);

  // Attendance per field, merged with its position.
  const tiles = useMemo(() => {
    const by = new Map();
    for (const z of zones) {
      const g = geo.find((x) => x.id === z.id);
      by.set(z.id, {
        id: z.id,
        label: z.label,
        assigned: 0,
        present: 0,
        late: 0,
        absent: 0,
        placed: !!g?.placed,
        lat: g?.lat ?? null,
        lng: g?.lng ?? null,
        radiusM: g?.radiusM ?? 250,
      });
    }
    for (const r of rows) {
      const zid = r.zoneId ?? r.homeZoneId;
      const t = by.get(zid);
      if (!t || !r.status) continue; // unmarked workers are not evidence yet
      t.assigned++;
      if (r.status === "present") t.present++;
      else if (r.status === "late") t.late++;
      else if (r.status === "absent") t.absent++;
    }
    return [...by.values()].map((t) => ({
      ...t,
      band: bandFor(t),
      pct: t.assigned > 0 ? Math.round((t.present / t.assigned) * 100) : null,
    }));
  }, [rows, zones, geo]);

  const staffed = tiles.filter((t) => t.assigned > 0);
  const best = staffed.length
    ? staffed.reduce((a, b) => (b.present / b.assigned > a.present / a.assigned ? b : a))
    : null;
  const mostLate = staffed.length
    ? staffed.reduce((a, b) => (b.late > a.late ? b : a))
    : null;
  const unplaced = tiles.filter((t) => !t.placed);

  const startEdit = (t) => {
    setEditingId(t.id);
    setDraftPos(t.placed ? [t.lat, t.lng] : null);
    setDraftDiameter((t.radiusM ?? 250) * 2);
    setError("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraftPos(null);
  };

  // Take a field off the map.
  //
  // This clears the POSITION only -- DELETE /zones/{id}/geometry nulls the
  // stored GeoJSON and nothing else. The field, its workers, its yield and its
  // history are untouched, and it can be placed again at any time. Retiring a
  // field entirely is a separate, admin-only action.
  const removeFromMap = async (t) => {
    setBusy(true);
    setError("");
    try {
      await api.delete(`/zones/${t.id}/geometry`);
      await loadGeo();
      onZonesChanged?.();
      cancelEdit();
    } catch (err) {
      setError(apiError(err, "Could not take that field off the map."));
    } finally {
      setBusy(false);
      setConfirmRemove(null);
    }
  };

  const saveEdit = async () => {
    if (!draftPos) {
      setError("Click the map to place this field first.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      // The UI works in diameter because that is what someone pacing a field
      // thinks in; the API stores a radius.
      await api.put(`/zones/${editingId}/geometry`, {
        lat: draftPos[0],
        lng: draftPos[1],
        radiusM: Math.round(draftDiameter / 2),
      });
      await loadGeo();
      onZonesChanged?.();
      cancelEdit();
    } catch (err) {
      setError(apiError(err, "Could not save that field's position."));
    } finally {
      setBusy(false);
    }
  };

  const editing = tiles.find((t) => t.id === editingId);

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ErrorBoundary fallback={<MapFallback />}>
            <Suspense fallback={<MapLoading />}>
              <ZoneHeatmapMap
                tiles={tiles}
                editingZoneId={editingId}
                draftPosition={draftPos}
                draftRadiusM={Math.round(draftDiameter / 2)}
                onPick={setDraftPos}
                center={draftPos}
              />
            </Suspense>
          </ErrorBoundary>

          {/* Legend */}
          <ul className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-cg-ink/60">
            {Object.entries(BANDS).map(([k, b]) => (
              <li key={k} className="flex items-center gap-1.5">
                <span className={`h-3 w-3 rounded ${b.cls} ring-1 ring-[#13483B59]`} />
                {b.label}
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-3">
          {/* Placement panel */}
          {editing ? (
            <div className="rounded-xl bg-cg-lime/40 p-4 ring-1 ring-[#13483B59]">
              <p className="text-xs font-bold uppercase tracking-wide text-cg-ink/60">
                Placing {editing.label}
              </p>
              <p className="mt-1 text-xs text-cg-ink/60">
                {draftPos
                  ? "Click again to move the pin, then set the size."
                  : "Click anywhere on the map to drop the pin."}
              </p>

              <label className="mt-3 block text-xs font-semibold text-cg-ink">
                Diameter: {draftDiameter} m
                <input
                  type="range"
                  min={20}
                  max={4000}
                  step={20}
                  value={draftDiameter}
                  onChange={(e) => setDraftDiameter(Number(e.target.value))}
                  className="mt-1 w-full accent-cg-green"
                />
              </label>

              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={saveEdit}
                  disabled={busy || !draftPos}
                  className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-cg-dark px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40"
                >
                  <LuCheck size={13} /> {busy ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="inline-flex items-center justify-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold text-cg-ink/60 hover:bg-white"
                >
                  <LuX size={13} /> Cancel
                </button>
              </div>
              {editing?.placed && (
                confirmRemove === editing.id ? (
                  <div className="mt-2 rounded-lg bg-rose-50 p-2 ring-1 ring-rose-200">
                    <p className="text-[11px] text-rose-800">
                      Take {editing.label} off the map? Its workers, yield and
                      history are kept — only the pin is cleared.
                    </p>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => removeFromMap(editing)}
                        disabled={busy}
                        className="flex-1 rounded-lg bg-rose-600 px-2 py-1 text-[11px] font-bold text-white disabled:opacity-40"
                      >
                        {busy ? "Removing…" : "Remove"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmRemove(null)}
                        className="rounded-lg px-2 py-1 text-[11px] font-bold text-rose-700"
                      >
                        Keep
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmRemove(editing.id)}
                    className="mt-2 inline-flex w-full items-center justify-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50"
                  >
                    <LuTrash2 size={13} /> Remove from map
                  </button>
                )
              )}
            </div>
          ) : (
            <div className="rounded-xl bg-white p-4 ring-1 ring-[#13483B59]">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-cg-ink/60">
                Fields
              </p>
              <ul className="space-y-1">
                {tiles.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-cg-lime/30"
                  >
                    <span
                      className={`h-3 w-3 shrink-0 rounded ${BANDS[t.band].cls}`}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm text-cg-ink">
                      {t.label}
                    </span>
                    <span className="text-xs tabular-nums text-cg-ink/50">
                      {t.pct === null ? "—" : `${t.pct}%`}
                    </span>
                    <button
                      type="button"
                      onClick={() => startEdit(t)}
                      title={t.placed ? "Move this field" : "Place this field"}
                      className="grid h-6 w-6 shrink-0 place-items-center rounded text-cg-ink/50 hover:bg-white hover:text-cg-green"
                    >
                      {t.placed ? <LuPencil size={12} /> : <LuMapPin size={12} />}
                    </button>
                  </li>
                ))}
              </ul>
              {unplaced.length > 0 && (
                <p className="mt-2 text-[11px] text-amber-700">
                  {unplaced.length} field{unplaced.length === 1 ? "" : "s"} not
                  placed on the map yet.
                </p>
              )}
            </div>
          )}

          <div className="rounded-xl bg-cg-lime/40 p-4 ring-1 ring-[#13483B59]">
            <p className="flex items-center gap-2 text-xs font-semibold text-cg-ink/60">
              <LuTrophy size={14} className="text-[#f5c518]" /> Best attendance
              field
            </p>
            <p className="mt-1 font-bold text-cg-ink">
              {best
                ? `${best.label} (${Math.round((best.present / best.assigned) * 100)}%)`
                : "—"}
            </p>
          </div>
          <div className="rounded-xl bg-rose-50 p-4 ring-1 ring-[#13483B59]">
            <p className="flex items-center gap-2 text-xs font-semibold text-cg-ink/60">
              <LuTriangleAlert size={14} className="text-rose-500" /> Most late
              arrivals
            </p>
            <p className="mt-1 font-bold text-cg-ink">
              {mostLate && mostLate.late > 0
                ? `${mostLate.label} (${mostLate.late} worker${mostLate.late === 1 ? "" : "s"})`
                : "None today"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
