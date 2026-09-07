import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import {
  LuLeaf,
  LuUsers,
  LuTrophy,
  LuTriangleAlert,
  LuPlus,
  LuDownload,
  LuPrinter,
  LuChevronLeft,
  LuChevronRight,
  LuClock,
  LuScale,
  LuPencil,
  LuTrash2,
  LuMapPin,
  LuCalendar,
} from "react-icons/lu";
import api from "../../api/client";
import { apiError } from "../../lib/apiError";
import { BTN_DARK, BTN_GHOST } from "../../lib/ui";
import InfoTip from "../../components/admin/InfoTip";
import ErrorBoundary from "../../components/ErrorBoundary";
import WeighInModal from "../../components/supervisor/WeighInModal";
import LeafWeighInDrawer from "../../components/supervisor/LeafWeighInDrawer";
import AssignFieldDialog from "../../components/supervisor/AssignFieldDialog";
import LeafAiPanel from "../../components/supervisor/LeafAiPanel";
import LeafEntryDialog from "../../components/supervisor/LeafEntryDialog";
import LeafPhotoThumb from "../../components/supervisor/LeafPhotoThumb";
import ReportLeafProblemModal from "../../components/supervisor/ReportLeafProblemModal";
import { WS_BASE } from "../../lib/config";
import { closeSocket } from "../../lib/ws";
import { todayISO } from "../../lib/localDate";

// Leaf Collection — the daily weigh-in board.
//
// This page is the reason the payroll surplus and grade bonus exist. Every row
// it shows comes from leaf_collection, which had no writer at all until the
// weigh-in modal was built: before that, surplus and gradeBonus were ৳0 on
// every payslip in the system.
//
// The map is reused from the attendance heatmap, coloured by kilos against each
// field's target rather than by attendance.
const ZoneHeatmapMap = lazy(() =>
  import("../../components/supervisor/ZoneHeatmapMap"),
);

const CARD_STROKE = "ring-1 ring-[#13483B59]";
const PAGE_SIZE = 8;

// Fixed panel heights so a card with no data keeps the same footprint as a full
// one. Without these the layout collapsed on an empty day and the grid looked
// broken rather than empty — which is exactly the wrong signal when the whole
// point is that the register has not been filled in yet.
const MAP_H = 387; // map + zone list share this so the row reads as one block
const PANEL_MIN = "min-h-[260px]";
const LIST_MIN = "min-h-[220px]";

const PRINT_CSS = `
#leaf-print-root { display: none; }
@media print {
  body * { visibility: hidden !important; }
  #leaf-print-root, #leaf-print-root * { visibility: visible !important; }
  #leaf-print-root {
    display: block !important;
    position: absolute !important;
    left: 0 !important; top: 0 !important; width: 100% !important;
    background: #fff !important;
  }
  tr, td, th { page-break-inside: avoid; break-inside: avoid; }
  thead { display: table-header-group; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
}
@page { size: A4 landscape; margin: 12mm; }
`;

const kg = (n) =>
  Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 1 });

function Card({ children, className = "" }) {
  return (
    <div className={`rounded-2xl bg-white p-5 shadow ${CARD_STROKE} ${className}`}>
      {children}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, unit, sub, tone = "green" }) {
  const chip =
    tone === "red"
      ? "bg-rose-100 text-rose-600"
      : tone === "amber"
        ? "bg-amber-100 text-amber-700"
        : "bg-cg-lime text-cg-green";
  return (
    <div
      className={`rounded-2xl p-5 shadow ${CARD_STROKE} ${tone === "red" ? "bg-rose-50" : "bg-white"}`}
    >
      <div className="flex items-start justify-between">
        <p className="text-xs font-bold uppercase tracking-wide text-cg-ink/50">
          {label}
        </p>
        <span className={`grid h-9 w-9 place-items-center rounded-xl ${chip}`}>
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
    <div className="grid h-[387px] place-items-center rounded-xl border border-dashed border-[#13483B59] text-sm text-cg-ink/50">
      Map unavailable. The figures beside it are unaffected.
    </div>
  );
}

export default function SupervisorLeaf() {
  const today = todayISO();
  const [date, setDate] = useState(today);
  const [entries, setEntries] = useState([]);
  const [summary, setSummary] = useState(null);
  const [trend, setTrend] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [zonesMeta, setZonesMeta] = useState([]);
  const [zoneGeo, setZoneGeo] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [quota, setQuota] = useState(23); // payroll leafQuotaKg, the daily target
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [weighOpen, setWeighOpen] = useState(false);
  // The board: the whole present-worker queue on one sliding panel, which is
  // the shape the job actually has at a scale. The single-entry modal is kept
  // for correcting one person after the fact.
  const [boardOpen, setBoardOpen] = useState(false);
  // Per-zone performance for the map: today against each field's own norm.
  const [zonePerf, setZonePerf] = useState([]);
  // Top Workers shows a podium of 3 by default; the rest are one click away.
  const [topAll, setTopAll] = useState(false);
  // Was hard-capped at 6, so a 40-worker day showed six entries and no way to
  // reach the rest.
  const ENTRY_PAGE = 6;
  const [entryPage, setEntryPage] = useState(0);
  const [live, setLive] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  // Map editing, same as the Fields board: drop a pin, move it, take it off.
  // A field with no position is not drawn at all, so without this the leaf map
  // could never gain a marker.
  const [placing, setPlacing] = useState(false);
  const [dropped, setDropped] = useState(null);
  const [movingField, setMovingField] = useState(null);
  const [confirmUnpin, setConfirmUnpin] = useState(null);
  // Correct / remove one weigh-in, in a proper dialog rather than a browser prompt.
  const [entryDialog, setEntryDialog] = useState(null); // { mode, entry }
  const [entryBusy, setEntryBusy] = useState(false);
  const [printing, setPrinting] = useState(false);

  // Live. The backend has been pushing "leaf.saved" on every record, amend and
  // delete since the module was wired — nothing was listening, so a weigh-in
  // taken on a phone never appeared on an open board.
  const loadRef = useRef(null);

  useEffect(() => {
    let retry;
    let closedByUs = false;
    let ws;
    const url =
      (typeof import.meta !== "undefined" &&
        import.meta.env &&
        import.meta.env.VITE_WS_URL) ||
      `${WS_BASE}/ws/notifications`;

    const connect = () => {
      try {
        ws = new WebSocket(url);
      } catch {
        return;
      }
      ws.onopen = () => setLive(true);
      ws.onmessage = (e) => {
        let kind = "";
        try {
          kind = JSON.parse(e.data)?.kind || "";
        } catch {
          return;
        }
        // Leaf frames, plus zone frames: this page loads /zones for the field
        // picker and the heatmap, so a field renamed or retired elsewhere would
        // otherwise leave a stale name in the weigh-in dropdown — and a
        // weigh-in filed against a field that no longer exists is a real
        // attribution error, not a cosmetic one. Refetching on every
        // notification would hammer the API for nothing.
        if ((kind === "leaf.saved" || kind === "zone.saved") && loadRef.current) {
          loadRef.current().catch(() => {});
        }
      };
      ws.onerror = () => ws.close();
      ws.onclose = () => {
        setLive(false);
        if (!closedByUs) retry = setTimeout(connect, 5000);
      };
    };
    connect();
    return () => {
      closedByUs = true;
      clearTimeout(retry);
      closeSocket(ws);
    };
  }, []);

  const load = useCallback(async () => {
    const [l, s, t, w, m, z, a, cfg, zp] = await Promise.all([
      api.get("/leaf", { params: { date } }),
      api.get("/leaf/summary", { params: { date } }),
      api.get("/leaf/trend", { params: { days: 14 } }),
      api.get("/workers"),
      api.get("/workers/meta"),
      api.get("/zones"),
      api.get("/attendance", { params: { date } }),
      api.get("/payroll/config"),
      api.get("/leaf/zone-performance", { params: { date } }).catch(() => ({ data: [] })),
    ]);
    setEntries(l.data || []);
    setSummary(s.data);
    setTrend(t.data || []);
    setWorkers(w.data || []);
    setZonesMeta(m.data?.zones || []);
    setZoneGeo(z.data || []);
    setZonePerf(zp.data || []);
    setAttendance(a.data || []);
    if (cfg.data?.leafQuotaKg != null) setQuota(Number(cfg.data.leafQuotaKg));
  }, [date]);

  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setPage(0);
    load()
      .catch(
        (err) =>
          active && setError(apiError(err, "Could not load leaf collection.")),
      )
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [load]);

  const activeWorkers = useMemo(
    () => workers.filter((w) => String(w.status).toLowerCase() === "active"),
    [workers],
  );

  // Only workers who actually turned up can hand in leaf.
  //
  // Offering the whole payroll would let a supervisor weigh leaf against
  // somebody who was marked absent — kilos with nobody behind them, paid as
  // surplus. The field each worker was assigned to today is carried through so
  // the weigh-in is credited to the right field, not their home zone.
  const presentWorkers = useMemo(() => {
    const marked = new Map();
    for (const a of attendance) {
      if (a.status === "present" || a.status === "late") {
        marked.set(a.workerId, a);
      }
    }
    return activeWorkers
      .filter((w) => marked.has(w.id))
      .map((w) => ({
        ...w,
        todayStatus: marked.get(w.id).status,
        todayZoneId: marked.get(w.id).zoneId ?? w.zoneId ?? null,
      }));
  }, [activeWorkers, attendance]);

  // An empty list means the register was never taken — a different problem
  // from "nobody came", and one the supervisor can still fix.
  const registerTaken = attendance.length > 0;

  // Kilos already recorded today per worker, so the board can show "12 kg in"
  // and a second entry is clearly a deliberate addition, not a duplicate.
  const weighedByWorker = useMemo(() => {
    const m = new Map();
    for (const e of entries) {
      m.set(e.workerId, (m.get(e.workerId) || 0) + Number(e.weightKg || 0));
    }
    return m;
  }, [entries]);

  // Delete a weigh-in entered in error. Audited server-side with what it was.
  // --- map pins -----------------------------------------------------------

  const startMove = (tile) => {
    setMovingField(tile);
    setPlacing(true);
    setDropped(null);
  };

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

  // Clears the PIN only. The field, its yield and its history stay.
  const unpinField = async (tile) => {
    try {
      await api.delete(`/zones/${tile.id}/geometry`);
      await load();
    } catch (err) {
      setError(apiError(err, "Could not take that field off the map."));
    } finally {
      setConfirmUnpin(null);
    }
  };

  const removeEntry = async (e) => {
    setEntryBusy(true);
    try {
      await api.delete(`/leaf/${e.id}`);
      await load();
      setEntryDialog(null);
    } catch (err) {
      setError(apiError(err, "Could not remove that weigh-in."));
    } finally {
      setEntryBusy(false);
    }
  };

  // Correct a weight in place. This number becomes a wage, so it must be
  // fixable — it used to be permanent.
  const amendEntry = async (e, weightKg, grade) => {
    setEntryBusy(true);
    try {
      await api.put(`/leaf/${e.id}`, { weightKg, grade });
      await load();
      setEntryDialog(null);
    } catch (err) {
      setError(apiError(err, "Could not update that weigh-in."));
    } finally {
      setEntryBusy(false);
    }
  };

  // Per worker, for today.
  const perWorker = useMemo(() => {
    const by = new Map();
    for (const e of entries) {
      if (!by.has(e.workerId)) {
        by.set(e.workerId, {
          workerId: e.workerId,
          name: e.workerName || `Worker #${e.workerId}`,
          zone: e.zone || "—",
          kg: 0,
          gradeA: 0,
          entries: 0,
        });
      }
      const r = by.get(e.workerId);
      r.kg += Number(e.weightKg || 0);
      r.entries += 1;
      if (e.grade === "A") r.gradeA += Number(e.weightKg || 0);
    }
    return [...by.values()].sort((a, b) => b.kg - a.kg);
  }, [entries]);

  const totalKg = Number(summary?.totalKg || 0);
  const avgPerWorker = perWorker.length ? totalKg / perWorker.length : 0;

  // Per zone, against each field's own daily target.
  const perZone = useMemo(() => {
    const by = new Map();
    for (const z of zonesMeta) {
      const g = zoneGeo.find((x) => x.id === z.id);
      by.set(z.id, {
        id: z.id,
        label: z.label,
        kg: 0,
        target: Number(g?.targetKgPerDay || 0),
      });
    }
    for (const e of entries) {
      const t = by.get(e.zoneId);
      if (t) t.kg += Number(e.weightKg || 0);
    }
    return [...by.values()].sort((a, b) => b.kg - a.kg);
  }, [entries, zonesMeta, zoneGeo]);

  const bestZone = perZone.find((z) => z.kg > 0) || null;

  // Workers marked present or late who have not been weighed in yet. This is
  // the number that actually matters at the scale: who is still owed a weigh-in.
  const missingCheckIns = useMemo(() => {
    const weighed = new Set(entries.map((e) => e.workerId));
    return attendance.filter(
      (a) => (a.status === "present" || a.status === "late") && !weighed.has(a.workerId),
    ).length;
  }, [attendance, entries]);

  // Performance bands against the payroll quota, so the split matches what the
  // wage engine actually pays on rather than an invented threshold.
  const bands = useMemo(() => {
    const high = perWorker.filter((w) => w.kg > quota).length;
    const standard = perWorker.filter(
      (w) => w.kg >= quota * 0.85 && w.kg <= quota,
    ).length;
    const under = perWorker.filter((w) => w.kg < quota * 0.85).length;
    return { high, standard, under };
  }, [perWorker, quota]);

  // Map tiles: coloured by kilos against target rather than attendance.
  const mapTiles = useMemo(
    () =>
      perZone.map((z) => {
        const g = zoneGeo.find((x) => x.id === z.id);
        const perf = zonePerf.find((x) => x.zoneId === z.id);
        const pct = z.target > 0 ? Math.round((z.kg / z.target) * 100) : null;
        // Colour by how this field is doing against ITS OWN recent norm, which
        // is what /leaf/zone-performance computes. A fixed daily target marks a
        // genuinely hard field down every single day for being hard; comparing
        // it to itself does not. The target-based band is kept only as a
        // fallback for when there is no history yet.
        const band = perf
          ? { GOOD: "high", NORMAL: "avg", LOW: "low", NO_DATA: "empty" }[perf.band] || "avg"
          : z.kg === 0
            ? "empty"
            : pct === null
              ? "avg"
              : pct >= 90
                ? "high"
                : pct >= 60
                  ? "avg"
                  : "low";
        return {
          id: z.id,
          label: z.label,
          band,
          pct,
          assigned: z.target,
          present: Math.round(z.kg),
          late: 0,
          absent: 0,
          placed: !!g?.placed,
          lat: g?.lat ?? null,
          lng: g?.lng ?? null,
          radiusM: g?.radiusM ?? 250,
        };
      }),
    [perZone, zoneGeo, zonePerf],
  );

  const totalPages = Math.max(1, Math.ceil(perWorker.length / PAGE_SIZE));
  const pageRows = perWorker.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const exportCsv = () => {
    const head = ["worker_id", "name", "zone", "date", "total_kg", "grade_a_kg", "daily_target", "status"];
    const body = perWorker.map((w) => [
      w.workerId,
      `"${(w.name || "").replace(/"/g, '""')}"`,
      `"${w.zone}"`,
      date,
      w.kg.toFixed(1),
      w.gradeA.toFixed(1),
      quota,
      w.kg >= quota ? "achieved" : "under",
    ]);
    const csv = [head, ...body].map((r) => r.join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `leaf-collection-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = () => {
    setPrinting(true);
    setTimeout(() => {
      window.print();
      setPrinting(false);
    }, 50);
  };

  if (loading) {
    return (
      <div className="grid h-64 place-items-center text-sm text-cg-ink/60">
        {"Loading leaf collection…"}
      </div>
    );
  }

  const empty = entries.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-cg-ink">Leaf Collection</h1>
          <p className="text-sm text-cg-ink/60">Daily harvest entry & zone summary</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-2 rounded-xl border border-[#13483B59] bg-white px-3 py-2 shadow-sm">
            <LuCalendar size={15} className="shrink-0 text-cg-green" />
            <span className="text-[11px] font-bold uppercase tracking-wide text-cg-ink/50">
              Date
            </span>
            <input
              type="date"
              value={date}
              max={todayISO()}
              onChange={(e) => setDate(e.target.value)}
              className="bg-transparent text-sm font-semibold text-cg-ink outline-none"
            />
          </label>
          <button type="button" className={BTN_GHOST} onClick={exportCsv}>
            <LuDownload size={15} /> CSV
          </button>
          <button type="button" className={BTN_GHOST} onClick={exportPdf}>
            <LuPrinter size={15} /> PDF
          </button>
          {/* The board is the normal way to work a scale queue; the single
              modal stays for correcting one person afterwards. */}
          <button
            type="button"
            onClick={() => setReportOpen(true)}
            title="Photograph a problem in a field and tell the office"
            className="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-bold text-amber-900 transition hover:bg-amber-100"
          >
            <LuTriangleAlert size={15} /> Report a problem
          </button>
          <button type="button" className={BTN_DARK} onClick={() => setBoardOpen(true)}>
            <LuScale size={15} /> Weigh-in board
          </button>
          <button
            type="button"
            onClick={() => setWeighOpen(true)}
            title="Record one weigh-in by worker id — for a correction or a late arrival"
            className="inline-flex items-center gap-2 rounded-xl border border-[#13483B59] bg-white px-4 py-2 text-sm font-bold text-[#14493B] shadow-sm transition hover:bg-[#D3FFAC]"
          >
            <LuPlus size={15} /> Single entry
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</div>
      )}

      {empty && (
        <div className="rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-800 ring-1 ring-amber-200">
          No leaf weighed in for {date}. Use{" "}
          <span className="font-semibold">Submit Collection</span> to record the
          first entry — until then, surplus and grade bonus stay at ৳0 on every
          payslip for this period.
        </div>
      )}

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={LuLeaf} label="Total collected" value={kg(totalKg)} unit="kg"
             sub={`${summary?.entries ?? 0} weigh-ins today`} />
        <Kpi icon={LuUsers} label="Avg worker collection" value={kg(avgPerWorker)} unit="kg"
             sub={`across ${perWorker.length} worker${perWorker.length === 1 ? "" : "s"}`} />
        <Kpi icon={LuTrophy} label="Highest zone"
             value={bestZone ? kg(bestZone.kg) : "—"} unit={bestZone ? "kg" : ""}
             sub={bestZone ? bestZone.label : "no collection yet"} />
        <Kpi icon={LuTriangleAlert} label="Pending" tone={missingCheckIns > 0 ? "red" : "green"}
             value={missingCheckIns}
             sub={missingCheckIns > 0 ? "present but not weighed in" : "everyone present is weighed in"} />
      </div>

      {/* Top workers + recent entries */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-extrabold text-cg-ink">Top Workers Today</h2>
            {perWorker.length > 3 && (
              <button
                type="button"
                onClick={() => setTopAll((v) => !v)}
                className="rounded-lg bg-cg-lime/60 px-3 py-1.5 text-xs font-bold text-cg-green"
              >
                {topAll ? "Show top 3" : `Show all ${perWorker.length}`}
              </button>
            )}
          </div>
          {perWorker.length === 0 ? (
            <Card className={`${PANEL_MIN} grid place-items-center`}>
              <p className="text-sm text-cg-ink/50">No weigh-ins yet today.</p>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-3">
              {(topAll ? perWorker : perWorker.slice(0, 3)).map((w, i) => (
                <Card
                  key={w.workerId}
                  /* Centred: the cards are a podium, and left-aligned text in a
                     tall box left the number floating against the top edge. */
                  className={`${PANEL_MIN} relative flex flex-col items-center justify-center overflow-hidden text-center ${
                    i === 0 && !topAll ? "bg-[#D3FFAC]" : ""
                  }`}
                >
                  {/* The leader gets the filled card. A podium where all three
                      look identical is not a podium. */}
                  {i < 3 && !topAll && (
                    <span
                      className={`absolute left-3 top-3 grid h-8 w-8 place-items-center rounded-full text-sm font-extrabold ${
                        i === 0
                          ? "bg-[#14493B] text-white"
                          : "bg-cg-lime text-cg-green"
                      }`}
                    >
                      {i + 1}
                    </span>
                  )}
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/70 text-base font-extrabold text-cg-green ring-1 ring-[#13483B]/10">
                    {(w.name || "?")
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((x) => x[0])
                      .join("")
                      .toUpperCase()}
                  </span>
                  <p className="mt-2 text-lg font-extrabold leading-tight text-cg-ink">
                    {w.name}
                  </p>
                  <p className="text-sm text-cg-ink/50">{w.zone}</p>
                  <p className="mt-3 text-5xl font-extrabold leading-none text-cg-ink">
                    {kg(w.kg)}
                    <span className="ml-1.5 text-xl font-bold text-cg-ink/40">kg</span>
                  </p>
                  {/* Against the quota, so the number means something on its
                      own rather than only relative to the other two. */}
                  <p className="mt-2 text-xs font-semibold text-cg-ink/60">
                    {quota > 0
                      ? `${Math.round((w.kg / quota) * 100)}% of the ${kg(quota)} kg quota`
                      : ""}
                  </p>
                  <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-white/70 px-3 py-1 text-xs font-bold text-cg-green ring-1 ring-[#13483B]/10">
                    <LuLeaf size={12} />
                    {w.gradeA > 0 ? `${kg(w.gradeA)} kg grade A` : "no grade A yet"}
                  </p>
                </Card>
              ))}
            </div>
          )}

          <Card className={LIST_MIN}>
            <div className="mb-3 flex items-center gap-2">
              <h3 className="font-bold text-cg-ink">Worker Performance Distribution</h3>
              <InfoTip text={`Measured against the payroll leaf quota of ${quota} kg a day — the same number the wage engine pays surplus on.`} />
            </div>
            {perWorker.length === 0 ? (
              <p className="py-4 text-center text-sm text-cg-ink/50">Nothing to distribute yet.</p>
            ) : (
              <ul className="space-y-3">
                {[
                  [`High performers (>${quota} kg)`, bands.high, "bg-cg-green"],
                  [`Standard (${Math.round(quota * 0.85)}–${quota} kg)`, bands.standard, "bg-[#95c260]"],
                  [`Under target (<${Math.round(quota * 0.85)} kg)`, bands.under, "bg-[#d98b8b]"],
                ].map(([label, n, cls]) => (
                  <li key={label}>
                    <div className="flex justify-between text-xs text-cg-ink/60">
                      <span>{label}</span>
                      <span className="font-semibold">{n} workers</span>
                    </div>
                    <div className="mt-1 h-2 w-full rounded-full bg-cg-lime/50">
                      <div className={`h-2 rounded-full ${cls}`}
                           style={{ width: `${perWorker.length ? (n / perWorker.length) * 100 : 0}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card className="flex flex-col">
          <h3 className="mb-3 font-bold text-cg-ink">Recent Weight Entries</h3>
          {entries.length === 0 ? (
            <p className="py-6 text-center text-sm text-cg-ink/50">No entries yet.</p>
          ) : (
            <ul className="space-y-2">
              {entries
                .slice(entryPage * ENTRY_PAGE, entryPage * ENTRY_PAGE + ENTRY_PAGE)
                .map((e) => (
                <li key={e.id}
                    className="flex items-center gap-3 rounded-xl bg-cg-lime/30 px-3 py-2">
                  {/* The bulk that was handed in. Evidence was being stored
                      and never shown — photo_id was written but LeafResponse
                      did not return it, so nothing could display it. */}
                  <LeafPhotoThumb entry={e} onReviewed={() => load().catch(() => {})} />
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-xs font-bold text-cg-green">
                    {kg(e.weightKg)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-cg-ink">
                      {e.workerName}
                    </p>
                    <p className="flex items-center gap-1 text-[11px] text-cg-ink/50">
                      <LuClock size={10} />
                      {e.recordedAt
                        ? new Date(e.recordedAt).toLocaleTimeString("en-GB", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : e.date}
                      {e.grade ? ` · Grade ${e.grade}` : ""}
                    </p>
                  </div>
                  {/* A mistyped weight used to be permanent, and this number
                      becomes a wage. Both actions are audited server-side. */}
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      title="Correct this weight"
                      onClick={() => setEntryDialog({ mode: "edit", entry: e })}
                      className="grid h-7 w-7 place-items-center rounded-lg text-cg-ink/60 hover:bg-white"
                    >
                      <LuPencil size={13} />
                    </button>
                    <button
                      type="button"
                      title="Remove this weigh-in"
                      onClick={() => setEntryDialog({ mode: "delete", entry: e })}
                      className="grid h-7 w-7 place-items-center rounded-lg text-rose-600 hover:bg-rose-50"
                    >
                      <LuTrash2 size={13} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {entries.length > ENTRY_PAGE && (
            <div className="mt-3 flex items-center justify-between border-t border-[#13483B]/10 pt-3">
              <span className="text-[11px] font-bold uppercase tracking-wide text-cg-ink/50">
                {entryPage * ENTRY_PAGE + 1}–
                {Math.min((entryPage + 1) * ENTRY_PAGE, entries.length)} of{" "}
                {entries.length}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setEntryPage((n) => Math.max(0, n - 1))}
                  disabled={entryPage === 0}
                  aria-label="Previous entries"
                  className="grid h-7 w-7 place-items-center rounded-lg bg-cg-lime/50 text-cg-ink disabled:opacity-40"
                >
                  <LuChevronLeft size={14} />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setEntryPage((n) =>
                      Math.min(Math.ceil(entries.length / ENTRY_PAGE) - 1, n + 1),
                    )
                  }
                  disabled={(entryPage + 1) * ENTRY_PAGE >= entries.length}
                  aria-label="Next entries"
                  className="grid h-7 w-7 place-items-center rounded-lg bg-cg-lime/50 text-cg-ink disabled:opacity-40"
                >
                  <LuChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Map + zone performance share ONE white panel so they read as a single
          block rather than two cards of different heights. */}
      <Card>
        <div className="mb-4 flex items-center gap-2">
          <h3 className="font-bold text-cg-ink">Zone Performance</h3>
          <InfoTip text="Each field is coloured by how its kilos-per-worker today compare with its OWN average over the last 14 days — not against a fixed target, which would mark a genuinely hard field down every day for being hard. The estate-wide comparison is shown alongside, and the two are allowed to disagree. Fields with nothing weighed in yet show as no data, never as failing." />
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setPlacing((v) => !v);
              setMovingField(null);
              setDropped(null);
            }}
            className={`rounded-xl px-3 py-2 text-xs font-bold transition ${
              placing
                ? "bg-[#14493B] text-white"
                : "bg-[#D3FFAC] text-[#14493B] hover:brightness-95"
            }`}
          >
            <LuMapPin size={14} className="mr-1 inline" />
            {placing ? "Click the map…" : "Place a field"}
          </button>
          {placing && (
            <span className="rounded-lg bg-[#D3FFAC] px-3 py-2 text-xs font-semibold text-[#14493B]">
              {movingField
                ? `Click the new position for ${movingField.label}.`
                : "Click the map, then choose which field it is."}
            </span>
          )}
          <span className="text-[11px] text-cg-ink/50">
            Click any marker to move it or take it off the map.
          </span>
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <ErrorBoundary fallback={<MapFallback />}>
              <Suspense
                fallback={
                  <div
                    className="grid place-items-center rounded-xl bg-cg-lime/20 text-sm text-cg-ink/40"
                    style={{ height: MAP_H }}
                  >
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
                  onRemoveField={(t) => setConfirmUnpin(t)}
                />
              </Suspense>
            </ErrorBoundary>
          </div>
          {/* Was locked to the map's exact height, which cut the last field
              off the bottom with no indication anything was missing. It now
              scrolls only when it genuinely overflows a taller ceiling. */}
          <div
            className="overflow-y-auto pr-1"
            style={{ maxHeight: MAP_H + 120 }}
          >
            {perZone.every((z) => z.kg === 0) ? (
              <div className="grid h-full place-items-center px-4 text-center text-sm text-cg-ink/50">
                No collection recorded against any field today.
              </div>
            ) : (
              <ul className="space-y-3">
                {perZone.map((z) => {
                const perf = zonePerf.find((x) => x.zoneId === z.id);
                const pct = z.target > 0 ? Math.round((z.kg / z.target) * 100) : null;
                const tone = pct === null ? "bg-cg-lime text-cg-green"
                  : pct >= 90 ? "bg-emerald-100 text-emerald-700"
                  : pct >= 60 ? "bg-sky-100 text-sky-700"
                  : "bg-rose-100 text-rose-700";
                return (
                  <li
                    key={z.id}
                    /* White fill + a solid border. It previously had only a ring
                       over the parent card, so the stroke had nothing to sit
                       against and effectively disappeared. */
                    className="rounded-xl border border-[#13483B59] bg-white p-3 shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-cg-ink">{z.label}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                          perf
                            ? {
                                GOOD: "bg-emerald-100 text-emerald-700",
                                NORMAL: "bg-sky-100 text-sky-700",
                                LOW: "bg-rose-100 text-rose-700",
                                NO_DATA: "bg-slate-100 text-slate-500",
                              }[perf.band]
                            : tone
                        }`}
                      >
                        {perf
                          ? {
                              GOOD: "doing well",
                              NORMAL: "as usual",
                              LOW: "below usual",
                              NO_DATA: "no data",
                            }[perf.band]
                          : pct === null
                            ? "no target"
                            : pct >= 90
                              ? "good"
                              : pct >= 60
                                ? "on track"
                                : "below"}
                      </span>
                    </div>
                    <div className="mt-1 flex items-baseline justify-between text-xs text-cg-ink/60">
                      <span>
                        {kg(z.kg)} kg{z.target > 0 ? ` / ${kg(z.target)} kg target` : ""}
                      </span>
                      {pct !== null && <span className="font-bold text-cg-ink">{pct}%</span>}
                    </div>
                    {/* The server's one-line verdict, naming the numbers it
                        came from so a supervisor can disagree on the evidence
                        rather than trusting a colour. */}
                    {perf?.verdict && (
                      <p className="mt-1.5 text-[11px] leading-snug text-cg-ink/60">
                        {perf.verdict}
                      </p>
                    )}
                    {pct !== null && (
                      <div className="mt-1 h-2 w-full rounded-full bg-cg-lime/50">
                        <div className={`h-2 rounded-full ${pct >= 90 ? "bg-cg-green" : pct >= 60 ? "bg-sky-500" : "bg-rose-400"}`}
                             style={{ width: `${Math.min(pct, 100)}%` }} />
                      </div>
                    )}
                  </li>
                );
              })}
              </ul>
            )}
          </div>
        </div>
      </Card>

      {/* AI: photo grading + yield forecast */}
      <LeafAiPanel />

      {/* Trend */}
      <Card>
        <div className="mb-4 flex items-center gap-2">
          <h3 className="font-bold text-cg-ink">Collection History</h3>
          <span className="text-xs text-cg-ink/50">Last 14 days</span>
        </div>
        {trend.every((d) => Number(d.totalKg) === 0) ? (
          <div className="grid h-[260px] place-items-center text-sm text-cg-ink/50">
            No leaf recorded in the last 14 days.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={trend}>
              <defs>
                <linearGradient id="leafArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3f8f43" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="#3f8f43" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5efe0" vertical={false} />
              <XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip formatter={(v) => `${kg(v)} kg`} />
              <Area type="monotone" dataKey="totalKg" name="Leaf (kg)"
                    stroke="#3f8f43" fill="url(#leafArea)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* Per-worker table */}
      <div className={`overflow-hidden rounded-2xl bg-white shadow ${CARD_STROKE}`}>
        <div className="flex flex-wrap items-center justify-between gap-2 bg-[#C0F28B] px-5 py-3">
          <h3 className="font-bold text-cg-ink">Collection History — {date}</h3>
          <span className="text-xs font-semibold text-cg-ink/70">
            {perWorker.length === 0 ? 0 : page * PAGE_SIZE + 1}–
            {Math.min((page + 1) * PAGE_SIZE, perWorker.length)} of {perWorker.length}
          </span>
        </div>
        {perWorker.length === 0 ? (
          <div className="grid h-[260px] place-items-center text-sm text-cg-ink/50">
            No weigh-ins recorded for this date.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-cg-ink/50">
                  <tr>
                    <th className="bg-[#D3FFAC] px-5 py-3">Worker ID</th>
                    <th className="bg-[#D3FFAC] px-5 py-3">Name</th>
                    <th className="bg-[#D3FFAC] px-5 py-3">Zone</th>
                    <th className="bg-[#D3FFAC] px-5 py-3 text-right">Harvested</th>
                    <th className="bg-[#D3FFAC] px-5 py-3 text-right">Grade A</th>
                    <th className="bg-[#D3FFAC] px-5 py-3 text-right">Target</th>
                    <th className="bg-[#D3FFAC] px-5 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cg-green/10">
                  {pageRows.map((w) => (
                    <tr key={w.workerId} className="hover:bg-cg-lime/20">
                      <td className="px-5 py-3 font-semibold text-cg-ink">
                        #CG{String(w.workerId).padStart(3, "0")}
                      </td>
                      <td className="px-5 py-3 font-semibold text-cg-ink">{w.name}</td>
                      <td className="px-5 py-3">
                        <span className="rounded-full bg-cg-lime px-2 py-0.5 text-xs font-semibold text-cg-green">
                          {w.zone}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right font-bold tabular-nums text-cg-ink">
                        {kg(w.kg)} kg
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-cg-ink/70">
                        {kg(w.gradeA)} kg
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-cg-ink/50">
                        {quota} kg
                      </td>
                      <td className="px-5 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                          w.kg >= quota ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"
                        }`}>
                          {w.kg >= quota ? "achieved" : "under target"}
                        </span>
                      </td>
                    </tr>
                  ))}
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

      {/* Print sheet — full day, not just the page on screen */}
      <style>{PRINT_CSS}</style>
      {printing && (
        <div id="leaf-print-root">
          <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>
            Cha Ghor — Leaf Collection
          </h1>
          <p style={{ fontSize: 12, color: "#555", margin: "2px 0 10px" }}>
            {date} · {kg(totalKg)} kg from {summary?.entries ?? 0} weigh-ins ·
            daily target {quota} kg
          </p>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr style={{ background: "#D3FFAC" }}>
                {["Worker ID", "Name", "Zone", "Harvested", "Grade A", "Target", "Status"].map((h) => (
                  <th key={h} style={{ border: "1px solid #ccc", padding: 5, textAlign: "left" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {perWorker.map((w) => (
                <tr key={w.workerId}>
                  <td style={{ border: "1px solid #ccc", padding: 5 }}>CG{String(w.workerId).padStart(3, "0")}</td>
                  <td style={{ border: "1px solid #ccc", padding: 5 }}>{w.name}</td>
                  <td style={{ border: "1px solid #ccc", padding: 5 }}>{w.zone}</td>
                  <td style={{ border: "1px solid #ccc", padding: 5 }}>{kg(w.kg)} kg</td>
                  <td style={{ border: "1px solid #ccc", padding: 5 }}>{kg(w.gradeA)} kg</td>
                  <td style={{ border: "1px solid #ccc", padding: 5 }}>{quota} kg</td>
                  <td style={{ border: "1px solid #ccc", padding: 5 }}>
                    {w.kg >= quota ? "Achieved" : "Under target"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: 10, color: "#777", marginTop: 10 }}>
            Generated by Cha Ghor on {new Date().toLocaleString("en-GB")}.
          </p>
        </div>
      )}

      <AssignFieldDialog
        open={!!dropped}
        position={dropped}
        fields={zoneGeo}
        onSaved={() => load().catch(() => {})}
        onClose={() => {
          setDropped(null);
          setPlacing(false);
        }}
      />

      {confirmUnpin && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="bg-[#14493B] px-6 py-4">
              <h3 className="text-lg font-extrabold text-white">Remove from map?</h3>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm text-[#14493B]">
                <span className="font-bold">{confirmUnpin.label}</span> will no
                longer be drawn on the map.
              </p>
              <p className="mt-2 text-xs text-[#14493B]/60">
                Only the pin is cleared. The field, its weigh-ins and its yield
                history are untouched, and you can place it again at any time.
              </p>
            </div>
            <div className="flex justify-end gap-2 border-t border-[#13483B]/10 px-6 py-4">
              <button
                type="button"
                onClick={() => setConfirmUnpin(null)}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-[#14493B]/60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => unpinField(confirmUnpin)}
                className="rounded-xl bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      <ReportLeafProblemModal
        open={reportOpen}
        zones={zonesMeta}
        onClose={() => setReportOpen(false)}
        onFiled={() => load().catch(() => {})}
      />

      <LeafEntryDialog
        open={!!entryDialog}
        mode={entryDialog?.mode}
        entry={entryDialog?.entry}
        quota={quota}
        busy={entryBusy}
        onSave={(w, g) => amendEntry(entryDialog.entry, w, g)}
        onDelete={() => removeEntry(entryDialog.entry)}
        onClose={() => setEntryDialog(null)}
      />

      <LeafWeighInDrawer
        open={boardOpen}
        date={date}
        workers={presentWorkers}
        zones={zonesMeta}
        registerTaken={registerTaken}
        alreadyWeighed={weighedByWorker}
        onSaved={() => load().catch(() => {})}
        onClose={() => setBoardOpen(false)}
      />

      <WeighInModal
        open={weighOpen}
        date={date}
        workers={presentWorkers}
        registerTaken={registerTaken}
        zones={zonesMeta}
        onSaved={() => load().catch(() => {})}
        onClose={() => setWeighOpen(false)}
      />
    </div>
  );
}
