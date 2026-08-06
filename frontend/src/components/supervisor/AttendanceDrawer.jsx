import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { LuX, LuSearch } from "react-icons/lu";
import { BTN_GHOST } from "../../lib/ui";

// Right-hand slide-in showing the FULL register for the day, unpaginated.
//
// The table on the page is paginated so it stays readable; this is the "view
// all" companion — search across every worker at once, change a status or a
// field, and see the whole register without clicking through pages.
//
// Edits here mutate the same draft state as the table, so nothing is saved
// until the supervisor presses Save Attendance Data. That is deliberate: a
// drawer that silently wrote to the server would make Save meaningless and
// leave no way to back out of a mistaken tap.

const STATUSES = [
  { value: "present", label: "Present", cls: "bg-emerald-100 text-emerald-700" },
  { value: "late", label: "Late", cls: "bg-amber-100 text-amber-800" },
  { value: "absent", label: "Absent", cls: "bg-rose-100 text-rose-700" },
  { value: "leave", label: "Leave", cls: "bg-cg-lime text-cg-green" },
];

export default function AttendanceDrawer({
  open,
  rows,
  zones,
  onSetStatus,
  onSetZone,
  onClose,
}) {
  const [q, setQ] = useState("");

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Body scroll would otherwise continue behind the drawer on mobile.
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(
      (r) =>
        (r.name || "").toLowerCase().includes(s) ||
        String(r.workerId).includes(s),
    );
  }, [rows, q]);

  if (!open) return null;

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[90] bg-black/40"
        onClick={onClose}
        aria-hidden
      />
      <aside
        className="fixed inset-y-0 right-0 z-[95] flex w-full max-w-xl flex-col bg-white shadow-2xl"
        role="dialog"
        aria-label="Full attendance register"
      >
        <div className="flex items-center justify-between bg-[#C0F28B] px-5 py-3">
          <div>
            <h3 className="text-sm font-bold text-cg-ink">
              Today&apos;s Attendance — all {rows.length} workers
            </h3>
            <p className="text-xs text-cg-ink/70">
              Changes here are saved with the Save button on the page.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-lg hover:bg-black/5"
          >
            <LuX />
          </button>
        </div>

        <div className="border-b border-cg-green/10 px-5 py-3">
          <label className="relative flex items-center">
            <LuSearch
              size={15}
              className="pointer-events-none absolute left-3 text-cg-ink/40"
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name or worker id…"
              className="w-full rounded-lg border border-cg-green/30 py-2 pl-9 pr-3 text-sm outline-none focus:border-cg-green"
            />
          </label>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-cg-ink/50">
              No workers match that search.
            </p>
          ) : (
            <ul className="space-y-3">
              {filtered.map((r) => (
                <li
                  key={r.workerId}
                  className="rounded-xl p-3 ring-1 ring-[#13483B59]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-cg-ink">
                        {r.name}
                      </p>
                      <p className="text-xs text-cg-ink/50">
                        #CG{String(r.workerId).padStart(3, "0")}
                      </p>
                    </div>
                    <div className="flex flex-wrap justify-end gap-1">
                      {STATUSES.map((s) => (
                        <button
                          key={s.value}
                          type="button"
                          onClick={() => onSetStatus(r.workerId, s.value)}
                          className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide transition ${
                            r.status === s.value
                              ? s.cls
                              : "bg-cg-lime/40 text-cg-ink/40 hover:bg-cg-lime"
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Field assignment only applies to someone who turned up. */}
                  {r.status === "present" || r.status === "late" ? (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs text-cg-ink/50">Field</span>
                      <select
                        value={r.zoneId ?? ""}
                        onChange={(e) =>
                          onSetZone(
                            r.workerId,
                            e.target.value ? Number(e.target.value) : null,
                          )
                        }
                        className="rounded-lg border border-cg-green/30 px-2 py-1 text-xs outline-none focus:border-cg-green"
                      >
                        <option value="">Home zone</option>
                        {zones.map((z) => (
                          <option key={z.id} value={z.id}>
                            {z.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between bg-[#D3FFAC] px-5 py-3">
          <span className="text-xs text-cg-ink/60">
            Showing {filtered.length} of {rows.length}
          </span>
          <button type="button" className={BTN_GHOST} onClick={onClose}>
            Done
          </button>
        </div>
      </aside>
    </>,
    document.body,
  );
}
