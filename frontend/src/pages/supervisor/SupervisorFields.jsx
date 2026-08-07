import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  LuMap,
  LuCircleCheck,
  LuWrench,
  LuTrendingUp,
  LuChevronLeft,
  LuChevronRight,
  LuExternalLink,
} from "react-icons/lu";
import api from "../../api/client";
import { apiError } from "../../lib/apiError";
import { BTN_DARK } from "../../lib/ui";
import InfoTip from "../../components/admin/InfoTip";
import ErrorBoundary from "../../components/ErrorBoundary";
import HarvestingFieldsModal from "../../components/supervisor/HarvestingFieldsModal";

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

  const load = useCallback(async () => {
    const { data } = await api.get("/zones/fields", { params: { date } });
    setFields(data || []);
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
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="rounded-xl bg-[#14493B] px-4 py-2 text-xs font-bold text-white transition hover:brightness-110"
          >
            View details
          </button>
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
            <ZoneHeatmapMap tiles={mapTiles} height={MAP_H} />
          </Suspense>
        </ErrorBoundary>
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

      <HarvestingFieldsModal
        open={modalOpen}
        fields={fields}
        onChanged={() => load().catch(() => {})}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
}
