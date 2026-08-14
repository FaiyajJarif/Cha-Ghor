import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LuUsers,
  LuCircleCheck,
  LuCircleX,
  LuClock,
  LuCheckCheck,
  LuChevronLeft,
  LuChevronRight,
  LuLayoutList,
  LuSave,
  LuDownload,
  LuPrinter,
  LuTriangleAlert,
} from "react-icons/lu";
import api from "../../api/client";
import { apiError } from "../../lib/apiError";
import { queueOrSend, count as outboxCount, flush as outboxFlush } from "../../lib/outbox";
import { newUuid } from "../../lib/uuid";
import { WS_BASE } from "../../lib/config";
import { closeSocket } from "../../lib/ws";
import { BTN_DARK, BTN_GHOST } from "../../lib/ui";
import InfoTip from "../../components/admin/InfoTip";
import AttendanceDrawer from "../../components/supervisor/AttendanceDrawer";
import ZonePicker from "../../components/supervisor/ZonePicker";
import ZoneHeatmap from "../../components/supervisor/ZoneHeatmap";
import WorkerMonthModal from "../../components/supervisor/WorkerMonthModal";
import AttendanceAiPanel from "../../components/supervisor/AttendanceAiPanel";
import { todayISO } from "../../lib/localDate";

// Supervisor attendance register.
//
// HOW SAVING WORKS: the table is a DRAFT held in local state. Marking someone
// present changes nothing on the server until "Save Attendance Data" is
// pressed, which sends the whole register in one POST /attendance/bulk. That
// matters in the field — a supervisor works down a list of names on a phone
// with bad signal, and a per-row request would leave the register half-written
// when the connection drops.
//
// The backend upserts on UNIQUE(worker_id, work_date), so saving twice is safe
// and re-saving a corrected register just overwrites it.


const CARD_STROKE = "ring-1 ring-[#13483B59]";
const PAGE_SIZE = 8;
const HISTORY_PAGE_SIZE = 5;

// Print stylesheet for the PDF export. Same technique as PayslipDocument and
// ReportDocument: hide the app, show only the print sheet, and let the browser's
// "Save as PDF" destination produce the file. No PDF library.
//
// The print root is a SIBLING of the app content, never nested inside anything
// hidden — a display:none ancestor cannot be undone by visibility on a
// descendant, which is exactly what made the payslip PDF print blank pages.
const PRINT_CSS = `
#attendance-print-root { display: none; }
@media print {
  body * { visibility: hidden !important; }
  #attendance-print-root, #attendance-print-root * { visibility: visible !important; }
  #attendance-print-root {
    display: block !important;
    position: absolute !important;
    left: 0 !important; top: 0 !important;
    width: 100% !important;
    background: #fff !important;
  }
  tr, td, th { page-break-inside: avoid; break-inside: avoid; }
  thead { display: table-header-group; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
}
@page { size: A4 portrait; margin: 14mm; }
`;

const STATUS_STYLE = {
  present: "text-emerald-700",
  late: "text-amber-700",
  absent: "text-rose-600",
  leave: "text-cg-green",
};

const CYCLE = ["present", "late", "absent", "leave"];

function Kpi({ icon: Icon, label, value, sub, tone = "green" }) {
  const chip =
    tone === "red"
      ? "bg-rose-100 text-rose-600"
      : tone === "amber"
        ? "bg-amber-100 text-amber-700"
        : "bg-cg-lime text-cg-green";
  return (
    <div className={`rounded-2xl bg-white p-5 shadow ${CARD_STROKE}`}>
      <div className="flex items-start justify-between">
        <p className="text-xs font-bold uppercase tracking-wide text-cg-ink/50">
          {label}
        </p>
        <span className={`grid h-9 w-9 place-items-center rounded-xl ${chip}`}>
          <Icon size={18} />
        </span>
      </div>
      <p className="mt-2 text-3xl font-extrabold text-cg-ink">{value}</p>
      {sub ? <p className="mt-1 text-xs text-cg-ink/50">{sub}</p> : null}
    </div>
  );
}

export default function SupervisorAttendance() {
  const [date, setDate] = useState(todayISO());
  const [workers, setWorkers] = useState([]);
  const [zones, setZones] = useState([]);
  const [draft, setDraft] = useState({}); // workerId -> { status, zoneId }
  const [summary, setSummary] = useState(null);
  const [history, setHistory] = useState([]);
  const [zoneFilter, setZoneFilter] = useState("");
  const [page, setPage] = useState(0);
  const [histPage, setHistPage] = useState(0);
  const [printing, setPrinting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  // How many saves are sitting in the device outbox waiting for signal. Shown
  // so a supervisor can see their work is held safely rather than lost, and
  // knows not to close the app assuming it reached the estate office.
  const [pending, setPending] = useState(0);
  // Which worker's month is open. Null = closed.
  const [monthFor, setMonthFor] = useState(null);
  const [live, setLive] = useState(false);
  // Someone else changed this register while marks were in progress here.
  // Never resolved automatically — see the socket handler below.
  const [remoteChanged, setRemoteChanged] = useState(false);

  // The draft exactly as the server last gave it to us. Comparing the live
  // draft against this is how we know whether the supervisor has unsaved marks,
  // which decides whether a background refresh is allowed to touch the table.
  const serverDraftRef = useRef({});

  // `keepDraft` is the whole reason this function takes an argument.
  //
  // THE TABLE IS AN UNSAVED DRAFT until "Save Attendance Data" is pressed. A
  // refetch calls setDraft() and replaces it wholesale, so refreshing on a
  // socket frame while a supervisor is halfway through a register of 60 workers
  // would silently wipe every mark they had made and not yet saved. That is the
  // single worst thing this page could do, so a background refresh takes the
  // read-only parts and leaves the register alone.
  const load = useCallback(async (keepDraft = false) => {
    const [w, m, a, s, t] = await Promise.all([
      api.get("/workers"),
      api.get("/workers/meta"),
      api.get("/attendance", { params: { date } }),
      api.get("/attendance/summary", { params: { date } }),
      api.get("/attendance/trend", { params: { days: 14 } }),
    ]);
    setWorkers(w.data || []);
    setZones(m.data?.zones || []);
    setSummary(s.data);
    setHistory([...(t.data || [])].reverse()); // newest first for the history list

    // Seed the draft from whatever is already saved for this date. A worker
    // with no row yet is left undefined rather than defaulted to present —
    // "not yet marked" is a real state and must not be silently saved as
    // attendance nobody actually took.
    const next = {};
    for (const row of a.data || []) {
      next[row.workerId] = {
        status: row.status,
        zoneId: row.zoneId ?? null,
        lateMinutes: row.lateMinutes ?? null,
      };
    }
    serverDraftRef.current = next;
    if (!keepDraft) setDraft(next);
    return next;
  }, [date]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setNotice("");
    setPage(0);
    load()
      .catch(
        (err) =>
          active &&
          setError(
            apiError(err, "Could not load the attendance register."),
          ),
      )
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [load]);

  // Keep the pending badge honest, and push the queue the moment signal
  // returns rather than waiting for the next Background Sync wake-up.
  useEffect(() => {
    let alive = true;
    const refresh = () =>
      outboxCount()
        .then((n) => alive && setPending(n))
        .catch(() => {});
    refresh();
    const onOnline = () => {
      outboxFlush()
        .then(refresh)
        // Same guard as the socket path: a flush that lands while the
        // supervisor is mid-register must not replace the table under them.
        .then(() => alive && load(isDirtyRef.current).catch(() => {}))
        .catch(() => {});
    };
    window.addEventListener("online", onOnline);
    const timer = setInterval(refresh, 15000);
    return () => {
      alive = false;
      window.removeEventListener("online", onOnline);
      clearInterval(timer);
    };
  }, [load]);

  // Does the supervisor have marks that are not on the server yet?
  //
  // Compared against the last server copy rather than tracked with a flag,
  // because a flag would have to be cleared in every one of the several places
  // that write to the draft, and missing one would mean either losing work or
  // nagging about a conflict that does not exist.
  const isDirty = useMemo(() => {
    const a = serverDraftRef.current || {};
    const keys = new Set([...Object.keys(a), ...Object.keys(draft)]);
    for (const k of keys) {
      const x = a[k];
      const y = draft[k];
      if (!x || !y) return true;
      if (x.status !== y.status) return true;
      if ((x.zoneId ?? null) !== (y.zoneId ?? null)) return true;
      if ((x.lateMinutes ?? null) !== (y.lateMinutes ?? null)) return true;
    }
    return false;
  }, [draft]);

  const isDirtyRef = useRef(isDirty);
  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  // Live updates.
  //
  // This page had no socket at all, which meant a register amended from the
  // admin console, or a field renamed while this screen sat open, simply did
  // not show until someone reloaded.
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
        if (kind !== "attendance.saved" && kind !== "zone.saved") return;
        if (!loadRef.current) return;

        // Refresh the summary, the trend and the field list either way — none
        // of those can destroy work in progress. The REGISTER is only re-seeded
        // when there is nothing unsaved to lose; otherwise the supervisor is
        // told and decides for themselves.
        const keepDraft = isDirtyRef.current;
        loadRef.current(keepDraft)
          .then(() => {
            if (keepDraft) setRemoteChanged(true);
          })
          .catch(() => {});
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

  const activeWorkers = useMemo(
    () => workers.filter((w) => String(w.status).toLowerCase() === "active"),
    [workers],
  );

  // One row per active worker, merged with the draft.
  const rows = useMemo(
    () =>
      activeWorkers.map((w) => ({
        workerId: w.id,
        name: w.fullName,
        homeZoneId: w.zoneId ?? null,
        homeZoneName: w.zoneName || "—",
        jobRole: w.jobRole,
        status: draft[w.id]?.status ?? null,
        zoneId: draft[w.id]?.zoneId ?? null,
        lateMinutes: draft[w.id]?.lateMinutes ?? null,
      })),
    [activeWorkers, draft],
  );

  const visible = useMemo(
    () =>
      zoneFilter
        ? rows.filter((r) => String(r.zoneId ?? r.homeZoneId) === zoneFilter)
        : rows,
    [rows, zoneFilter],
  );

  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const pageRows = visible.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  // Counts come from the draft, so the KPIs move as the supervisor marks
  // people rather than only after saving.
  const counts = useMemo(() => {
    const c = { present: 0, late: 0, absent: 0, leave: 0, unmarked: 0 };
    for (const r of rows) {
      if (!r.status) c.unmarked++;
      else c[r.status] = (c[r.status] || 0) + 1;
    }
    return c;
  }, [rows]);

  // Days that actually have a register, newest first.
  const historyRows = useMemo(
    () => history.filter((d) => d.present + d.absent + d.late + d.onLeave > 0),
    [history],
  );
  const historyTotalPages = Math.max(
    1,
    Math.ceil(historyRows.length / HISTORY_PAGE_SIZE),
  );

  const setStatus = (workerId, status) => {
    setDraft((d) => ({ ...d, [workerId]: { ...d[workerId], status } }));
    setNotice("");
  };
  const setZone = (workerId, zoneId) => {
    setDraft((d) => ({ ...d, [workerId]: { ...d[workerId], zoneId } }));
    setNotice("");
  };
  const cycleStatus = (r) => {
    const i = CYCLE.indexOf(r.status);
    setStatus(r.workerId, CYCLE[(i + 1) % CYCLE.length]);
  };

  const markAllPresent = () => {
    setDraft((d) => {
      const next = { ...d };
      for (const r of rows) {
        next[r.workerId] = { ...next[r.workerId], status: "present" };
      }
      return next;
    });
    setNotice("");
  };

  // Record HOW late, not just that they were late. The minutes are what let
  // the AI layer tell a one-off from a persistent pattern, which is the whole
  // reason this is stored rather than a boolean.
  const setLateMinutes = (workerId, minutes) => {
    setDraft((d) => ({
      ...d,
      [workerId]: {
        ...(d[workerId] || {}),
        status: d[workerId]?.status || "late",
        lateMinutes:
          minutes === "" || minutes === null
            ? null
            : Math.max(0, Math.min(1440, Number(minutes))),
      },
    }));
    setNotice("");
  };

  const save = async () => {
    // markedAt is stamped HERE, at the moment the supervisor pressed Save --
    // not when the request reaches the server. On a phone that has been out of
    // signal those differ by hours, and the server uses this to decide
    // conflicts: an office correction made at midday is not undone by a handset
    // that reconnects at 17:00 still carrying the morning register.
    const markedAt = new Date().toISOString();
    const entries = rows
      .filter((r) => r.status) // never save a worker nobody marked
      .map((r) => ({
        workerId: r.workerId,
        status: r.status,
        zoneId: r.zoneId ?? null,
        // Only meaningful on a late row; the server ignores it otherwise.
        lateMinutes: r.status === "late" ? (r.lateMinutes ?? null) : null,
        // Stable per (worker, date, save) so a replayed batch is recognised as
        // the same marks rather than applied twice.
        clientUuid: newUuid(),
        markedAt,
      }));
    if (entries.length === 0) {
      setError("Mark at least one worker before saving.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      // queueOrSend tries the network first and falls back to the IndexedDB
      // outbox, which the service worker replays on Background Sync. A
      // supervisor in a dead spot can finish the register and walk away.
      const { queued } = await queueOrSend({
        path: "/attendance/bulk",
        body: { date, entries },
        clientUuid: newUuid(),
      });

      if (queued) {
        setNotice(
          `No network — ${entries.length} marks for ${date} are saved on this device and will sync by themselves when you are back in signal. You can close the app.`,
        );
        return;
      }

      const { data } = await api.get("/attendance/summary", { params: { date } });
      setSummary(data);
      setNotice(`Saved ${entries.length} records for ${date}.`);
    } catch (err) {
      setError(apiError(err, "Could not save the attendance register."));
    } finally {
      setSaving(false);
    }
  };

  const exportCsv = () => {
    const head = ["worker_id", "name", "status", "field", "date"];
    const body = rows
      .filter((r) => r.status)
      .map((r) => [
        r.workerId,
        `"${(r.name || "").replace(/"/g, '""')}"`,
        r.status,
        `"${zones.find((z) => z.id === (r.zoneId ?? r.homeZoneId))?.label ?? ""}"`,
        date,
      ]);
    const csv = [head, ...body].map((r) => r.join(",")).join("\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // PDF via the browser's own print dialog, the same approach as the payslip
  // and report documents: no PDF library, smaller file, selectable text.
  // `printing` swaps in a print-only sheet with the FULL register, so the PDF
  // is never just whichever page happened to be on screen.
  const exportPdf = () => {
    setPrinting(true);
    // Let React paint the print sheet before the dialog blocks the thread.
    setTimeout(() => {
      window.print();
      setPrinting(false);
    }, 50);
  };

  if (loading) {
    return (
      <div className="grid h-64 place-items-center text-sm text-cg-ink/60">
        {"Loading attendance…"}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-cg-ink">Attendance</h1>
          <p className="text-sm text-cg-ink/60">
            Mark the register for a day, assign fields, then save.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            title={
              live
                ? "Connected. Changes made elsewhere appear here. Marks you have not saved are never overwritten."
                : "Not connected. The register is correct but will not update on its own."
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
          <button type="button" className={BTN_GHOST} onClick={() => setDrawerOpen(true)}>
            <LuLayoutList size={15} /> View all
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-800 ring-1 ring-emerald-200">
          {notice}
        </div>
      )}

      {/* Someone else changed this register while marks are in progress here.
          NEVER resolved automatically: replacing the table would throw away
          work that is on screen and not yet saved, and quietly keeping the
          local copy would hide the fact that the server has moved on. So it
          says what happened and offers both ways out. */}
      {remoteChanged && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
          <LuTriangleAlert size={15} className="shrink-0" />
          This register was changed somewhere else while you were marking. Your
          marks on screen are untouched.
          <button
            type="button"
            onClick={() => {
              load(false)
                .then(() => setRemoteChanged(false))
                .catch(() => {});
            }}
            className="ml-auto rounded-lg bg-white px-2.5 py-1 text-xs font-bold text-amber-900 ring-1 ring-amber-300"
          >
            Load their version
          </button>
          <button
            type="button"
            onClick={() => setRemoteChanged(false)}
            title="Your marks win when you press Save."
            className="rounded-lg px-2 py-1 text-xs font-bold text-amber-900/70"
          >
            Keep mine
          </button>
        </div>
      )}

      {/* KPIs — driven by the draft, so they move as you mark */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          icon={LuUsers}
          label="Total Workers"
          value={activeWorkers.length}
          sub={
            counts.unmarked > 0
              ? `${counts.unmarked} not marked yet`
              : "All workers marked"
          }
        />
        <Kpi
          icon={LuCircleCheck}
          label="Present Today"
          value={counts.present}
          sub={
            activeWorkers.length
              ? `${Math.round((counts.present / activeWorkers.length) * 100)}% of the workforce`
              : "No active workers"
          }
        />
        <Kpi
          icon={LuCircleX}
          label="Absent Today"
          tone="red"
          value={counts.absent}
          sub={`${counts.leave} on leave`}
        />
        <Kpi
          icon={LuClock}
          label="Late Arrival"
          tone="amber"
          value={counts.late}
          sub={summary ? `${summary.marked} saved on the server` : ""}
        />
      </div>

      {/* Controls */}
      <div
        className={`flex flex-wrap items-center gap-3 rounded-2xl bg-white p-4 shadow ${CARD_STROKE}`}
      >
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border border-cg-green/30 px-3 py-2 text-sm outline-none focus:border-cg-green"
        />
        <div className="w-48">
          <ZonePicker
            value={zoneFilter ? Number(zoneFilter) : null}
            zones={zones}
            homeZoneName="All fields"
            placeholder="All fields"
            size="lg"
            onChange={(id) => {
              setZoneFilter(id ? String(id) : "");
              setPage(0);
            }}
          />
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button type="button" className={BTN_GHOST} onClick={exportCsv}>
            <LuDownload size={15} /> CSV
          </button>
          <button type="button" className={BTN_GHOST} onClick={exportPdf}>
            <LuPrinter size={15} /> PDF
          </button>
          <button type="button" className={BTN_GHOST} onClick={markAllPresent}>
            <LuCheckCheck size={15} /> Mark all present
          </button>
          <button
            type="button"
            className={BTN_DARK}
            onClick={save}
            disabled={saving}
          >
            <LuSave size={15} /> {saving ? "Saving…" : "Save Attendance Data"}
          </button>
          {/* Held-on-device count. A supervisor who saved in a dead spot needs
              to see their work is safe, not wonder whether it vanished. */}
          {pending > 0 && (
            <span
              title="Saved on this device. It uploads by itself when signal returns — you can close the app."
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-100 px-3 py-2 text-xs font-bold text-amber-800 ring-1 ring-amber-300"
            >
              <LuClock size={14} />
              {pending} waiting to sync
            </span>
          )}
        </div>
      </div>

      {/* Register */}
      <div className={`overflow-hidden rounded-2xl bg-white shadow ${CARD_STROKE}`}>
        <div className="flex flex-wrap items-center justify-between gap-2 bg-[#C0F28B] px-5 py-3">
          <div className="flex items-center gap-2 font-bold text-cg-ink">
            Today&apos;s Attendance
            <InfoTip text="Tap a status to cycle Present → Late → Absent → Leave. Assign a field for anyone who turned up. Nothing is written until you press Save." />
          </div>
          <span className="text-xs font-semibold text-cg-ink/70">
            Showing {visible.length === 0 ? 0 : page * PAGE_SIZE + 1}–
            {Math.min((page + 1) * PAGE_SIZE, visible.length)} of {visible.length}
          </span>
        </div>

        {visible.length === 0 ? (
          <div className="grid h-40 place-items-center text-sm text-cg-ink/50">
            {zoneFilter
              ? "No workers in that field."
              : "No active workers to mark."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-cg-ink/50">
                <tr>
                  <th className="bg-[#D3FFAC] px-5 py-3">Worker ID</th>
                  <th className="bg-[#D3FFAC] px-5 py-3">Name</th>
                  <th className="bg-[#D3FFAC] px-5 py-3">Assigned field</th>
                  <th className="bg-[#D3FFAC] px-5 py-3">Status</th>
                  <th className="bg-[#D3FFAC] px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cg-green/10">
                {pageRows.map((r) => (
                  <tr key={r.workerId} className="hover:bg-cg-lime/20">
                    <td className="px-5 py-3 font-semibold text-cg-ink">
                      #CG{String(r.workerId).padStart(3, "0")}
                    </td>
                    <td className="px-5 py-3">
                      {/* Opens this worker's month: present / late / absent,
                          and how many days nobody marked. */}
                      <button
                        type="button"
                        onClick={() =>
                          setMonthFor({ id: r.workerId, name: r.name })
                        }
                        title={`See ${r.name}'s attendance this month`}
                        className="text-left"
                      >
                        <p className="font-semibold text-cg-ink underline decoration-cg-green/30 underline-offset-2 hover:decoration-cg-green">
                          {r.name}
                        </p>
                        <p className="text-xs text-cg-ink/40">{r.jobRole}</p>
                      </button>
                    </td>
                    <td className="px-5 py-3">
                      {/* Only someone who turned up can be sent to a field. */}
                      {r.status === "present" || r.status === "late" ? (
                        <div className="w-40">
                          <ZonePicker
                            value={r.zoneId}
                            zones={zones}
                            homeZoneName={r.homeZoneName}
                            onChange={(id) => setZone(r.workerId, id)}
                          />
                        </div>
                      ) : (
                        <span className="text-xs text-cg-ink/30">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`font-bold uppercase ${
                          r.status ? STATUS_STYLE[r.status] : "text-cg-ink/25"
                        }`}
                      >
                        {r.status || "Not marked"}
                      </span>
                      {/* How late, only where it means anything. Left blank
                          rather than defaulted to 0, because "late by an amount
                          nobody wrote down" is a different fact from "on time". */}
                      {r.status === "late" && (
                        <span className="mt-1 flex items-center gap-1">
                          <input
                            type="number"
                            min={0}
                            max={1440}
                            value={r.lateMinutes ?? ""}
                            onChange={(e) => setLateMinutes(r.workerId, e.target.value)}
                            placeholder="—"
                            aria-label={`Minutes late for ${r.name}`}
                            className="w-16 rounded-md border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-xs font-semibold text-amber-800 outline-none focus:border-amber-500"
                          />
                          <span className="text-[10px] font-semibold text-cg-ink/40">
                            min late
                          </span>
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => cycleStatus(r)}
                        className="rounded-lg border border-cg-green/30 px-3 py-1 text-xs font-semibold text-cg-ink transition hover:bg-cg-lime/50"
                      >
                        {r.status ? "Change" : "Mark"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {visible.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 bg-[#D3FFAC] px-5 py-3 text-sm">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-semibold text-cg-ink/70 transition hover:bg-white/60 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <LuChevronLeft size={15} /> Previous
            </button>
            <span className="text-xs font-semibold text-cg-ink/70">
              Page {page + 1} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page + 1 >= totalPages}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-semibold text-cg-ink/70 transition hover:bg-white/60 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next <LuChevronRight size={15} />
            </button>
          </div>
        )}
      </div>

      {/* Attendance insights — heatmap by field */}
      <div className={`rounded-2xl bg-white p-5 shadow ${CARD_STROKE}`}>
        <div className="mb-4 flex items-center gap-2">
          <h2 className="font-bold text-cg-ink">Attendance Insights</h2>
          <InfoTip text="Each field is coloured by how much of its assigned crew turned up today, using the register on this page. Workers count towards the field they are assigned to, or their home zone if none was set." />
        </div>
        <ZoneHeatmap rows={rows} zones={zones} onZonesChanged={load} />
      </div>

      {/* AI: register checks + month review */}
      <AttendanceAiPanel date={date} marked={summary?.marked ?? 0} />

      {/* History + summary */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div
          className={`overflow-hidden rounded-2xl bg-white shadow lg:col-span-2 ${CARD_STROKE}`}
        >
          <div className="bg-[#C0F28B] px-5 py-3 font-bold text-cg-ink">
            Attendance History
          </div>
          {historyRows.length === 0 ? (
            <div className="grid h-32 place-items-center px-6 text-center text-sm text-cg-ink/50">
              No attendance saved in the last 14 days yet.
            </div>
          ) : (
            <ul className="divide-y divide-cg-green/10">
              {historyRows
                .slice(
                  histPage * HISTORY_PAGE_SIZE,
                  histPage * HISTORY_PAGE_SIZE + HISTORY_PAGE_SIZE,
                )
                .map((d) => (
                  <li
                    key={d.date}
                    className="flex flex-wrap items-center gap-3 px-5 py-3"
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-cg-dark text-xs font-bold leading-tight text-white">
                      {d.date.slice(8, 10)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-cg-ink">
                        Daily summary — {d.date}
                      </p>
                      <p className="text-xs text-cg-ink/50">{d.label}</p>
                    </div>
                    <div className="flex gap-4 text-center text-xs">
                      <span>
                        <b className="block text-sm text-cg-ink">{d.present}</b>
                        present
                      </span>
                      <span>
                        <b className="block text-sm text-amber-700">{d.late}</b>
                        late
                      </span>
                      <span>
                        <b className="block text-sm text-rose-600">{d.absent}</b>
                        absent
                      </span>
                    </div>
                  </li>
                ))}
            </ul>
          )}

          {historyRows.length > HISTORY_PAGE_SIZE && (
            <div className="flex items-center justify-between gap-3 bg-[#D3FFAC] px-5 py-3 text-sm">
              <button
                type="button"
                onClick={() => setHistPage((p) => Math.max(0, p - 1))}
                disabled={histPage === 0}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-semibold text-cg-ink/70 transition hover:bg-white/60 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <LuChevronLeft size={15} /> Previous
              </button>
              <span className="text-xs font-semibold text-cg-ink/70">
                Page {histPage + 1} of {historyTotalPages}
              </span>
              <button
                type="button"
                onClick={() =>
                  setHistPage((p) => Math.min(historyTotalPages - 1, p + 1))
                }
                disabled={histPage + 1 >= historyTotalPages}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-semibold text-cg-ink/70 transition hover:bg-white/60 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next <LuChevronRight size={15} />
              </button>
            </div>
          )}
        </div>

        <div className={`rounded-2xl bg-white p-5 shadow ${CARD_STROKE}`}>
          <h2 className="mb-3 font-bold text-cg-ink">Summary</h2>
          <ul className="space-y-2 text-sm">
            {[
              ["Present", counts.present, "bg-emerald-100 text-emerald-700"],
              ["Late", counts.late, "bg-amber-100 text-amber-800"],
              ["Absent", counts.absent, "bg-rose-100 text-rose-700"],
              ["On leave", counts.leave, "bg-cg-lime text-cg-green"],
              ["Not marked", counts.unmarked, "bg-cg-lime/40 text-cg-ink/50"],
            ].map(([label, n, cls]) => (
              <li
                key={label}
                className="flex items-center justify-between rounded-xl bg-cg-lime/30 px-3 py-2"
              >
                <span className="font-semibold text-cg-ink">{label}</span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${cls}`}
                >
                  {n}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-cg-ink/40">
            Counts reflect what is on screen. Press Save to write them to the
            server.
          </p>
        </div>
      </div>

      {/* Print-only sheet: the FULL register, not just the page on screen.
          Rendered as a sibling of everything else — never inside a hidden
          wrapper — so it cannot end up display:none when printing. */}
      <style>{PRINT_CSS}</style>
      {printing && (
        <div id="attendance-print-root">
          <div style={{ padding: "0 0 12px" }}>
            <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>
              Cha Ghor — Daily Attendance
            </h1>
            <p style={{ fontSize: 12, color: "#555", margin: "2px 0 0" }}>
              {date} · {counts.present} present · {counts.late} late ·{" "}
              {counts.absent} absent · {counts.leave} on leave ·{" "}
              {counts.unmarked} not marked
            </p>
          </div>
          <table
            style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}
          >
            <thead>
              <tr style={{ background: "#D3FFAC" }}>
                <th style={{ border: "1px solid #ccc", padding: 6, textAlign: "left" }}>
                  Worker ID
                </th>
                <th style={{ border: "1px solid #ccc", padding: 6, textAlign: "left" }}>
                  Name
                </th>
                <th style={{ border: "1px solid #ccc", padding: 6, textAlign: "left" }}>
                  Role
                </th>
                <th style={{ border: "1px solid #ccc", padding: 6, textAlign: "left" }}>
                  Field
                </th>
                <th style={{ border: "1px solid #ccc", padding: 6, textAlign: "left" }}>
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.workerId}>
                  <td style={{ border: "1px solid #ccc", padding: 6 }}>
                    CG{String(r.workerId).padStart(3, "0")}
                  </td>
                  <td style={{ border: "1px solid #ccc", padding: 6 }}>{r.name}</td>
                  <td style={{ border: "1px solid #ccc", padding: 6 }}>
                    {r.jobRole}
                  </td>
                  <td style={{ border: "1px solid #ccc", padding: 6 }}>
                    {zones.find((z) => z.id === (r.zoneId ?? r.homeZoneId))
                      ?.label ?? "—"}
                  </td>
                  <td style={{ border: "1px solid #ccc", padding: 6 }}>
                    {r.status || "not marked"}
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

      <WorkerMonthModal
        open={!!monthFor}
        workerId={monthFor?.id}
        workerName={monthFor?.name}
        onClose={() => setMonthFor(null)}
      />

      <AttendanceDrawer
        open={drawerOpen}
        date={date}
        rows={rows}
        zones={zones}
        onSetStatus={setStatus}
        onSetZone={setZone}
        onMarkAllPresent={markAllPresent}
        onSave={save}
        saving={saving}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}
