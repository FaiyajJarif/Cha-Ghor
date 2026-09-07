import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  LuMap,
  LuCircleCheck,
  LuWrench,
  LuTrendingUp,
  LuChevronLeft,
  LuChevronRight,
  LuExternalLink,
  LuCalendarPlus,
  LuPrinter,
  LuCloudOff,
  LuMapPin,
  LuSettings,
} from "react-icons/lu";
import api from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { apiError } from "../../lib/apiError";
import { BTN_DARK } from "../../lib/ui";
import { WS_BASE } from "../../lib/config";
import { closeSocket } from "../../lib/ws";
import {
  queueOrSend,
  count as outboxCount,
  flush as outboxFlush,
} from "../../lib/outbox";
import { newUuid } from "../../lib/uuid";
import InfoTip from "../../components/admin/InfoTip";
import ErrorBoundary from "../../components/ErrorBoundary";
import HarvestingFieldsModal from "../../components/supervisor/HarvestingFieldsModal";
import CreateScheduleModal from "../../components/supervisor/CreateScheduleModal";
import AssignFieldDialog from "../../components/supervisor/AssignFieldDialog";
import FieldManagerModal from "../../components/supervisor/FieldManagerModal";
import FieldAiPanel from "../../components/supervisor/FieldAiPanel";
import HarvestScheduleDocument from "../../components/supervisor/HarvestScheduleDocument";
import { todayISO } from "../../lib/localDate";

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

// Schedule status pills. Cancelled reads as muted rather than red: dropping a
// planned job is a normal decision, not a failure.
const SCHED_STATUS = {
  draft: "bg-slate-100 text-slate-600",
  planned: "bg-sky-100 text-sky-700",
  done: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-slate-100 text-slate-400 line-through",
};

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
  const [date, setDate] = useState(todayISO());
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  // Set when the pluck advisor opens the composer for a specific field, so the
  // supervisor is not retyping what the panel just told them.
  const [schedulePrefill, setSchedulePrefill] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [workers, setWorkers] = useState([]);
  // Harvest schedules, from the server. These used to live in this state array
  // and nowhere else: harvest_schedule had sat unused in the schema since V1,
  // so a supervisor could plan a week's work, close the tab and lose it. V28
  // plus the harvest module made them real rows.
  const [schedules, setSchedules] = useState([]);
  const [schedBusy, setSchedBusy] = useState(null);
  const [condBusy, setCondBusy] = useState(null);
  // Writes sitting in the device outbox waiting for signal, and the transient
  // "saved on this device" message.
  const [pending, setPending] = useState(0);
  const [notice, setNotice] = useState("");
  const [schedPageNo, setSchedPageNo] = useState(0);
  // Placing a field: click the map to drop a marker, then say which field it is.
  const [placing, setPlacing] = useState(false);
  const [dropped, setDropped] = useState(null);
  // When Move is chosen on a marker, the next map click relocates THAT field
  // rather than opening the "which field is this?" dialog.
  const [movingField, setMovingField] = useState(null);
  // Field size, in metres across. Diameter rather than radius because that is
  // the number someone pacing a block actually knows.
  const [draftDiameter, setDraftDiameter] = useState(500);
  const [geoBusy, setGeoBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(null);
  // Add / rename / retire the estate's fields. Admin-only on the server.
  const [manageOpen, setManageOpen] = useState(false);
  const [live, setLive] = useState(false);
  // Field CRUD is open to supervisors now. The person walking the estate is the
  // one who knows a block has been opened or closed, and routing that through
  // the office only made the map wrong until someone got round to it.
  //
  // The DAILY TARGET is still admin-only, enforced server-side in
  // ZoneService.guardTarget. Everyone gets the button; only an admin gets the
  // target input inside it.
  const { user } = useAuth();
  const isAdmin = String(user?.role || "").toLowerCase() === "admin";

  const load = useCallback(async () => {
    const [f, w, s] = await Promise.all([
      api.get("/zones/fields", { params: { date } }),
      api.get("/workers"),
      // Schedules are NOT filtered by the date picker above. That picker
      // chooses which day's yield and attendance to show; a plan for next
      // Thursday should not vanish because you looked at yesterday's numbers.
      // The list starts from today and runs forwards.
      api.get("/harvest-schedules").catch(() => ({ data: [] })),
    ]);
    setFields(f.data || []);
    setWorkers(w.data || []);
    setSchedules(s.data || []);
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

  // How many writes are sitting on this device waiting for signal.
  //
  // Declared HERE, above the effect that lists it as a dependency. A
  // `const` referenced in a dependency array is read during render, so leaving
  // this further down the component put it in the temporal dead zone and threw
  // "Cannot access 'refreshPending' before initialization" the moment the page
  // mounted.
  const refreshPending = useCallback(() => {
    outboxCount()
      .then(setPending)
      .catch(() => {});
  }, []);

  // Show the pending count on arrival, and try to drain the queue whenever
  // signal comes back. The service worker also asks for a flush on Background
  // Sync (see main.jsx); this is the fallback for Safari and Firefox, which do
  // not support it.
  useEffect(() => {
    refreshPending();
    const onOnline = () => {
      outboxFlush()
        .then(({ sent }) => {
          refreshPending();
          if (sent > 0) {
            setNotice(
              `Back online — ${sent} change${sent === 1 ? "" : "s"} saved on this device ${sent === 1 ? "has" : "have"} now synced.`,
            );
            load().catch(() => {});
          }
        })
        .catch(() => {});
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [refreshPending, load]);

  // Live updates.
  //
  // This was the only supervisor board without a socket, and the one whose
  // numbers move most: workersPresent, yieldKg and efficiencyPct are all
  // computed from the registers, so every weigh-in taken on a phone changed
  // what this page should be showing while it sat there showing the old value.
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);

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
        // Four kinds move this board: a weigh-in changes yield, an attendance
        // mark changes headcount, a schedule changes the plan, and a zone
        // change alters the fields themselves — name, status, condition, or
        // where the pin sits. Refetching on every notification would hammer
        // the API for nothing.
        if (
          (kind === "leaf.saved" ||
            kind === "attendance.saved" ||
            kind === "harvest.saved" ||
            kind === "zone.saved") &&
          loadRef.current
        ) {
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

  // Edit a placed field: move it, resize it, or both.
  //
  // This used to relocate on the next click and save immediately, with the
  // radius carried over untouched — so there was no way to change how big a
  // field is from this page at all. A field's size is not decoration: the
  // circle is what a supervisor reads to know which block a marker refers to,
  // and a 250 m default over a 900 m block is just wrong on the map.
  //
  // The draft position starts at the field's CURRENT position, so the size can
  // be corrected without touching where it sits.
  const startMove = (tile) => {
    setMovingField(tile);
    setPlacing(true);
    setDropped(tile.placed ? [tile.lat, tile.lng] : null);
    // The slider works in diameter because that is what someone pacing a field
    // thinks in; the API stores a radius. Same convention as the Attendance
    // board's heatmap.
    setDraftDiameter((tile.radiusM ?? 250) * 2);
    setError("");
  };

  // A click now only sets the DRAFT. Nothing is saved until Save is pressed,
  // which is what makes resizing possible — the old code committed on the click
  // and left no moment in which to drag the slider.
  const handlePick = (pos) => {
    setDropped(pos);
    setError("");
  };

  const saveGeometry = async () => {
    if (!movingField || !dropped) return;
    setGeoBusy(true);
    const radiusM = Math.round(draftDiameter / 2);
    try {
      // Idempotent: a position is a position, so replaying this lands the pin
      // in the same place. No client_uuid needed.
      const { queued } = await queueOrSend({
        path: `/zones/${movingField.id}/geometry`,
        method: "PUT",
        body: { lat: dropped[0], lng: dropped[1], radiusM },
      });
      if (queued) {
        // Move it on the local map so the supervisor sees the pin where they
        // just put it, rather than snapping back to the old spot.
        setFields((list) =>
          list.map((x) =>
            x.id === movingField.id
              ? { ...x, placed: true, lat: dropped[0], lng: dropped[1], radiusM }
              : x,
          ),
        );
        setNotice("No network — that position is saved on this device and will sync when you are back in signal.");
        refreshPending();
      } else {
        await load();
      }
      setMovingField(null);
      setPlacing(false);
      setDropped(null);
      setError("");
    } catch (err) {
      setError(apiError(err, "Could not save that field's position."));
    } finally {
      setGeoBusy(false);
    }
  };

  // Remove only clears the POSITION. The field itself, its history and its
  // targets are untouched — this is un-pinning, not deleting a zone.
  const removeFromMap = async (tile) => {
    try {
      const { queued } = await queueOrSend({
        path: `/zones/${tile.id}/geometry`,
        method: "DELETE",
      });
      if (queued) {
        setFields((list) =>
          list.map((x) =>
            x.id === tile.id ? { ...x, placed: false, lat: null, lng: null } : x,
          ),
        );
        setNotice("No network — that change is saved on this device and will sync when you are back in signal.");
        refreshPending();
      } else {
        await load();
      }
    } catch (err) {
      setError(apiError(err, "Could not remove that field from the map."));
    } finally {
      setConfirmRemove(null);
    }
  };

  // Accept the suggested condition. The ONLY place a suggestion is ever
  // written, and it takes a deliberate tap — nothing on the server sets
  // condition on its own.
  //
  // Queued when offline. Setting a condition is idempotent — it is a statement
  // about how the field looks, so replaying it lands in the same place — which
  // is why it needs no client_uuid.
  const applyCondition = async (f) => {
    setCondBusy(f.id);
    try {
      const { queued } = await queueOrSend({
        path: `/zones/${f.id}/state`,
        method: "PUT",
        body: { condition: f.suggestedCondition },
      });
      if (queued) {
        // Show it as taken so the hint stops nagging, and say why it is not
        // on the server yet.
        setFields((list) =>
          list.map((x) =>
            x.id === f.id
              ? { ...x, condition: f.suggestedCondition, suggestedCondition: null, conditionReason: null }
              : x,
          ),
        );
        setNotice("No network — that condition is saved on this device and will sync when you are back in signal.");
        refreshPending();
      } else {
        await load();
      }
      setError("");
    } catch (err) {
      setError(apiError(err, "Could not update that field's condition."));
    } finally {
      setCondBusy(null);
    }
  };

  // ---- schedule row actions ------------------------------------------------

  // Mark work done, cancel it, or re-open it. Status is its own endpoint rather
  // than part of update(), so the audit trail can distinguish "the job was
  // finished" from "someone fixed a typo in its title".
  const setSchedStatus = async (s, status) => {
    // A schedule created offline has no server id yet — its URL would be
    // /harvest-schedules/pending-<uuid>. Rather than invent a way to reorder
    // the queue so the create resolves first, say plainly that this one has to
    // reach the server before it can be changed. It will, on its own.
    if (s.pending) {
      setError(
        "That schedule has not reached the server yet. It will sync when you are back in signal, and can be changed after that.",
      );
      return;
    }
    setSchedBusy(s.id);
    try {
      const { queued } = await queueOrSend({
        path: `/harvest-schedules/${s.id}/status`,
        method: "PUT",
        body: { status },
      });
      if (queued) {
        setSchedules((list) =>
          list.map((x) => (x.id === s.id ? { ...x, status, pendingEdit: true } : x)),
        );
        setNotice("No network — that change is saved on this device and will sync when you are back in signal.");
        refreshPending();
      } else {
        await load();
      }
      setError("");
    } catch (err) {
      setError(apiError(err, "Could not update that schedule."));
    } finally {
      setSchedBusy(null);
    }
  };

  // A real delete. A schedule is a PLAN — no wage, weigh-in or ledger row ever
  // points at one, so removing a mistake destroys no history and the audit
  // trail keeps what it was. Work that was genuinely planned and then dropped
  // should be Cancelled instead, which is why both actions exist.
  const removeSchedule = async (s) => {
    // Never reached the server, so there is nothing to delete there. Dropping
    // it from the list alone would leave the queued CREATE to arrive later and
    // resurrect it, so say what is actually true.
    if (s.pending) {
      setError(
        "That schedule is still waiting to sync. It can be removed once it has reached the server.",
      );
      return;
    }
    setSchedBusy(s.id);
    try {
      const { queued } = await queueOrSend({
        path: `/harvest-schedules/${s.id}`,
        method: "DELETE",
      });
      setSchedules((list) => list.filter((x) => x.id !== s.id));
      if (queued) {
        setNotice("No network — that removal is saved on this device and will sync when you are back in signal.");
        refreshPending();
      }
      setError("");
    } catch (err) {
      setError(apiError(err, "Could not remove that schedule."));
    } finally {
      setSchedBusy(null);
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
          <span
            title={
              live
                ? "Connected. Weigh-ins, attendance marks and schedules appear here as they happen."
                : "Not connected. The figures are correct but will not update on their own."
            }
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ${
              live ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                live ? "animate-pulse bg-emerald-500" : "bg-slate-400"
              }`}
            />
            {live ? "Live" : "Offline"}
          </span>
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

      {notice && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-sky-50 px-4 py-2 text-sm text-sky-900 ring-1 ring-sky-200">
          <LuCloudOff size={15} className="shrink-0" />
          {notice}
          <button
            type="button"
            onClick={() => setNotice("")}
            className="ml-auto text-xs font-bold text-sky-700 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Nothing is lost while this is showing — it is on the phone, and it
          replays by itself. Saying so is the difference between a supervisor
          trusting the app in a dead spot and re-entering everything twice. */}
      {pending > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
          <LuCloudOff size={15} className="shrink-0" />
          {pending} change{pending === 1 ? "" : "s"} saved on this device, waiting
          for signal. {pending === 1 ? "It" : "They"} will sync automatically.
          <button
            type="button"
            onClick={() =>
              outboxFlush()
                .then(({ sent }) => {
                  refreshPending();
                  if (sent > 0) load().catch(() => {});
                })
                .catch(() => {})
            }
            className="ml-auto rounded-lg bg-white px-2.5 py-1 text-xs font-bold text-amber-900 ring-1 ring-amber-300"
          >
            Try now
          </button>
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
            {/* The old text sent people to the Attendance board to place a
                field. This page has its own Place and Move controls. */}
            <InfoTip text="Each placed field is drawn as a circle coloured by its ground condition. Fields in maintenance are greyed. Use Place a field below to drop a new pin, or Move on an existing marker to relocate one." />
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
            {/* Add / rename / retire. Separate from placing, because creating a
                field and knowing where it is are two different jobs done by two
                different people at two different times. */}
            <button
              type="button"
              onClick={() => setManageOpen(true)}
              title={
                isAdmin
                  ? "Add, rename or retire fields, and set daily targets"
                  : "Add, rename or retire fields. The daily target is set by the office."
              }
              className="rounded-xl bg-[#14493B] px-3 py-2 text-xs font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <LuSettings size={14} className="mr-1 inline" />
              Manage fields
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
              // Naming the field being edited makes the map draw ITS circle at
              // the draft size, so the slider is previewed live instead of
              // guessed at.
              editingZoneId={movingField?.id ?? null}
              draftPosition={dropped}
              draftRadiusM={Math.round(draftDiameter / 2)}
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

        {/* Size and position. Only while a specific field is being edited —
            placing a NEW marker goes through the "which field is this?" dialog,
            which sets the size itself. */}
        {movingField && dropped && (
          <div className="mt-2 rounded-xl bg-cg-lime/40 p-4 ring-1 ring-[#13483B59]">
            <p className="text-xs font-bold uppercase tracking-wide text-cg-ink/60">
              Editing {movingField.label}
            </p>
            <p className="mt-1 text-xs text-cg-ink/60">
              Click the map to move the pin, and drag the slider to match how
              big the block actually is.
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
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={saveGeometry}
                disabled={geoBusy}
                className="rounded-xl bg-[#14493B] px-4 py-2 text-xs font-bold text-white transition hover:brightness-110 disabled:opacity-50"
              >
                {geoBusy ? "Saving…" : "Save position and size"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMovingField(null);
                  setPlacing(false);
                  setDropped(null);
                }}
                className="rounded-xl bg-white px-3 py-2 text-xs font-bold text-[#14493B] ring-1 ring-[#13483B]/25"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <p className="mt-2 text-[11px] text-cg-ink/50">
          Click any marker on the map to move it, resize it, or remove it from
          the map.
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

      {/* Pluck round advice. Sits directly under the map and above the
          schedule it feeds: read what is overdue, then plan it. */}
      <FieldAiPanel
        onSchedule={(f) => {
          setSchedulePrefill({ zoneId: f.zoneId, title: `Pluck ${f.zoneName}` });
          setScheduleOpen(true);
        }}
      />

      {/* Upcoming Harvest Schedule */}
      <div className={`overflow-hidden rounded-2xl bg-white shadow ${CARD_STROKE}`}>
        <div className="flex flex-wrap items-center justify-between gap-2 bg-[#C0F28B] px-5 py-3">
          <div className="flex items-center gap-2 font-bold text-cg-ink">
            Upcoming Harvest Schedule
            <InfoTip text="Planned harvest and maintenance work per field, from today onwards. Saved on the server and shared with everyone — the date picker above changes which day's yield is shown, not which schedules are listed." />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              disabled={schedules.length === 0}
              title={
                schedules.length === 0
                  ? "Nothing scheduled to print yet"
                  : "A printable sheet to carry into the field, with a column to write the actual kilos in"
              }
              className="rounded-xl bg-white px-3 py-2 text-xs font-bold text-[#14493B] ring-1 ring-[#13483B]/25 transition hover:bg-cg-lime/40 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <LuPrinter size={14} className="mr-1 inline" /> Print / PDF
            </button>
            <button
              type="button"
              onClick={() => setScheduleOpen(true)}
              className="rounded-xl bg-[#14493B] px-4 py-2 text-xs font-bold text-white transition hover:brightness-110"
            >
              <LuCalendarPlus size={14} className="mr-1 inline" /> Create Harvest
              Schedule
            </button>
          </div>
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
                    {/* Scheduled-for, not Created. The day the work happens is
                        the only date a supervisor is planning around. */}
                    <th className="bg-[#D3FFAC] px-5 py-3">Scheduled</th>
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
                        {s.date
                          ? new Date(`${s.date}T00:00:00`).toLocaleDateString("en-GB", {
                              day: "numeric",
                              month: "short",
                            })
                          : "—"}
                        {/* Overdue is computed on the server: the day has
                            passed and the work is still only planned. */}
                        {s.overdue && (
                          <span className="ml-2 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold uppercase text-rose-700">
                            overdue
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 font-semibold text-cg-green">
                        {s.zoneName}
                      </td>
                      <td className="px-5 py-3">
                        <p className="font-semibold text-cg-ink">{s.title}</p>
                        {s.workerName ? (
                          <p className="text-xs text-cg-ink/40">{s.workerName}</p>
                        ) : (
                          <p className="text-xs italic text-cg-ink/30">
                            nobody assigned
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-3 capitalize text-cg-ink/70">{s.type}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-cg-ink">
                        {s.expectedKg ? `${Number(s.expectedKg).toFixed(0)} kg` : "—"}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                            SCHED_STATUS[s.status] || SCHED_STATUS.planned
                          }`}
                        >
                          {s.status}
                        </span>
                        {/* This row exists only on this phone. Marking it is
                            what makes the disabled actions below make sense. */}
                        {(s.pending || s.pendingEdit) && (
                          <span
                            title="Saved on this device. It will sync by itself when you are back in signal."
                            className="mt-1 flex items-center gap-1 text-[10px] font-bold uppercase text-amber-700"
                          >
                            <LuCloudOff size={11} /> not synced
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {s.status !== "done" && s.status !== "cancelled" && (
                            <button
                              type="button"
                              disabled={schedBusy === s.id || !!s.pending}
                              onClick={() => setSchedStatus(s, "done")}
                              title="Mark this work as finished"
                              className="text-xs font-semibold text-cg-green hover:underline disabled:opacity-40"
                            >
                              Done
                            </button>
                          )}
                          {s.status !== "cancelled" && s.status !== "done" && (
                            <button
                              type="button"
                              disabled={schedBusy === s.id || !!s.pending}
                              onClick={() => setSchedStatus(s, "cancelled")}
                              title="Planned, then dropped — keeps the record"
                              className="text-xs font-semibold text-amber-700 hover:underline disabled:opacity-40"
                            >
                              Cancel
                            </button>
                          )}
                          {(s.status === "done" || s.status === "cancelled") && (
                            <button
                              type="button"
                              disabled={schedBusy === s.id || !!s.pending}
                              onClick={() => setSchedStatus(s, "planned")}
                              title="Put this back on the plan"
                              className="text-xs font-semibold text-sky-700 hover:underline disabled:opacity-40"
                            >
                              Re-open
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={schedBusy === s.id || !!s.pending}
                            onClick={() => removeSchedule(s)}
                            title="Entered by mistake — deletes it. Use Cancel for work that was really planned."
                            className="text-xs font-semibold text-rose-600 hover:underline disabled:opacity-40"
                          >
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between gap-3 bg-[#D3FFAC] px-5 py-3 text-sm">
              <span className="text-xs font-semibold text-cg-ink/70">
                Showing {schedPage.length} of {schedules.length}
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
                        {/* A SUGGESTION, never applied. The server only sends
                            one when it disagrees with what is recorded, and the
                            reason is always shown — a hint you cannot check is
                            just noise. Accepting it is one tap; ignoring it is
                            doing nothing. */}
                        {f.suggestedCondition && (
                          <div className="mt-1.5 max-w-[15rem]">
                            <p className="text-[11px] leading-snug text-cg-ink/55">
                              {f.conditionReason}
                            </p>
                            <button
                              type="button"
                              disabled={condBusy === f.id}
                              onClick={() => applyCondition(f)}
                              title="Records this as the field's condition. You can change it back at any time."
                              className="mt-1 rounded-lg bg-white px-2 py-1 text-[10px] font-bold text-[#14493B] ring-1 ring-[#13483B]/25 transition hover:bg-cg-lime/40 disabled:opacity-40"
                            >
                              {condBusy === f.id
                                ? "Saving…"
                                : `Mark as ${f.suggestedCondition}`}
                            </button>
                          </div>
                        )}
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

      <FieldManagerModal
        canSetTarget={isAdmin}
        open={manageOpen}
        onClose={() => setManageOpen(false)}
        onChanged={load}
      />

      {/* Prints what is on the board: cancelled jobs are already filtered out
          server-side, so the sheet carried into the field matches the screen. */}
      <HarvestScheduleDocument
        open={sheetOpen}
        rows={schedules}
        onClose={() => setSheetOpen(false)}
      />

      <AssignFieldDialog
        // "Which field is this?" only applies to a NEW marker. While an
        // existing field is being moved or resized we already know which field
        // it is, and `dropped` is seeded with its current position — so without
        // the movingField guard this dialog would open the instant Move was
        // pressed and cover the size slider.
        open={!!dropped && !movingField}
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
        schedules={schedules}
        prefill={schedulePrefill}
        // Online: refetch, because the server owns the id, the owning
        // supervisor and created_at. Queued: splice in the optimistic row the
        // modal built, matching on id so an edit replaces rather than
        // duplicating.
        onSaved={({ queued, row }) => {
          if (!queued) {
            load().catch(() => {});
            return;
          }
          setSchedules((list) =>
            list.some((x) => x.id === row.id)
              ? list.map((x) => (x.id === row.id ? row : x))
              : [row, ...list],
          );
          refreshPending();
        }}
        onClose={() => {
          setScheduleOpen(false);
          setSchedulePrefill(null);
        }}
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
