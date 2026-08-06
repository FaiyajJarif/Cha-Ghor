import { useCallback, useEffect, useMemo, useState } from "react";
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
} from "react-icons/lu";
import api from "../../api/client";
import { apiError } from "../../lib/apiError";
import { BTN_DARK, BTN_GHOST } from "../../lib/ui";
import InfoTip from "../../components/admin/InfoTip";
import AttendanceDrawer from "../../components/supervisor/AttendanceDrawer";

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
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [workers, setWorkers] = useState([]);
  const [zones, setZones] = useState([]);
  const [draft, setDraft] = useState({}); // workerId -> { status, zoneId }
  const [summary, setSummary] = useState(null);
  const [history, setHistory] = useState([]);
  const [zoneFilter, setZoneFilter] = useState("");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);

  const load = useCallback(async () => {
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
      next[row.workerId] = { status: row.status, zoneId: row.zoneId ?? null };
    }
    setDraft(next);
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

  const save = async () => {
    const entries = rows
      .filter((r) => r.status) // never save a worker nobody marked
      .map((r) => ({
        workerId: r.workerId,
        status: r.status,
        zoneId: r.zoneId ?? null,
      }));
    if (entries.length === 0) {
      setError("Mark at least one worker before saving.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api.post("/attendance/bulk", { date, entries });
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
        <button type="button" className={BTN_GHOST} onClick={() => setDrawerOpen(true)}>
          <LuLayoutList size={15} /> View all
        </button>
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
        <select
          value={zoneFilter}
          onChange={(e) => {
            setZoneFilter(e.target.value);
            setPage(0);
          }}
          className="rounded-lg border border-cg-green/30 px-3 py-2 text-sm outline-none focus:border-cg-green"
        >
          <option value="">All fields</option>
          {zones.map((z) => (
            <option key={z.id} value={String(z.id)}>
              {z.label}
            </option>
          ))}
        </select>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button type="button" className={BTN_GHOST} onClick={exportCsv}>
            Export CSV
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
                      <p className="font-semibold text-cg-ink">{r.name}</p>
                      <p className="text-xs text-cg-ink/40">{r.jobRole}</p>
                    </td>
                    <td className="px-5 py-3">
                      {/* Only someone who turned up can be sent to a field. */}
                      {r.status === "present" || r.status === "late" ? (
                        <select
                          value={r.zoneId ?? ""}
                          onChange={(e) =>
                            setZone(
                              r.workerId,
                              e.target.value ? Number(e.target.value) : null,
                            )
                          }
                          className="rounded-lg border border-cg-green/30 px-2 py-1 text-xs outline-none focus:border-cg-green"
                        >
                          <option value="">{r.homeZoneName} (home)</option>
                          {zones.map((z) => (
                            <option key={z.id} value={z.id}>
                              {z.label}
                            </option>
                          ))}
                        </select>
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

      {/* History + summary */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div
          className={`overflow-hidden rounded-2xl bg-white shadow lg:col-span-2 ${CARD_STROKE}`}
        >
          <div className="bg-[#C0F28B] px-5 py-3 font-bold text-cg-ink">
            Attendance History
          </div>
          {history.every((d) => d.present + d.absent + d.late + d.onLeave === 0) ? (
            <div className="grid h-32 place-items-center px-6 text-center text-sm text-cg-ink/50">
              No attendance saved in the last 14 days yet.
            </div>
          ) : (
            <ul className="divide-y divide-cg-green/10">
              {history
                .filter((d) => d.present + d.absent + d.late + d.onLeave > 0)
                .slice(0, 6)
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

      <AttendanceDrawer
        open={drawerOpen}
        rows={rows}
        zones={zones}
        onSetStatus={setStatus}
        onSetZone={setZone}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}
