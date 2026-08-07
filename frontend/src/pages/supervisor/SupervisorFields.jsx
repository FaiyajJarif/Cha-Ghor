import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  LuMap,
  LuCircleCheck,
  LuWrench,
  LuTrendingUp,
  LuChevronLeft,
  LuChevronRight,
  LuExternalLink,
  LuCalendarPlus,
  LuMapPin,
} from "react-icons/lu";
import api from "../../api/client";
import { apiError } from "../../lib/apiError";
import { BTN_DARK } from "../../lib/ui";
import InfoTip from "../../components/admin/InfoTip";
import ErrorBoundary from "../../components/ErrorBoundary";
import HarvestingFieldsModal from "../../components/supervisor/HarvestingFieldsModal";
import CreateScheduleModal from "../../components/supervisor/CreateScheduleModal";
import AssignFieldDialog from "../../components/supervisor/AssignFieldDialog";

// Field & Zonal Management.
//
// Every number here is computed from the registers for the selected day —
// workers from attendance, yield from leaf_collection, efficiency against each
// field's own target_kg_per_day. Status, ground condition, the field note and
// the site photo are what a supervisor recorded on the ground; nothing else in
// the system can infer "muddy after last night's rain".
const ZoneHeatmapMap = lazy(() =>
  import("../../components/supervisor/ZoneHeatmapMap"),
);

const CARD_STROKE = "ring-1 ring-[#13483B59]";
const MAP_H = 420;
const PAGE_SIZE = 5;

const CONDITION_BAND = { good: "high", caution: "late", poor: "low" };

function Kpi({ icon: Icon, label, value, unit, sub }) {
  return (
    <div className={`rounded-2xl bg-white p-5 shadow ${CARD_STROKE}`}>
      <div className="flex items-start justify-between">
        <p className="text-xs font-bold uppercase tracking-wide text-cg-ink/50">
          {label}
        </p>
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-cg-lime text-cg-green">
          <Icon size={18} />
        </span>
      </div>
      <p className="mt-2 text-3xl font-extrabold text-cg-ink">
        {value}
        {unit ? (
          <span className="ml-1 text-base font-bold text-cg-ink/40">{unit}</span>
        ) : null}
      </p>
      {sub ? <p className="mt-1 text-xs text-cg-ink/50">{sub}</p> : null}
    </div>
  );
}

function MapFallback() {
  return (
    <div
      className="grid place-items-center rounded-xl border border-dashed border-[#13483B59] text-sm text-cg-ink/50"
      style={{ height: MAP_H }}
    >
      Map unavailable. The figures beside it are unaffected.
    </div>
  );
}

export default function SupervisorFields() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [workers, setWorkers] = useState([]);
  // Harvest schedules live here only. harvest_schedule has existed since V1 but
  // has no backend yet, so these are deliberately not persisted — the table and
  // the success card both say so rather than implying a plan was saved.
  const [schedules, setSchedules] = useState([]);
  const [schedPageNo, setSchedPageNo] = useState(0);
  // Placing a field: click the map to drop a marker, then say which field it is.
  const [placing, setPlacing] = useState(false);
  const [dropped, setDropped] = useState(null);
  // When Move is chosen on a marker, the next map click relocates THAT field
  // rather than opening the "which field is this?" dialog.
  const [movingField, setMovingField] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(null);

  const load = useCallback(async () => {
    const [f, w] = await Promise.all([
      api.get("/zones/fields", { params: { date } }),
      api.get("/workers"),
    ]);
    setFields(f.data || []);
    setWorkers(w.data || []);
  }, [date]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setPage(0);
    load()
      .catch(
        (err) => active && setError(apiError(err, "Could not load the fields.")),
      )
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [load]);

  const stats = useMemo(() => {
    const active = fields.filter((f) => f.status === "active").length;
    const maint = fields.filter((f) => f.status === "maintenance").length;
    const withYield = fields.filter((f) => Number(f.yieldKg) > 0);
    const totalKg = fields.reduce((s, f) => s + Number(f.yieldKg || 0), 0);
    const workers = fields.reduce((s, f) => s + Number(f.workersPresent || 0), 0);
    return {
      total: fields.length,
      active,
      maint,
      // Average kilos per worker present — the number that says whether a day
      // was productive, rather than a raw total that just tracks headcount.
      avgPerWorker: workers > 0 ? totalKg / workers : 0,
      withYield: withYield.length,
      workers,
    };
  }, [fields]);

  // Map tiles reuse the heatmap component, coloured by ground condition here
  // rather than by attendance.
  const mapTiles = useMemo(
    () =>
      fields.map((f) => ({
        id: f.id,
        label: f.code || f.name,
        band: f.status !== "active" ? "empty" : CONDITION_BAND[f.condition] || "avg",
        pct: f.efficiencyPct,
        assigned: f.workersPresent,
        present: f.workersPresent,
        late: 0,
        absent: 0,
        placed: f.placed,
        lat: f.lat,
        lng: f.lng,
        radiusM: f.radiusM ?? 250,
      })),
    [fields],
  );

  // Leaderboard: best performing fields first. Fields with no target sort last
  // because they cannot be ranked on efficiency.
  const leaderboard = useMemo(
    () =>
      [...fields].sort((a, b) => {
        if (a.efficiencyPct == null && b.efficiencyPct == null) return 0;
        if (a.efficiencyPct == null) return 1;
        if (b.efficiencyPct == null) return -1;
        return b.efficiencyPct - a.efficiencyPct;
      }),
    [fields],
  );
  const totalPages = Math.max(1, Math.ceil(leaderboard.length / PAGE_SIZE));
  const pageRows = leaderboard.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const unplaced = fields.filter((f) => !f.placed).length;

  // Move: arm placing mode for one specific field.
  const startMove = (tile) => {
    setMovingField(tile);
    setPlacing(true);
    setDropped(null);
    setError("");
  };

  // The next click while moving relocates that field directly — no dialog,
  // because we already know which field it is.
  const handlePick = async (pos) => {
    if (!movingField) {
      setDropped(pos);
      return;
    }
    try {
      await api.put(`/zones/${movingField.id}/geometry`, {
        lat: pos[0],
        lng: pos[1],
        radiusM: movingField.radiusM ?? 250,
      });
      await load();
    } catch (err) {
      setError(apiError(err, "Could not move that field."));
    } finally {
      setMovingField(null);
      setPlacing(false);
    }
  };

  // Remove only clears the POSITION. The field itself, its history and its
  // targets are untouched — this is un-pinning, not deleting a zone.
  const removeFromMap = async (tile) => {
    try {
      await api.delete(`/zones/${tile.id}/geometry`);
      await load();
    } catch (err) {
      setError(apiError(err, "Could not remove that field from the map."));
    } finally {
      setConfirmRemove(null);
    }
  };

  const schedTotalPages = Math.max(1, Math.ceil(schedules.length / PAGE_SIZE));
  const schedPage = schedules.slice(
    schedPageNo * PAGE_SIZE,
    schedPageNo * PAGE_SIZE + PAGE_SIZE,
  );

  if (loading) {
    return (
      <div className="grid h-64 place-items-center text-sm text-cg-ink/60">
        {"Loading fields…"}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-cg-ink">
            Field &amp; Zonal Management
          </h1>
          <p className="text-sm text-cg-ink/60">
            Plantation health, labour distribution and harvest metrics across
            every field.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-[#13483B59] px-3 py-2 text-sm outline-none focus:border-cg-green"
          />
          <button type="button" className={BTN_DARK} onClick={() => setModalOpen(true)}>
            <LuExternalLink size={15} /> View details
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      {fields.length === 0 && !error && (
        <div className="rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-800 ring-1 ring-amber-200">
          No fields configured yet. Zones are seeded on a fresh database — if
          this is empty, the workforce seed has not run.
        </div>
      )}

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={LuMap} label="Total fields" value={stats.total}
             sub={unplaced > 0 ? `${unplaced} not on the map yet` : "all placed on the map"} />
        <Kpi icon={LuCircleCheck} label="Active" value={stats.active}
             sub={`${stats.withYield} collecting today`} />
        <Kpi icon={LuWrench} label="Maintenance" value={stats.maint}
             sub={stats.maint === 0 ? "nothing closed" : "closed to plucking"} />
        <Kpi icon={LuTrendingUp} label="Avg production"
             value={stats.avgPerWorker.toFixed(1)} unit="kg"
             sub={stats.workers > 0 ? `per worker across ${stats.workers} present` : "no workers marked"} />
      </div>

      {/* Map */}
      <div className={`rounded-2xl bg-white p-5 shadow ${CARD_STROKE}`}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="font-bold text-cg-ink">Field Map</h2>
            <InfoTip text="Each placed field is drawn as a circle coloured by its ground condition. Fields in maintenance are greyed. Place or move a field from the Attendance board's heatmap." />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setPlacing((p) => !p);
                setDropped(null);
              }}
              className={`rounded-xl px-4 py-2 text-xs font-bold transition ${
                placing
                  ? "bg-[#14493B] text-white"
                  : "bg-[#D3FFAC] text-[#14493B] hover:brightness-95"
              }`}
            >
              <LuMapPin size={14} className="mr-1 inline" />
              {placing ? "Click the map…" : "Place a field"}
            </button>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="rounded-xl bg-[#14493B] px-4 py-2 text-xs font-bold text-white transition hover:brightness-110"
            >
              View details
            </button>
          </div>
        </div>
        <ErrorBoundary fallback={<MapFallback />}>
          <Suspense
            fallback={
              <div className="grid place-items-center rounded-xl bg-cg-lime/20 text-sm text-cg-ink/40"
                   style={{ height: MAP_H }}>
                {"Loading map…"}
              </div>
            }
          >
            <ZoneHeatmapMap
              tiles={mapTiles}
              height={MAP_H}
              placing={placing}
              draftPosition={dropped}
              draftRadiusM={250}
              onPick={handlePick}
              onMoveField={startMove}
              onRemoveField={(t) => setConfirmRemove(t)}
            />
          </Suspense>
        </ErrorBoundary>
        {placing && !dropped && (
          <p className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-[#D3FFAC] px-3 py-2 text-xs font-semibold text-[#14493B]">
            {movingField
              ? `Click the new position for ${movingField.label}.`
              : "Click anywhere on the map to drop a marker, then choose which field it is."}
            <button
              type="button"
              onClick={() => {
                setPlacing(false);
                setMovingField(null);
                setDropped(null);
              }}
              className="ml-auto rounded-lg bg-white px-2 py-1 text-[11px] font-bold text-[#14493B]"
            >
              Cancel
            </button>
          </p>
        )}
        <p className="mt-2 text-[11px] text-cg-ink/50">
          Click any marker on the map to move it or remove it from the map.
        </p>
        <ul className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-cg-ink/60">
          {[
            ["#3f8f43", "Good condition"],
            ["#e0a92b", "Caution"],
            ["#d98b8b", "Needs attention"],
            ["#9bb99b", "Maintenance / resting"],
          ].map(([c, l]) => (
            <li key={l} className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded ring-1 ring-[#13483B59]"
                    style={{ background: c }} />
              {l}
            </li>
          ))}
        </ul>
      </div>

      {/* Upcoming Harvest Schedule */}
      <div className={`overflow-hidden rounded-2xl bg-white shadow ${CARD_STROKE}`}>
        <div className="flex flex-wrap items-center justify-between gap-2 bg-[#C0F28B] px-5 py-3">
          <div className="flex items-center gap-2 font-bold text-cg-ink">
            Upcoming Harvest Schedule
            <InfoTip text="Planned harvest and maintenance work per field. Not saved to the server yet — the harvest_schedule table exists but has no backend, so these are lost on reload." />
          </div>
          <button
            type="button"
            onClick={() => setScheduleOpen(true)}
            className="rounded-xl bg-[#14493B] px-4 py-2 text-xs font-bold text-white transition hover:brightness-110"
          >
            <LuCalendarPlus size={14} className="mr-1 inline" /> Create Harvest
            Schedule
          </button>
        </div>

        {schedules.length === 0 ? (
          <div className="grid h-40 place-items-center px-6 text-center text-sm text-cg-ink/50">
            No harvest work scheduled. Use{" "}
            <span className="mx-1 font-semibold">Create Harvest Schedule</span>{" "}
            to plan one.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-cg-ink/50">
                  <tr>
                    <th className="bg-[#D3FFAC] px-5 py-3">Created</th>
                    <th className="bg-[#D3FFAC] px-5 py-3">Field</th>
                    <th className="bg-[#D3FFAC] px-5 py-3">Task</th>
                    <th className="bg-[#D3FFAC] px-5 py-3">Type</th>
                    <th className="bg-[#D3FFAC] px-5 py-3 text-right">Expected</th>
                    <th className="bg-[#D3FFAC] px-5 py-3">Status</th>
                    <th className="bg-[#D3FFAC] px-5 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cg-green/10">
                  {schedPage.map((s) => (
                    <tr key={s.id} className="hover:bg-cg-lime/20">
                      <td className="px-5 py-3 text-cg-ink/70">
                        {new Date(s.createdAt).toLocaleString("en-GB", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-5 py-3 font-semibold text-cg-green">
                        {s.zoneName}
                      </td>
                      <td className="px-5 py-3">
                        <p className="font-semibold text-cg-ink">{s.title}</p>
                        {s.worker ? (
                          <p className="text-xs text-cg-ink/40">{s.worker}</p>
                        ) : null}
                      </td>
                      <td className="px-5 py-3 text-cg-ink/70">{s.type}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-cg-ink">
                        {s.expectedKg ? `${s.expectedKg} kg` : "—"}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                            s.status === "draft"
                              ? "bg-slate-100 text-slate-600"
                              : "bg-sky-100 text-sky-700"
                          }`}
                        >
                          {s.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            setSchedules((list) => list.filter((x) => x.id !== s.id))
                          }
                          className="text-xs font-semibold text-rose-600 hover:underline"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between gap-3 bg-[#D3FFAC] px-5 py-3 text-sm">
              <span className="text-xs font-semibold text-cg-ink/70">
                Showing {schedPage.length} of {schedules.length} — not saved to
                the server
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setSchedPageNo((p) => Math.max(0, p - 1))}
                  disabled={schedPageNo === 0}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-semibold text-cg-ink/70 transition hover:bg-white/60 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <LuChevronLeft size={15} /> Previous
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setSchedPageNo((p) => Math.min(schedTotalPages - 1, p + 1))
                  }
                  disabled={schedPageNo + 1 >= schedTotalPages}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-semibold text-cg-ink/70 transition hover:bg-white/60 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next <LuChevronRight size={15} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Field Conditions Detailed Analysis */}
      <div className={`overflow-hidden rounded-2xl bg-white shadow ${CARD_STROKE}`}>
        <div className="flex flex-wrap items-center justify-between gap-2 bg-[#C0F28B] px-5 py-3">
          <div className="flex items-center gap-2 font-bold text-cg-ink">
            Field Conditions — Detailed Analysis
            <InfoTip text="Workers and harvest per field for the selected day, against that field's target. Expected is the field's daily target; harvested is what was actually weighed in." />
          </div>
          <span className="text-xs font-semibold text-cg-ink/70">
            {date}
          </span>
        </div>
        {fields.length === 0 ? (
          <div className="grid h-40 place-items-center text-sm text-cg-ink/50">
            No fields to analyse.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-cg-ink/50">
                <tr>
                  <th className="bg-[#D3FFAC] px-5 py-3">Field</th>
                  <th className="bg-[#D3FFAC] px-5 py-3">Condition</th>
                  <th className="bg-[#D3FFAC] px-5 py-3">Workers</th>
                  <th className="bg-[#D3FFAC] px-5 py-3 text-right">Expected</th>
                  <th className="bg-[#D3FFAC] px-5 py-3 text-right">Harvested</th>
                  <th className="bg-[#D3FFAC] px-5 py-3">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cg-green/10">
                {fields.map((f) => {
                  const target = Number(f.targetKgPerDay || 0);
                  const got = Number(f.yieldKg || 0);
                  const met = target > 0 && got >= target;
                  const cond =
                    f.condition === "poor"
                      ? "bg-rose-100 text-rose-700"
                      : f.condition === "caution"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-emerald-100 text-emerald-700";
                  return (
                    <tr key={f.id} className="hover:bg-cg-lime/20">
                      <td className="px-5 py-3">
                        <p className="font-semibold text-cg-green">{f.name}</p>
                        {f.fieldNote ? (
                          <p className="text-xs text-cg-ink/40">{f.fieldNote}</p>
                        ) : null}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${cond}`}>
                          {f.condition}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-cg-ink/70">
                        {f.workersPresent} member
                        {f.workersPresent === 1 ? "" : "s"}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-cg-ink/70">
                        {target > 0 ? `${target.toFixed(0)} kg` : "—"}
                      </td>
                      <td
                        className={`px-5 py-3 text-right font-bold tabular-nums ${
                          target > 0 && !met ? "text-rose-600" : "text-cg-green"
                        }`}
                      >
                        {got.toFixed(0)} kg
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                            target === 0
                              ? "bg-slate-100 text-slate-600"
                              : met
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {target === 0 ? "no target" : met ? "confirmed" : "pending"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Leaderboard */}
      <div className={`overflow-hidden rounded-2xl bg-white shadow ${CARD_STROKE}`}>
        <div className="flex flex-wrap items-center justify-between gap-2 bg-[#C0F28B] px-5 py-3">
          <div className="flex items-center gap-2 font-bold text-cg-ink">
            Field Performance Leaderboard
            <InfoTip text="Ranked by yield against each field's own daily target. A field with no target set cannot be ranked and sorts last." />
          </div>
          <span className="text-xs font-semibold text-cg-ink/70">
            {leaderboard.length === 0 ? 0 : page * PAGE_SIZE + 1}–
            {Math.min((page + 1) * PAGE_SIZE, leaderboard.length)} of{" "}
            {leaderboard.length}
          </span>
        </div>

        {leaderboard.length === 0 ? (
          <div className="grid h-40 place-items-center text-sm text-cg-ink/50">
            No fields to rank.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-cg-ink/50">
                  <tr>
                    <th className="bg-[#D3FFAC] px-5 py-3">Field name</th>
                    <th className="bg-[#D3FFAC] px-5 py-3 text-right">Yield today</th>
                    <th className="bg-[#D3FFAC] px-5 py-3">Efficiency</th>
                    <th className="bg-[#D3FFAC] px-5 py-3">Workers</th>
                    <th className="bg-[#D3FFAC] px-5 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cg-green/10">
                  {pageRows.map((f) => {
                    const pct = f.efficiencyPct;
                    const tone =
                      pct == null ? "bg-cg-lime text-cg-green"
                        : pct >= 90 ? "bg-emerald-100 text-emerald-700"
                        : pct >= 60 ? "bg-sky-100 text-sky-700"
                        : "bg-rose-100 text-rose-700";
                    return (
                      <tr key={f.id} className="hover:bg-cg-lime/20">
                        <td className="px-5 py-3">
                          <p className="font-bold text-cg-ink">{f.name}</p>
                          <p className="text-xs text-cg-ink/40">{f.code}</p>
                        </td>
                        <td className="px-5 py-3 text-right font-bold tabular-nums text-cg-ink">
                          {Number(f.yieldKg || 0).toFixed(0)} kg
                        </td>
                        <td className="px-5 py-3">
                          {pct == null ? (
                            <span className="text-xs text-cg-ink/40">no target set</span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="w-10 text-xs font-bold tabular-nums text-cg-ink">
                                {pct}%
                              </span>
                              <div className="h-2 w-24 rounded-full bg-cg-lime/50">
                                <div
                                  className={`h-2 rounded-full ${
                                    pct >= 90 ? "bg-cg-green" : pct >= 60 ? "bg-sky-500" : "bg-rose-400"
                                  }`}
                                  style={{ width: `${Math.min(pct, 100)}%` }}
                                />
                              </div>
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-3 tabular-nums text-cg-ink/70">
                          {f.workersPresent}
                        </td>
                        <td className="px-5 py-3">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${tone}`}>
                            {f.status !== "active"
                              ? f.status
                              : pct == null ? "—" : pct >= 90 ? "optimal" : pct >= 60 ? "on track" : "below"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between gap-3 bg-[#D3FFAC] px-5 py-3 text-sm">
              <button type="button" onClick={() => setPage((p) => Math.max(0, p - 1))}
                      disabled={page === 0}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-semibold text-cg-ink/70 transition hover:bg-white/60 disabled:cursor-not-allowed disabled:opacity-40">
                <LuChevronLeft size={15} /> Previous
              </button>
              <span className="text-xs font-semibold text-cg-ink/70">
                Page {page + 1} of {totalPages}
              </span>
              <button type="button" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                      disabled={page + 1 >= totalPages}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-semibold text-cg-ink/70 transition hover:bg-white/60 disabled:cursor-not-allowed disabled:opacity-40">
                Next <LuChevronRight size={15} />
              </button>
            </div>
          </>
        )}
      </div>

      {confirmRemove && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="bg-[#14493B] px-6 py-4">
              <h3 className="text-lg font-extrabold text-white">
                Remove from map?
              </h3>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm text-[#14493B]">
                <span className="font-bold">{confirmRemove.label}</span> will no
                longer be drawn on the map.
              </p>
              <p className="mt-2 text-xs text-[#14493B]/60">
                The field itself is not deleted — its workers, yield, targets and
                history are untouched. You can place it again at any time.
              </p>
            </div>
            <div className="flex justify-end gap-2 border-t border-[#13483B]/10 px-6 py-4">
              <button
                type="button"
                onClick={() => setConfirmRemove(null)}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-[#14493B]/60 hover:bg-[#D3FFAC]/50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => removeFromMap(confirmRemove)}
                className="rounded-xl bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      <AssignFieldDialog
        open={!!dropped}
        position={dropped}
        fields={fields}
        onSaved={() => load().catch(() => {})}
        onClose={() => {
          setDropped(null);
          setPlacing(false);
        }}
      />

      <CreateScheduleModal
        open={scheduleOpen}
        fields={fields}
        workers={workers}
        onCreate={(s) => setSchedules((list) => [s, ...list])}
        onClose={() => setScheduleOpen(false)}
      />

      <HarvestingFieldsModal
        open={modalOpen}
        fields={fields}
        onChanged={() => load().catch(() => {})}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
}
