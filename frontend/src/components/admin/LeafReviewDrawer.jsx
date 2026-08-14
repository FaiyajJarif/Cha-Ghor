import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  LuX,
  LuSearch,
  LuLeaf,
  LuChevronLeft,
  LuChevronRight,
  LuTriangleAlert,
  LuDownload,
} from "react-icons/lu";
import api from "../../api/client";
import { apiError } from "../../lib/apiError";
import { WS_BASE } from "../../lib/config";
import { closeSocket } from "../../lib/ws";
import LeafPhotoThumb from "../supervisor/LeafPhotoThumb";
import { todayISO } from "../../lib/localDate";

// Admin review of the day's weigh-ins.
//
// WHY ADMIN NEEDS THIS AT ALL: leaf weight feeds the payroll surplus. Kilos
// above the daily quota pay ৳5 each and grade-A kilos pay a bonus on top, so
// the person who signs the payslips could not previously see the numbers those
// payslips are built from. Attendance had an admin view; leaf did not.
//
// READ-ONLY on purpose. Corrections belong to the supervisor who was standing
// at the scale and can look at the leaf. An admin editing a weight from an
// office, days later, is how a dispute becomes unresolvable.

const CARD_STROKE = "ring-1 ring-cg-green/10";
const PAGE_SIZE = 12;

const GRADE_PILL = {
  A: "bg-emerald-100 text-emerald-700",
  B: "bg-amber-100 text-amber-800",
  C: "bg-rose-100 text-rose-700",
};

const kg = (v) => (v == null ? "—" : Number(v).toFixed(1));

export default function LeafReviewDrawer({ open, onClose }) {
  const [date, setDate] = useState(todayISO());
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [quota, setQuota] = useState(23);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [live, setLive] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [l, s, cfg] = await Promise.all([
        api.get("/leaf", { params: { date } }),
        api.get("/leaf/summary", { params: { date } }),
        api.get("/payroll/config").catch(() => ({ data: null })),
      ]);
      setRows(l.data || []);
      setSummary(s.data || null);
      if (cfg.data?.leafQuotaKg != null) setQuota(Number(cfg.data.leafQuotaKg));
      setError("");
    } catch (err) {
      setError(apiError(err, "Could not load the day's weigh-ins."));
    } finally {
      setLoading(false);
    }
  }, [date]);

  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  useEffect(() => setPage(0), [q, date]);

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

  // Live, so an admin watching during a shift sees weigh-ins land.
  useEffect(() => {
    if (!open) return undefined;
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
        if (kind === "leaf.saved" && loadRef.current) {
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
  }, [open]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(
      (r) =>
        (r.workerName || "").toLowerCase().includes(s) ||
        (r.zone || "").toLowerCase().includes(s) ||
        String(r.workerId).includes(s),
    );
  }, [rows, q]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  // Kilos above quota per worker — the number that actually becomes surplus pay.
  const perWorker = useMemo(() => {
    const m = new Map();
    for (const r of rows) {
      m.set(r.workerId, (m.get(r.workerId) || 0) + Number(r.weightKg || 0));
    }
    return m;
  }, [rows]);

  const surplusKg = useMemo(
    () =>
      [...perWorker.values()].reduce(
        (sum, total) => sum + Math.max(0, total - quota),
        0,
      ),
    [perWorker, quota],
  );

  const noPhoto = rows.filter((r) => !r.photoUrl).length;

  const exportCsv = () => {
    const head = ["worker_id", "name", "field", "kg", "grade", "recorded_at", "has_photo"];
    const body = filtered.map((r) => [
      r.workerId,
      `"${(r.workerName || "").replace(/"/g, '""')}"`,
      `"${(r.zone || "").replace(/"/g, '""')}"`,
      r.weightKg,
      r.grade || "",
      r.recordedAt || "",
      r.photoUrl ? "yes" : "no",
    ]);
    const csv = [head, ...body].map((x) => x.join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `leaf-${date}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (!open) return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[1200] bg-black/40" onClick={onClose} aria-hidden />
      <aside
        className="fixed inset-y-0 right-0 z-[1210] flex w-full max-w-4xl flex-col bg-white shadow-2xl"
        role="dialog"
        aria-label="Leaf collection review"
      >
        <div className="flex flex-wrap items-start justify-between gap-3 bg-cg-dark px-6 py-4">
          <div>
            <h3 className="flex items-center gap-2 text-xl font-extrabold text-white">
              <LuLeaf size={19} /> Leaf collection
              <span
                title={
                  live
                    ? "Connected. Weigh-ins appear here as supervisors record them."
                    : "Not connected. The list is correct but will not update on its own."
                }
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ${
                  live ? "bg-emerald-100 text-emerald-700" : "bg-white/20 text-white/70"
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    live ? "animate-pulse bg-emerald-500" : "bg-white/50"
                  }`}
                />
                {live ? "Live" : "Offline"}
              </span>
            </h3>
            <p className="text-xs text-white/60">
              What the payroll surplus is calculated from
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={date}
              max={todayISO()}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-cg-ink outline-none"
            />
            <button
              type="button"
              onClick={exportCsv}
              disabled={filtered.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/20 px-3 py-2 text-sm font-bold text-white disabled:opacity-40"
            >
              <LuDownload size={15} /> CSV
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid h-9 w-9 place-items-center rounded-full bg-white/20 text-white"
            >
              <LuX size={16} />
            </button>
          </div>
        </div>

        {/* What this day costs, in the terms payroll uses */}
        <div className="grid grid-cols-2 gap-3 border-b border-cg-green/10 px-6 py-4 sm:grid-cols-4">
          {[
            ["Entries", summary ? summary.entries : rows.length, null],
            ["Total kg", kg(summary?.totalKg), null],
            ["Above quota", `${kg(surplusKg)} kg`, `pays surplus at the configured rate`],
            ["Workers", perWorker.size, `quota ${quota} kg each`],
          ].map(([label, value, sub]) => (
            <div key={label} className={`rounded-xl bg-white p-3 ${CARD_STROKE}`}>
              <p className="text-[10px] font-bold uppercase tracking-wide text-cg-ink/50">
                {label}
              </p>
              <p className="mt-0.5 text-xl font-extrabold text-cg-ink">{value}</p>
              {sub ? <p className="text-[10px] text-cg-ink/40">{sub}</p> : null}
            </div>
          ))}
        </div>

        {/* Unverified entries are the ones worth an admin's attention */}
        {noPhoto > 0 && rows.length > 0 && (
          <p className="mx-6 mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-2.5 text-xs text-amber-900 ring-1 ring-amber-200">
            <LuTriangleAlert size={14} className="mt-0.5 shrink-0" />
            <span>
              <span className="font-bold">{noPhoto} of {rows.length}</span> weigh-ins
              have no photo of the bulk. Those cannot be checked against anything
              if a worker disputes the weight.
            </span>
          </p>
        )}

        <div className="flex items-center gap-3 px-6 py-3">
          <label className="relative flex flex-1 items-center">
            <LuSearch size={15} className="pointer-events-none absolute left-3 text-cg-ink/40" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search worker or field…"
              className="w-full rounded-xl border border-cg-green/20 bg-cg-lime/20 py-2 pl-9 pr-3 text-sm outline-none focus:border-cg-green"
            />
          </label>
        </div>

        <div className="flex-1 overflow-y-auto px-6">
          {error && (
            <p className="mb-3 rounded-xl bg-rose-50 px-4 py-2.5 text-sm text-rose-700">
              {error}
            </p>
          )}
          {loading ? (
            <p className="py-16 text-center text-sm text-cg-ink/50">Loading…</p>
          ) : pageRows.length === 0 ? (
            <p className="py-16 text-center text-sm text-cg-ink/50">
              {rows.length === 0
                ? "No leaf was weighed in on this day."
                : "No weigh-in matches that search."}
            </p>
          ) : (
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="bg-cg-dark text-[11px] uppercase tracking-wide text-white/90">
                  <th className="px-4 py-3 font-bold">Photo</th>
                  <th className="px-4 py-3 font-bold">Worker</th>
                  <th className="px-4 py-3 font-bold">Field</th>
                  <th className="px-4 py-3 font-bold">Weight</th>
                  <th className="px-4 py-3 font-bold">Grade</th>
                  <th className="px-4 py-3 font-bold">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cg-green/10">
                {pageRows.map((r) => (
                  <tr key={r.id} className="hover:bg-cg-lime/20">
                    <td className="px-4 py-2.5">
                      {r.photoUrl ? (
                        <LeafPhotoThumb entry={r} onReviewed={load} />
                      ) : (
                        <span
                          title="No photo was taken for this weigh-in"
                          className="text-[10px] font-semibold text-amber-700"
                        >
                          none
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <p className="font-semibold text-cg-ink">{r.workerName}</p>
                      <p className="text-[11px] text-cg-ink/40">
                        CG{String(r.workerId).padStart(3, "0")}
                      </p>
                    </td>
                    <td className="px-4 py-2.5 text-cg-ink/70">{r.zone || "—"}</td>
                    <td className="px-4 py-2.5 font-bold text-cg-ink">
                      {kg(r.weightKg)} kg
                    </td>
                    <td className="px-4 py-2.5">
                      {r.grade ? (
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                            GRADE_PILL[r.grade] || GRADE_PILL.B
                          }`}
                        >
                          {r.grade}
                        </span>
                      ) : (
                        <span className="text-xs text-cg-ink/30">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-cg-ink/50">
                      {r.recordedAt
                        ? new Date(r.recordedAt).toLocaleTimeString("en-GB", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 bg-cg-dark px-6 py-3">
          <span className="text-xs text-white/70">
            <span className="font-bold uppercase tracking-wide">
              Showing {pageRows.length} of {filtered.length}
            </span>
            {/* An admin looking at a disputed weight will reach for an edit
                button. Say why there isn't one, rather than leaving them to
                conclude it is missing. */}
            <span className="ml-2 hidden sm:inline">
              · View only — corrections are made by the supervisor at the scale,
              who can look at the leaf
            </span>
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              aria-label="Previous page"
              className="grid h-8 w-8 place-items-center rounded-lg bg-white/20 text-white disabled:opacity-40"
            >
              <LuChevronLeft size={15} />
            </button>
            <span className="px-2 text-xs font-bold text-white">
              {page + 1} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              aria-label="Next page"
              className="grid h-8 w-8 place-items-center rounded-lg bg-white/20 text-white disabled:opacity-40"
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
