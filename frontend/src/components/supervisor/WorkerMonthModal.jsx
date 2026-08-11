import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  LuX,
  LuChevronLeft,
  LuChevronRight,
  LuCircleCheck,
  LuCircleX,
  LuClock,
  LuPlane,
  LuTriangleAlert,
} from "react-icons/lu";
import api from "../../api/client";
import { apiError } from "../../lib/apiError";
import { todayISO } from "../../lib/localDate";

// One worker's attendance for one month.
//
// Every number comes from GET /attendance/worker/{id}?month=, which counts rows
// that actually exist in the register. Nothing here is estimated.
//
// The distinction this screen exists to make: DAYS NOBODY MARKED are shown
// separately from DAYS THE WORKER WAS ABSENT. Payroll only ever counts rows, so
// an unmarked day already pays nothing — it just does it silently. Folding the
// two together would hide the one problem a supervisor can still fix before
// payday.

const HEADER = "bg-[#14493B]";

const STATUS = {
  present: { label: "Present", dot: "bg-emerald-500", text: "text-emerald-700", cell: "bg-emerald-100" },
  late: { label: "Late", dot: "bg-amber-500", text: "text-amber-800", cell: "bg-amber-100" },
  absent: { label: "Absent", dot: "bg-rose-500", text: "text-rose-700", cell: "bg-rose-100" },
  leave: { label: "Leave", dot: "bg-sky-500", text: "text-sky-700", cell: "bg-sky-100" },
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function monthLabel(ym) {
  if (!ym) return "";
  const [y, m] = ym.split("-").map(Number);
  return `${MONTHS[(m || 1) - 1]} ${y}`;
}

function shiftMonth(ym, delta) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const thisMonth = () => new Date().toISOString().slice(0, 7);

// Squeeze a zone name into a calendar cell.
//
// Field codes are what identify a field on this estate, so they win: "Zone A —
// Field A3" shows A3 and "Zone D-1" shows D-1. Naive truncation was tried first
// and was worse than useless — it turned "Field A3" into "Field A" and "Zone
// D-1" into "1", both of which name a DIFFERENT field than the one meant.
//
// Names with no code fall back to the descriptive part ("Zone C - Nursery" ->
// Nursery). The full name is always on the hover, so nothing is lost.
function shortZone(name) {
  if (!name) return "";
  const code = String(name).match(/\b([A-Za-z]-?\d+|\d+[A-Za-z])\b/);
  if (code) return code[1].toUpperCase();
  const tail = String(name).split(/[—–-]/).pop().trim();
  const cleaned = (tail || String(name)).replace(/^(zone|sector|field)\s+/i, "").trim();
  return cleaned.length > 8 ? cleaned.slice(0, 8).trim() : cleaned;
}

function Stat({ icon: Icon, label, value, tone, sub }) {
  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-[#13483B59]">
      <div className="flex items-start justify-between">
        <p className="text-[11px] font-bold uppercase tracking-wide text-cg-ink/50">
          {label}
        </p>
        <Icon size={16} className={tone} />
      </div>
      <p className="mt-1 text-2xl font-extrabold text-cg-ink">{value}</p>
      {sub ? <p className="text-[11px] text-cg-ink/50">{sub}</p> : null}
    </div>
  );
}

export default function WorkerMonthModal({ open, workerId, workerName, onClose }) {
  const [month, setMonth] = useState(thisMonth);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (open) setMonth(thisMonth());
  }, [open, workerId]);

  useEffect(() => {
    if (!open || !workerId) return undefined;
    let active = true;
    setLoading(true);
    setError("");
    setData(null);
    api
      .get(`/attendance/worker/${workerId}`, { params: { month } })
      .then((r) => active && setData(r.data))
      .catch(
        (err) =>
          active && setError(apiError(err, "Could not load that worker's month.")),
      )
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [open, workerId, month]);

  // Day-by-day grid, aligned to the weekday the month starts on so the columns
  // read as real weeks rather than an arbitrary run of boxes.
  const grid = useMemo(() => {
    if (!data) return [];
    const byDate = new Map((data.days || []).map((d) => [d.date, d]));
    const [y, m] = data.month.split("-").map(Number);
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const lead = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); // 0 = Sunday
    const cells = Array.from({ length: lead }, () => null);
    const todayIso = todayISO();
    for (let day = 1; day <= daysInMonth; day++) {
      const iso = `${data.month}-${String(day).padStart(2, "0")}`;
      cells.push({
        day,
        iso,
        row: byDate.get(iso) || null,
        future: iso > todayIso,
      });
    }
    return cells;
  }, [data]);

  if (!open) return null;

  const atThisMonth = month >= thisMonth();

  return createPortal(
    <>
      <div className="fixed inset-0 z-[1200] bg-black/40" onClick={onClose} aria-hidden />
      <div className="fixed inset-0 z-[1210] flex items-center justify-center p-4">
        <div
          className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-label="Worker attendance for the month"
        >
          <div className={`flex items-center justify-between ${HEADER} px-6 py-5`}>
            <div>
              <h3 className="text-xl font-extrabold text-white">
                {data?.workerName || workerName || "Worker"}
              </h3>
              <p className="text-xs text-white/60">Attendance this month</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid h-9 w-9 place-items-center rounded-full bg-white/20 text-white transition hover:bg-white/30"
            >
              <LuX size={17} />
            </button>
          </div>

          {/* Month stepper */}
          <div className="flex items-center justify-between border-b border-[#13483B]/10 px-6 py-3">
            <button
              type="button"
              onClick={() => setMonth((m) => shiftMonth(m, -1))}
              className="grid h-9 w-9 place-items-center rounded-lg bg-cg-lime/50 text-cg-ink transition hover:bg-cg-lime"
              aria-label="Previous month"
            >
              <LuChevronLeft size={16} />
            </button>
            <p className="text-sm font-extrabold text-cg-ink">{monthLabel(month)}</p>
            <button
              type="button"
              onClick={() => setMonth((m) => shiftMonth(m, 1))}
              disabled={atThisMonth}
              title={atThisMonth ? "The month has not finished yet" : undefined}
              className="grid h-9 w-9 place-items-center rounded-lg bg-cg-lime/50 text-cg-ink transition hover:bg-cg-lime disabled:opacity-40"
              aria-label="Next month"
            >
              <LuChevronRight size={16} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto bg-[#F4FFE9] px-6 py-5">
            {error && (
              <p className="mb-4 rounded-xl bg-rose-50 px-4 py-2.5 text-sm text-rose-700">
                {error}
              </p>
            )}

            {loading ? (
              <p className="py-16 text-center text-sm text-cg-ink/50">Loading…</p>
            ) : !data ? (
              <p className="py-16 text-center text-sm text-cg-ink/50">
                No data for this month.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Stat
                    icon={LuCircleCheck}
                    label="Present"
                    value={data.present}
                    tone="text-emerald-600"
                    sub={data.present === 1 ? "day" : "days"}
                  />
                  <Stat
                    icon={LuClock}
                    label="Late"
                    value={data.late}
                    tone="text-amber-600"
                    sub={
                      data.totalLateMinutes > 0
                        ? `${data.totalLateMinutes} min total`
                        : data.late > 0
                          ? "minutes not recorded"
                          : "—"
                    }
                  />
                  <Stat
                    icon={LuCircleX}
                    label="Absent"
                    value={data.absent}
                    tone="text-rose-600"
                    sub={data.absent === 1 ? "day" : "days"}
                  />
                  <Stat
                    icon={LuPlane}
                    label="On leave"
                    value={data.onLeave}
                    tone="text-sky-600"
                    sub={data.onLeave === 1 ? "day" : "days"}
                  />
                </div>

                {/* Payable days — deliberately the same arithmetic payroll uses,
                    so this card and the payslip can never disagree. */}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#D3FFAC] px-5 py-4 ring-1 ring-[#13483B59]">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-cg-ink/60">
                      Days that earn base pay
                    </p>
                    <p className="text-3xl font-extrabold text-cg-ink">
                      {data.payableDays}
                      <span className="ml-2 text-sm font-bold text-cg-ink/50">
                        of {data.present + data.late + data.absent + data.onLeave + data.notMarked} so far
                      </span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-extrabold text-cg-ink">
                      {data.attendancePct}%
                    </p>
                    <p className="text-[11px] text-cg-ink/50">
                      present + late
                    </p>
                  </div>
                </div>

                {/* The number that quietly costs someone their wage. */}
                {data.notMarked > 0 && (
                  <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
                    <LuTriangleAlert size={16} className="mt-0.5 shrink-0" />
                    <span>
                      <span className="font-bold">
                        {data.notMarked} {data.notMarked === 1 ? "day" : "days"} were never
                        marked at all.
                      </span>{" "}
                      Payroll only counts days that have a row, so these already pay
                      nothing — they just do it silently. Worth filling in before the
                      payslip is generated.
                    </span>
                  </p>
                )}

                {/* Calendar */}
                <div className="mt-5 rounded-2xl bg-white p-4 ring-1 ring-[#13483B59]">
                  <div className="grid grid-cols-7 gap-1.5 text-center">
                    {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                      <span
                        key={i}
                        className="text-[10px] font-bold uppercase text-cg-ink/40"
                      >
                        {d}
                      </span>
                    ))}
                    {grid.map((c, i) =>
                      c === null ? (
                        <span key={`pad-${i}`} />
                      ) : (
                        <span
                          key={c.iso}
                          title={
                            c.future
                              ? "Still to come"
                              : c.row
                                ? `${STATUS[c.row.status]?.label || c.row.status}${
                                    c.row.zoneName ? ` · ${c.row.zoneName}` : ""
                                  }${
                                    c.row.lateMinutes
                                      ? ` · ${c.row.lateMinutes} min late`
                                      : ""
                                  }`
                                : "Not marked"
                          }
                          className={`flex min-h-[46px] flex-col items-center justify-center gap-0.5 rounded-lg px-0.5 py-1 text-xs font-bold ${
                            c.future
                              ? "text-cg-ink/20"
                              : c.row
                                ? `${STATUS[c.row.status]?.cell || "bg-slate-100"} ${
                                    STATUS[c.row.status]?.text || "text-cg-ink"
                                  }`
                                : "bg-slate-100 text-cg-ink/30 ring-1 ring-dashed ring-slate-300"
                          }`}
                        >
                          <span className="leading-none">{c.day}</span>
                          {/* Which field they were in that day. Pluckers get
                              moved between fields, so this is how you spot the
                              day someone was somewhere else. Shortened to fit;
                              the full name is on the hover. */}
                          {c.row?.zoneName ? (
                            <span className="w-full truncate text-center text-[8px] font-semibold leading-none opacity-70">
                              {shortZone(c.row.zoneName)}
                            </span>
                          ) : null}
                        </span>
                      ),
                    )}
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-[#13483B]/10 pt-3">
                    {Object.entries(STATUS).map(([k, v]) => (
                      <span key={k} className="flex items-center gap-1.5 text-[11px] text-cg-ink/60">
                        <span className={`h-2.5 w-2.5 rounded-full ${v.dot}`} />
                        {v.label}
                      </span>
                    ))}
                    <span className="flex items-center gap-1.5 text-[11px] text-cg-ink/60">
                      <span className="h-2.5 w-2.5 rounded-full bg-slate-300 ring-1 ring-dashed ring-slate-400" />
                      Not marked
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className={`flex items-center justify-between ${HEADER} px-6 py-4`}>
            <span className="text-xs text-white/60">
              {data ? `${data.marked} of the month's days have a record` : ""}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-white px-5 py-2 text-sm font-bold text-[#14493B] transition hover:bg-white/90"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
