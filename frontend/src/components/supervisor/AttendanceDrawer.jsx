import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  LuX,
  LuSearch,
  LuCheckCheck,
  LuSave,
  LuChevronLeft,
  LuChevronRight,
} from "react-icons/lu";
import ZonePicker from "./ZonePicker";

// "Daily Attendance" — the full register, sliding in from the right.
//
// This is the working surface: the supervisor marks everyone here, with search,
// zone filtering, bulk actions and its own pagination, then saves without
// leaving the panel. The table behind it is the summary view.
//
// Edits mutate the page's draft state, so nothing is written until Save is
// pressed — a drawer that wrote silently would leave no way back from a
// mistaken tap on a phone in the field.

const PAGE_SIZE = 10;

const STATUS_PILL = {
  present: "bg-emerald-100 text-emerald-700",
  late: "bg-amber-100 text-amber-800",
  absent: "bg-rose-100 text-rose-700",
  leave: "bg-sky-100 text-sky-700",
};

const ROLE_PILL = {
  plucker: "bg-rose-100 text-rose-700",
  maintenance: "bg-cg-lime text-cg-green",
  sprayer: "bg-amber-100 text-amber-800",
  weeder: "bg-violet-100 text-violet-700",
  factory: "bg-sky-100 text-sky-700",
};

const CYCLE = ["present", "late", "absent", "leave"];

// Initials avatar. Real photos would come from worker.photoUrl, which is null
// for every seeded worker, so a coloured monogram is the honest fallback.
function Avatar({ name }) {
  const initials = (name || "?")
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-cg-lime text-xs font-bold text-cg-green">
      {initials}
    </span>
  );
}

export default function AttendanceDrawer({
  open,
  date,
  rows,
  zones,
  onSetStatus,
  onSetZone,
  onMarkAllPresent,
  onSave,
  saving,
  onClose,
}) {
  const [q, setQ] = useState("");
  const [zoneFilter, setZoneFilter] = useState("");
  const [page, setPage] = useState(0);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => setPage(0), [q, zoneFilter]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (zoneFilter && String(r.zoneId ?? r.homeZoneId) !== zoneFilter) {
        return false;
      }
      if (!s) return true;
      return (
        (r.name || "").toLowerCase().includes(s) ||
        String(r.workerId).includes(s)
      );
    });
  }, [rows, q, zoneFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  if (!open) return null;

  const prettyDate = (() => {
    try {
      return new Date(date).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } catch {
      return date;
    }
  })();

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[1200] bg-black/40"
        onClick={onClose}
        aria-hidden
      />
      <aside
        className="fixed inset-y-0 right-0 z-[1210] flex w-full max-w-3xl flex-col bg-white shadow-2xl"
        role="dialog"
        aria-label="Daily attendance register"
      >
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#13483B59] px-6 py-4">
          <div>
            <h3 className="text-xl font-extrabold text-cg-ink">
              Daily Attendance
            </h3>
            <p className="text-sm text-cg-ink/50">{prettyDate}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onMarkAllPresent}
              className="inline-flex items-center gap-1.5 rounded-xl bg-cg-lime px-4 py-2 text-sm font-bold text-cg-green transition hover:brightness-95"
            >
              <LuCheckCheck size={15} /> Mark All Present
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-xl bg-cg-dark px-4 py-2 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-50"
            >
              <LuSave size={15} /> {saving ? "Saving…" : "Save Attendance"}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid h-9 w-9 place-items-center rounded-full bg-cg-dark text-white transition hover:brightness-110"
            >
              <LuX size={16} />
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 px-6 py-4">
          <label className="relative flex min-w-[14rem] flex-1 items-center">
            <LuSearch
              size={15}
              className="pointer-events-none absolute left-3 text-cg-ink/40"
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search workers…"
              className="w-full rounded-xl border border-[#13483B59] bg-cg-lime/20 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-cg-green focus:ring-2 focus:ring-cg-green/20"
            />
          </label>
          <div className="w-44">
            <ZonePicker
              value={zoneFilter ? Number(zoneFilter) : null}
              zones={zones}
              homeZoneName="All zones"
              placeholder="All zones"
              size="lg"
              onChange={(id) => setZoneFilter(id ? String(id) : "")}
            />
          </div>
        </div>

        {/* Register */}
        <div className="flex-1 overflow-y-auto px-6">
          <div className="overflow-hidden rounded-t-xl">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="bg-cg-dark text-[11px] uppercase tracking-wide text-white/90">
                  <th className="px-4 py-3 font-bold">Worker</th>
                  <th className="px-4 py-3 font-bold">Role</th>
                  <th className="px-4 py-3 font-bold">Zone</th>
                  <th className="px-4 py-3 font-bold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cg-green/10">
                {pageRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-12 text-center text-sm text-cg-ink/50"
                    >
                      No workers match that search.
                    </td>
                  </tr>
                ) : (
                  pageRows.map((r) => (
                    <tr key={r.workerId} className="hover:bg-cg-lime/20">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar name={r.name} />
                          <div className="min-w-0">
                            <p className="truncate font-bold uppercase text-cg-ink">
                              {r.name}
                            </p>
                            <p className="text-xs text-cg-ink/40">
                              CG{String(r.workerId).padStart(3, "0")}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase ${
                            ROLE_PILL[r.jobRole] || "bg-cg-lime text-cg-green"
                          }`}
                        >
                          {r.jobRole || "worker"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {/* Assigning a field only makes sense for someone who
                            turned up; otherwise show where they normally work. */}
                        {r.status === "present" || r.status === "late" ? (
                          <div className="w-36">
                            <ZonePicker
                              value={r.zoneId}
                              zones={zones}
                              homeZoneName={r.homeZoneName}
                              onChange={(id) => onSetZone(r.workerId, id)}
                            />
                          </div>
                        ) : (
                          <span className="text-xs text-cg-ink/35">
                            {r.homeZoneName}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() =>
                            onSetStatus(
                              r.workerId,
                              CYCLE[(CYCLE.indexOf(r.status) + 1) % CYCLE.length],
                            )
                          }
                          title="Tap to change"
                          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-bold uppercase transition hover:brightness-95 ${
                            r.status
                              ? STATUS_PILL[r.status]
                              : "bg-cg-lime/50 text-cg-ink/40"
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              r.status === "present"
                                ? "bg-emerald-600"
                                : r.status === "late"
                                  ? "bg-amber-600"
                                  : r.status === "absent"
                                    ? "bg-rose-600"
                                    : r.status === "leave"
                                      ? "bg-sky-600"
                                      : "bg-cg-ink/30"
                            }`}
                          />
                          {r.status || "not marked"}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between gap-3 bg-cg-dark px-6 py-3 text-sm text-white">
          <span className="text-xs text-white/70">
            {filtered.length === 0 ? 0 : page * PAGE_SIZE + 1}–
            {Math.min((page + 1) * PAGE_SIZE, filtered.length)} of{" "}
            {filtered.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              aria-label="Previous page"
              className="grid h-8 w-8 place-items-center rounded-lg bg-white/10 transition hover:bg-white/20 disabled:opacity-30"
            >
              <LuChevronLeft size={15} />
            </button>
            {Array.from({ length: Math.min(totalPages, 3) }, (_, i) => i).map(
              (i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setPage(i)}
                  className={`grid h-8 w-8 place-items-center rounded-lg text-xs font-bold transition ${
                    page === i
                      ? "bg-white text-cg-dark"
                      : "bg-white/10 hover:bg-white/20"
                  }`}
                >
                  {i + 1}
                </button>
              ),
            )}
            {totalPages > 3 && <span className="px-1 text-white/50">…</span>}
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page + 1 >= totalPages}
              aria-label="Next page"
              className="grid h-8 w-8 place-items-center rounded-lg bg-white/10 transition hover:bg-white/20 disabled:opacity-30"
            >
              <LuChevronRight size={15} />
            </button>
          </div>
        </div>
      </aside>
    </>,
    document.body,
  );
}
