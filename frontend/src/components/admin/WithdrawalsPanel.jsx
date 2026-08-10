import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  LuBanknote,
  LuClock,
  LuCheckCheck,
  LuTriangleAlert,
  LuCheck,
  LuX,
  LuRefreshCw,
  LuChevronLeft,
  LuChevronRight,
} from "react-icons/lu";
import api from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { BTN_DARK, BTN_GHOST } from "../../lib/ui";
import { apiError } from "../../lib/apiError";

// Worker bKash cash-out queue. Rendered as a TAB INSIDE the Payroll page
// (Withdrawals is a Payroll sub-part, not a top-level admin feature), so this
// deliberately has no <h1> of its own -- Payroll already owns the page title.
//
// Backend contract (withdrawal module):
//   GET  /withdrawals?status=pending|paid|rejected   ADMIN or SUPERVISOR
//   POST /withdrawals/{id}/decide  { action: "pay" | "reject" }   ADMIN only
//
// The backend defaults to `pending` when no status is passed, and returns 409
// if a request has already been decided (the state transition is single-shot,
// which is also what guarantees at-most-one SMS per decision).
//
// NOTE: the payout itself is a MOCK. Deciding "pay" flips the status and
// stamps processed_at -- no real bKash gateway is called.

const PAGE_SIZE = 8;

const TABS = [
  { key: "pending", label: "Pending" },
  { key: "paid", label: "Paid" },
  { key: "rejected", label: "Rejected" },
];

function taka(n) {
  return "\u09f3" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function dateTimeFmt(iso) {
  if (!iso) return "\u2014";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "\u2014";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function initials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

const AVATAR_COLORS = [
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-sky-100 text-sky-700",
  "bg-rose-100 text-rose-700",
  "bg-violet-100 text-violet-700",
  "bg-lime-100 text-lime-700",
];
function avatarColor(name) {
  let h = 0;
  for (let i = 0; i < (name || "").length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function Avatar({ name }) {
  return (
    <span
      className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold ${avatarColor(
        name,
      )}`}
    >
      {initials(name)}
    </span>
  );
}

function StatCard({ icon: Icon, label, value, sub, tone = "default" }) {
  const chip =
    tone === "red"
      ? "bg-red-100 text-red-600"
      : tone === "amber"
        ? "bg-amber-100 text-amber-600"
        : "bg-cg-lime text-cg-green";
  const valColor = tone === "red" ? "text-red-600" : "text-cg-ink";
  return (
    <div className="rounded-2xl bg-white p-5 shadow ring-1 ring-cg-green/10">
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-cg-ink/50">
          {label}
        </p>
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${chip}`}>
          <Icon size={18} />
        </span>
      </div>
      <p className={`mt-2 text-2xl font-extrabold ${valColor}`}>{value}</p>
      {sub ? <p className="mt-1 text-xs text-cg-ink/50">{sub}</p> : null}
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    pending: "bg-amber-100 text-amber-700",
    paid: "bg-emerald-100 text-emerald-700",
    rejected: "bg-red-100 text-red-700",
  };
  const cls = map[String(status || "").toLowerCase()] || "bg-cg-lime text-cg-green";
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${cls}`}>
      {status}
    </span>
  );
}

// Money moves here (conceptually), so both actions are confirmed explicitly.
function ConfirmDialog({ open, row, action, busy, onCancel, onConfirm }) {
  if (!open || !row) return null;
  const paying = action === "pay";
  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="border-b border-cg-green/10 px-6 py-4">
          <h2 className="text-lg font-extrabold text-cg-ink">
            {paying ? "Approve and pay?" : "Reject this request?"}
          </h2>
        </div>
        <div className="space-y-3 px-6 py-5 text-sm text-cg-ink/80">
          <p>
            <span className="font-bold text-cg-ink">{row.workerName || "Worker #" + row.workerId}</span>{" "}
            requested <span className="font-bold text-cg-ink">{taka(row.amount)}</span> via{" "}
            {String(row.method || "bkash").toUpperCase()}.
          </p>
          <p>
            {paying
              ? "This marks the request as paid and texts the worker a confirmation."
              : "This marks the request as rejected and texts the worker that it was declined."}
          </p>
          <p className="rounded-lg bg-cg-lime/40 px-3 py-2 text-xs">
            This decision is final — a request can only be decided once.
            {paying ? " The bKash payout is mocked for the demo; no real transfer happens." : ""}
          </p>
        </div>
        <div className="flex justify-end gap-2 border-t border-cg-green/10 px-6 py-4">
          <button type="button" className={BTN_GHOST} onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className={BTN_DARK} onClick={onConfirm} disabled={busy}>
            {busy ? "Working\u2026" : paying ? "Approve & pay" : "Reject"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default function WithdrawalsPanel() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [tab, setTab] = useState("pending");
  const [data, setData] = useState({ pending: [], paid: [], rejected: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [page, setPage] = useState(0);

  // The endpoint returns one status at a time, so the KPI row needs all three.
  const loadAll = useCallback(async () => {
    const [p, pd, rj] = await Promise.all([
      api.get("/withdrawals", { params: { status: "pending" } }),
      api.get("/withdrawals", { params: { status: "paid" } }),
      api.get("/withdrawals", { params: { status: "rejected" } }),
    ]);
    setData({ pending: p.data || [], paid: pd.data || [], rejected: rj.data || [] });
  }, []);

  const refresh = useCallback(
    async (quiet) => {
      if (!quiet) setLoading(true);
      try {
        await loadAll();
        setError("");
      } catch (err) {
        setError(
          apiError(
            err,
            "Could not load withdrawals. Make sure the backend is running and you're signed in as admin or supervisor.",
          ),
        );
      } finally {
        setLoading(false);
      }
    },
    [loadAll],
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    setPage(0);
  }, [tab]);

  const decide = async () => {
    if (!confirm) return;
    const { row, action } = confirm;
    setBusy(true);
    try {
      await api.post(`/withdrawals/${row.id}/decide`, { action });
      setNotice(
        action === "pay"
          ? `Paid ${taka(row.amount)} to ${row.workerName || "the worker"}. Confirmation SMS logged.`
          : `Rejected ${taka(row.amount)} for ${row.workerName || "the worker"}. Notification SMS logged.`,
      );
      setConfirm(null);
      await refresh(true);
    } catch (err) {
      // 409 means somebody already decided it -- resync rather than leave a stale row.
      if (err?.response?.status === 409) {
        setError("That request was already decided. The list has been refreshed.");
        setConfirm(null);
        await refresh(true);
      } else {
        setError(apiError(err, "Could not update this request."));
      }
    } finally {
      setBusy(false);
    }
  };

  const rows = data[tab] || [];
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const slice = useMemo(
    () => rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [rows, page],
  );

  const pendingTotal = data.pending.reduce((s, r) => s + Number(r.amount || 0), 0);
  const paidTotal = data.paid.reduce((s, r) => s + Number(r.amount || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-cg-ink">Withdrawals</h2>
          <p className="text-sm text-cg-ink/60">
            Worker bKash cash-out requests awaiting a decision.
          </p>
        </div>
        <button className={BTN_GHOST} onClick={() => refresh()} disabled={loading}>
          <LuRefreshCw size={16} /> Refresh
        </button>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={LuClock}
          label="Pending"
          value={data.pending.length}
          sub="Awaiting your decision"
          tone={data.pending.length > 0 ? "amber" : "default"}
        />
        <StatCard
          icon={LuBanknote}
          label="Pending amount"
          value={taka(pendingTotal)}
          sub="Total requested"
          tone={pendingTotal > 0 ? "amber" : "default"}
        />
        <StatCard
          icon={LuCheckCheck}
          label="Paid"
          value={taka(paidTotal)}
          sub={`${data.paid.length} request${data.paid.length === 1 ? "" : "s"} settled`}
        />
        <StatCard
          icon={LuTriangleAlert}
          label="Rejected"
          value={data.rejected.length}
          sub="Declined requests"
          tone={data.rejected.length > 0 ? "red" : "default"}
        />
      </div>

      {/* Messages */}
      {error ? (
        <div className="flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          <LuTriangleAlert size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}
      {notice ? (
        <div className="flex items-start justify-between gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700 ring-1 ring-emerald-200">
          <span className="flex items-start gap-2">
            <LuCheck size={16} className="mt-0.5 shrink-0" />
            {notice}
          </span>
          <button onClick={() => setNotice("")} className="shrink-0 text-emerald-700/60 hover:text-emerald-900">
            <LuX size={16} />
          </button>
        </div>
      ) : null}

      {/* Tabs + table */}
      <div className="rounded-2xl bg-white shadow ring-1 ring-cg-green/10">
        <div className="flex flex-wrap gap-2 border-b border-cg-green/10 px-6 py-4">
          {TABS.map((t) => {
            const active = tab === t.key;
            const count = (data[t.key] || []).length;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                  active
                    ? "bg-cg-dark text-white"
                    : "text-cg-ink/60 hover:bg-cg-lime hover:text-cg-ink"
                }`}
              >
                {t.label}
                <span className={`ml-2 text-xs ${active ? "text-white/70" : "text-cg-ink/40"}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="overflow-x-auto px-6 py-2">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-cg-ink/50">
                <th className="py-3 pr-4 font-semibold">Worker</th>
                <th className="py-3 pr-4 font-semibold">Zone</th>
                <th className="py-3 pr-4 font-semibold">Amount</th>
                <th className="py-3 pr-4 font-semibold">Method</th>
                <th className="py-3 pr-4 font-semibold">Requested</th>
                <th className="py-3 pr-4 font-semibold">
                  {tab === "pending" ? "Status" : "Processed"}
                </th>
                {tab === "pending" && isAdmin ? (
                  <th className="py-3 pr-4 text-right font-semibold">Decision</th>
                ) : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-cg-green/10">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-cg-ink/50">
                    Loading…
                  </td>
                </tr>
              ) : slice.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-cg-ink/50">
                    {tab === "pending"
                      ? "No pending requests. The queue is clear."
                      : `No ${tab} requests yet.`}
                  </td>
                </tr>
              ) : (
                slice.map((r) => (
                  <tr key={r.id}>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-3">
                        <Avatar name={r.workerName} />
                        <div>
                          <p className="font-semibold text-cg-ink">
                            {r.workerName || "Worker #" + r.workerId}
                            {/* Which kind. Both are cash out before payday and
                                were indistinguishable rows until V33 — an
                                admin could not tell a wage release from a debt,
                                and neither could the queue. */}
                            <span
                              className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                r.kind === "salary"
                                  ? "bg-sky-100 text-sky-700"
                                  : "bg-amber-100 text-amber-800"
                              }`}
                            >
                              {r.kind === "salary" ? "Wages" : "Advance"}
                            </span>
                          </p>
                          <p className="text-xs text-cg-ink/50">ID {r.workerId}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-cg-ink/70">{r.zone || "\u2014"}</td>
                    <td className="py-3 pr-4 font-bold text-cg-ink">{taka(r.amount)}</td>
                    <td className="py-3 pr-4 uppercase text-cg-ink/70">{r.method}</td>
                    <td className="py-3 pr-4 text-cg-ink/70">{dateTimeFmt(r.requestedAt)}</td>
                    <td className="py-3 pr-4">
                      {tab === "pending" ? (
                        <StatusBadge status={r.status} />
                      ) : (
                        <span className="text-cg-ink/70">{dateTimeFmt(r.processedAt)}</span>
                      )}
                    </td>
                    {tab === "pending" && isAdmin ? (
                      <td className="py-3 pr-4">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => setConfirm({ row: r, action: "pay" })}
                            className="inline-flex items-center gap-1 rounded-lg bg-cg-dark px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-cg-darker"
                          >
                            <LuCheck size={14} /> Pay
                          </button>
                          <button
                            onClick={() => setConfirm({ row: r, action: "reject" })}
                            className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-red-600 ring-1 ring-red-200 transition hover:bg-red-50"
                          >
                            <LuX size={14} /> Reject
                          </button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 ? (
          <div className="flex items-center justify-between border-t border-cg-green/10 px-6 py-4 text-sm">
            <p className="text-cg-ink/50">
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, rows.length)} of{" "}
              {rows.length}
            </p>
            <div className="flex gap-2">
              <button
                className={BTN_GHOST}
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                <LuChevronLeft size={16} /> Prev
              </button>
              <button
                className={BTN_GHOST}
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              >
                Next <LuChevronRight size={16} />
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {!isAdmin ? (
        <p className="text-xs text-cg-ink/50">
          You are signed in as {user?.role}. Only an admin can approve or reject requests.
        </p>
      ) : null}

      <ConfirmDialog
        open={!!confirm}
        row={confirm?.row}
        action={confirm?.action}
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={decide}
      />
    </div>
  );
}
