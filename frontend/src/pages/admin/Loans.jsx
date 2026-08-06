import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  LuHandCoins,
  LuClock,
  LuCheckCheck,
  LuBanknote,
  LuTriangleAlert,
  LuPlus,
  LuX,
  LuCheck,
  LuChevronLeft,
  LuChevronRight,
  LuBrain,
} from "react-icons/lu";
import api from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { BTN_DARK, BTN_GHOST } from "../../lib/ui";
import { apiError } from "../../lib/apiError";
import AnomalyPanel from "../../components/admin/AnomalyPanel";
import LoanScoreCard from "../../components/admin/LoanScoreCard";

const PAGE_SIZE = 6; // active repayments (server-side)
const REQ_PAGE_SIZE = 5; // pending requests (client-side)
const FIELD =
  "mt-1 w-full rounded-lg border border-cg-green/20 bg-cg-lime/30 px-3 py-2 text-sm outline-none focus:border-cg-green";

// The loan lifecycle stepper shown under the KPI row. ADMIN REVIEW is the
// stage the admin is acting on, so it is highlighted (matches the reference).
const PIPELINE = [
  { key: "REQUESTED", label: "Requested", sub: "New submissions" },
  { key: "REVIEW", label: "Admin Review", sub: "Final vetting" },
  { key: "APPROVED", label: "Approved", sub: "Funded / Active" },
  { key: "DEDUCTING", label: "Deducting", sub: "Payment cycle" },
  { key: "REPAID", label: "Repaid", sub: "Archive" },
];

function taka(n) {
  return "\u09f3" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

// Compact \u09f382k style for the Recovered KPI.
function takaShort(n) {
  const v = Number(n || 0);
  if (v >= 1000) return "\u09f3" + (v / 1000).toFixed(v % 1000 === 0 ? 0 : 1) + "k";
  return taka(v);
}

function dateFmt(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

function initials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

// Deterministic soft colour per worker so avatars stay stable across renders.
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

// apiError() is imported from ../../lib/apiError (shared, single source of truth).

function Avatar({ name, url }) {
  if (url) {
    return (
      <img src={url} alt={name} className="h-10 w-10 shrink-0 rounded-full object-cover" />
    );
  }
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

// KPI card. `tone` tints the icon chip + value (red for pending / overdue).
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

function Pipeline() {
  return (
    <div className="flex flex-wrap items-stretch gap-2 rounded-2xl bg-white p-5 shadow ring-1 ring-cg-green/10">
      {PIPELINE.map((s, i) => (
        <div key={s.key} className="flex flex-1 items-center gap-2">
          <div className="min-w-[120px]">
            <p className={`text-sm font-bold ${i === 1 ? "text-cg-green" : "text-cg-ink"}`}>
              {s.label}
            </p>
            <p className="text-xs text-cg-ink/50">{s.sub}</p>
          </div>
          {i < PIPELINE.length - 1 ? (
            <LuChevronRight size={18} className="shrink-0 text-cg-ink/30" />
          ) : null}
        </div>
      ))}
    </div>
  );
}

// Repayment progress bar + "NN% Complete".
function Progress({ pct }) {
  return (
    <div className="w-36">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-cg-green/10">
        <div
          className="h-full rounded-full bg-cg-green"
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
      <p className="mt-1 text-xs font-semibold text-cg-ink/60">{pct}% Complete</p>
    </div>
  );
}

function StatusPill({ status }) {
  const overdue = status === "OVERDUE";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
        overdue ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${overdue ? "bg-rose-500" : "bg-emerald-500"}`} />
      {overdue ? "Overdue" : "On Track"}
    </span>
  );
}

function ModalHeader({ title, subtitle, onClose }) {
  return (
    <div className="flex items-start justify-between gap-4 bg-cg-dark px-6 py-5 text-white">
      <div>
        <h3 className="text-lg font-extrabold">{title}</h3>
        {subtitle ? <p className="mt-0.5 text-sm text-white/70">{subtitle}</p> : null}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
      >
        <LuX size={18} />
      </button>
    </div>
  );
}

const EMPTY_REQUEST = {
  workerName: "",
  zone: "",
  amount: "",
  reason: "",
  dailyDeduction: "10",
};

function NewRequestModal({ onClose, onSaved }) {
  const [form, setForm] = useState(EMPTY_REQUEST);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const lbl = "block text-sm font-semibold text-cg-ink/70";

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.workerName.trim()) return setError("Worker name is required.");
    if (form.amount === "" || Number(form.amount) <= 0)
      return setError("Enter a valid loan amount.");
    setSaving(true);
    try {
      await api.post("/loans/requests", {
        workerName: form.workerName.trim(),
        zone: form.zone.trim() || null,
        amount: Number(form.amount),
        reason: form.reason.trim() || null,
        dailyDeduction: form.dailyDeduction === "" ? 0 : Number(form.dailyDeduction),
      });
      onSaved();
    } catch (err) {
      setError(apiError(err, "Could not save this request. Try again."));
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <ModalHeader
          title="New loan request"
          subtitle="Log an advance request on a worker's behalf."
          onClose={onClose}
        />
        <div className="space-y-4 p-6">
          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <label className={lbl}>
              Worker name
              <input
                className={FIELD}
                placeholder="e.g. Zawad"
                value={form.workerName}
                onChange={(e) => set("workerName", e.target.value)}
              />
            </label>
            <label className={lbl}>
              Zone
              <input
                className={FIELD}
                placeholder="e.g. A1"
                value={form.zone}
                onChange={(e) => set("zone", e.target.value)}
              />
            </label>
          </div>
          <label className={lbl}>
            Primary reason
            <input
              className={FIELD}
              placeholder="e.g. Medical Emergency (Hospitalization)"
              value={form.reason}
              onChange={(e) => set("reason", e.target.value)}
            />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className={lbl}>
              Requested amount (৳)
              <input
                type="number"
                min="0"
                step="1"
                className={FIELD}
                placeholder="3000"
                value={form.amount}
                onChange={(e) => set("amount", e.target.value)}
              />
            </label>
            <label className={lbl}>
              Daily deduction (৳)
              <input
                type="number"
                min="0"
                step="1"
                className={FIELD}
                placeholder="10"
                value={form.dailyDeduction}
                onChange={(e) => set("dailyDeduction", e.target.value)}
              />
            </label>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-cg-green/10 px-6 py-4">
          <button type="button" className={BTN_GHOST} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={BTN_DARK} disabled={saving}>
            {saving ? "Saving\u2026" : "Submit request"}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

function pageWindow(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i);
  const pages = new Set([0, total - 1, current, current - 1, current + 1]);
  const sorted = [...pages].filter((p) => p >= 0 && p < total).sort((a, b) => a - b);
  const out = [];
  let prev = -1;
  for (const p of sorted) {
    if (prev !== -1 && p - prev > 1) out.push("gap");
    out.push(p);
    prev = p;
  }
  return out;
}

// Record a repayment against an active loan. Until this existed nothing ever
// incremented loan.repaid, so "Recovered" and every progress bar sat at zero.
function RepayModal({ loan, onClose, onSaved }) {
  const outstanding = Math.max(
    0,
    Number(loan.principal || 0) - Number(loan.repaid || 0),
  );
  const [amount, setAmount] = useState(
    loan.dailyDeduction ? String(loan.dailyDeduction) : "",
  );
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    const value = Number(amount);
    if (!value || value <= 0) {
      setError("Enter an amount greater than 0.");
      return;
    }
    if (value > outstanding) {
      setError("That is more than the " + taka(outstanding) + " still outstanding.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api.post("/loans/" + loan.id + "/repayments", {
        amount: value,
        note: note.trim() ? note.trim() : null,
      });
      onSaved();
    } catch (err) {
      setError(apiError(err, "Could not record this repayment."));
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-cg-ink">Record repayment</h3>
            <p className="mt-0.5 text-xs text-cg-ink/60">
              {loan.reference} — {loan.workerName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-cg-ink/50 hover:bg-cg-lime/40"
            aria-label="Close"
          >
            <LuX size={18} />
          </button>
        </div>

        <div className="mt-4 rounded-lg bg-cg-lime/30 px-3 py-2 text-sm text-cg-ink/70">
          Outstanding{" "}
          <span className="font-bold text-cg-ink">{taka(outstanding)}</span> of{" "}
          {taka(loan.principal)}
        </div>

        <label className="mt-4 block text-sm font-semibold text-cg-ink">
          Amount received
          <input
            className={FIELD}
            type="number"
            min="1"
            step="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="e.g. 500"
            autoFocus
          />
        </label>

        <label className="mt-3 block text-sm font-semibold text-cg-ink">
          Note (optional)
          <input
            className={FIELD}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. deducted from March wages"
          />
        </label>

        {error ? (
          <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className={BTN_GHOST} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={BTN_DARK} disabled={saving}>
            {saving ? "Saving…" : "Record repayment"}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

export default function Loans() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [summary, setSummary] = useState(null);
  const [requests, setRequests] = useState([]);
  const [repay, setRepay] = useState({ items: [], total: 0, totalPages: 0 });
  const [page, setPage] = useState(0);
  const [reqPage, setReqPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyReq, setBusyReq] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  // The pending request currently open in the AI assessment panel.
  const [scoring, setScoring] = useState(null);
  const [repayFor, setRepayFor] = useState(null);

  const loadTop = useCallback(async () => {
    const [s, r] = await Promise.all([
      api.get("/loans/summary"),
      api.get("/loans/requests", { params: { status: "PENDING" } }),
    ]);
    setSummary(s.data);
    setRequests(r.data);
  }, []);

  const loadRepay = useCallback(async () => {
    const { data } = await api.get("/loans/repayments", {
      params: { page, size: PAGE_SIZE },
    });
    setRepay(data);
  }, [page]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    Promise.all([loadTop(), loadRepay()])
      .catch((err) =>
        setError(
          apiError(
            err,
            "Could not load loans. Make sure the backend is running and you're signed in as admin or supervisor.",
          ),
        ),
      )
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadRepay().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const decide = async (id, action) => {
    setBusyReq(id);
    try {
      await api.post(`/loans/requests/${id}/${action}`);
      await Promise.all([loadTop(), loadRepay()]);
      setReqPage(0);
    } catch (err) {
      setError(apiError(err, "Could not update this request."));
    } finally {
      setBusyReq(null);
    }
  };

  const reqTotalPages = Math.max(1, Math.ceil(requests.length / REQ_PAGE_SIZE));
  const reqSlice = useMemo(
    () => requests.slice(reqPage * REQ_PAGE_SIZE, (reqPage + 1) * REQ_PAGE_SIZE),
    [requests, reqPage],
  );

  const from = repay.total === 0 ? 0 : page * PAGE_SIZE + 1;
  const to = Math.min((page + 1) * PAGE_SIZE, repay.total);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-cg-ink">Loan Management</h1>
          <p className="text-sm text-cg-ink/60">
            Managing capital circulation across the plantation workforce.
          </p>
        </div>
        {isAdmin ? (
          <button className={BTN_DARK} onClick={() => setShowAdd(true)}>
            <LuPlus size={16} /> New Request
          </button>
        ) : null}
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
      )}

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard
          icon={LuHandCoins}
          label="Active Loans"
          value={Number(summary?.activeLoans || 0).toLocaleString("en-IN")}
          sub="currently repaying"
        />
        <StatCard
          icon={LuClock}
          label="Pending Request"
          value={String(summary?.pendingRequests ?? 0).padStart(2, "0")}
          sub="awaiting review"
          tone="red"
        />
        <StatCard
          icon={LuCheckCheck}
          label="Approved"
          value={String(summary?.approved ?? 0).padStart(2, "0")}
          sub="last 30 days"
        />
        <StatCard
          icon={LuBanknote}
          label="Recovered"
          value={takaShort(summary?.recovered)}
          sub="total repaid"
        />
        <StatCard
          icon={LuTriangleAlert}
          label="Overdue"
          value={String(summary?.overdue ?? 0).padStart(2, "0")}
          sub="behind schedule"
          tone="red"
        />
      </div>

      {/* Pipeline stepper */}
      <Pipeline />

      {/* AI anomaly flags — catches loans that can never be recovered from
          wages, over-recovery, and figures that do not add up. */}
      <AnomalyPanel scope="loan" title="AI anomaly flags — loans" />

      {/* Pending Loan Requests */}
      <div className="overflow-hidden rounded-2xl bg-white shadow ring-1 ring-cg-green/10">
        <div className="border-b border-cg-green/10 bg-[#C0F28B] px-5 py-4">
          <h3 className="text-base font-bold text-cg-ink">Pending Loan Requests</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-cg-ink/50">
                <th className="bg-[#D3FFAC] px-5 py-3 font-semibold">Worker Profile</th>
                <th className="bg-[#D3FFAC] px-5 py-3 font-semibold">Requested Amount</th>
                <th className="bg-[#D3FFAC] px-5 py-3 font-semibold">Primary Reason</th>
                <th className="bg-[#D3FFAC] px-5 py-3 font-semibold">Submission Date</th>
                <th className="bg-[#D3FFAC] px-5 py-3 text-right font-semibold">Review Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cg-green/10">
              {loading ? (
                <tr>
                  <td className="px-5 py-8 text-center text-cg-ink/50" colSpan={5}>
                    Loading…
                  </td>
                </tr>
              ) : reqSlice.length === 0 ? (
                <tr>
                  <td className="px-5 py-8 text-center text-cg-ink/50" colSpan={5}>
                    No pending requests.
                  </td>
                </tr>
              ) : (
                reqSlice.map((r) => (
                  <tr key={r.id} className="hover:bg-cg-lime/20">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <Avatar name={r.workerName} url={r.avatarUrl} />
                        <div>
                          <p className="font-semibold text-cg-ink">{r.workerName}</p>
                          {r.zone ? (
                            <p className="text-xs text-cg-ink/50">Zone: {r.zone}</p>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 font-semibold text-cg-ink">{taka(r.amount)}</td>
                    <td className="px-5 py-4 text-cg-ink/70">{r.reason || "\u2014"}</td>
                    <td className="px-5 py-4 text-cg-ink/70">{dateFmt(r.requestedAt)}</td>
                    <td className="px-5 py-4">
                      {isAdmin ? (
                        <div className="flex items-center justify-end gap-2">
                          {/* AI assessment. Advisory only — it opens a panel,
                              it never decides. The two buttons beside it are
                              still the only way a loan changes status. */}
                          <button
                            onClick={() => setScoring(r)}
                            aria-label="AI credit assessment"
                            title="AI credit assessment"
                            className="grid h-8 w-8 place-items-center rounded-full border border-cg-green/30 text-cg-green transition hover:bg-cg-lime/50"
                          >
                            <LuBrain size={16} />
                          </button>
                          <button
                            onClick={() => decide(r.id, "approve")}
                            disabled={busyReq === r.id}
                            aria-label="Approve"
                            className="grid h-8 w-8 place-items-center rounded-full border border-emerald-200 text-emerald-600 transition hover:bg-emerald-50 disabled:opacity-50"
                          >
                            <LuCheck size={16} />
                          </button>
                          <button
                            onClick={() => decide(r.id, "reject")}
                            disabled={busyReq === r.id}
                            aria-label="Reject"
                            className="grid h-8 w-8 place-items-center rounded-full border border-rose-200 text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
                          >
                            <LuX size={16} />
                          </button>
                        </div>
                      ) : (
                        <span className="block text-right text-xs text-cg-ink/40">Admin only</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 bg-[#D3FFAC] px-5 py-3 text-sm">
          <span className="text-cg-ink/60">
            Showing {reqSlice.length} of {requests.length} requests
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setReqPage((p) => Math.max(0, p - 1))}
              disabled={reqPage === 0}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-semibold text-cg-ink/70 transition hover:bg-white/60 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <LuChevronLeft size={16} /> Previous
            </button>
            {pageWindow(reqPage, reqTotalPages).map((p, i) =>
              p === "gap" ? (
                <span key={`gap-${i}`} className="px-2 text-cg-ink/40">
                  …
                </span>
              ) : (
                <button
                  key={p}
                  onClick={() => setReqPage(p)}
                  className={`h-8 w-8 rounded-lg font-semibold transition ${
                    p === reqPage ? "bg-cg-dark text-white" : "text-cg-ink/70 hover:bg-white/60"
                  }`}
                >
                  {p + 1}
                </button>
              ),
            )}
            <button
              onClick={() => setReqPage((p) => Math.min(reqTotalPages - 1, p + 1))}
              disabled={reqPage >= reqTotalPages - 1}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-semibold text-cg-ink/70 transition hover:bg-white/60 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next <LuChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Active Loan Repayments */}
      <div className="overflow-hidden rounded-2xl bg-white shadow ring-1 ring-cg-green/10">
        <div className="border-b border-cg-green/10 bg-[#C0F28B] px-5 py-4">
          <h3 className="text-base font-bold text-cg-ink">Active Loan Repayments</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-cg-ink/50">
                <th className="bg-[#D3FFAC] px-5 py-3 font-semibold">Loan Reference</th>
                <th className="bg-[#D3FFAC] px-5 py-3 font-semibold">Worker Name</th>
                <th className="bg-[#D3FFAC] px-5 py-3 font-semibold">Principal Amount</th>
                <th className="bg-[#D3FFAC] px-5 py-3 font-semibold">Total Repaid</th>
                <th className="bg-[#D3FFAC] px-5 py-3 font-semibold">Repayment Progress</th>
                <th className="bg-[#D3FFAC] px-5 py-3 font-semibold">Daily Deduction</th>
                <th className="bg-[#D3FFAC] px-5 py-3 font-semibold">Current Status</th>
                <th className="bg-[#D3FFAC] px-5 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cg-green/10">
              {loading ? (
                <tr>
                  <td className="px-5 py-8 text-center text-cg-ink/50" colSpan={8}>
                    Loading…
                  </td>
                </tr>
              ) : repay.items.length === 0 ? (
                <tr>
                  <td className="px-5 py-8 text-center text-cg-ink/50" colSpan={8}>
                    No active loans.
                  </td>
                </tr>
              ) : (
                repay.items.map((l) => (
                  <tr key={l.id} className="hover:bg-cg-lime/20">
                    <td className="px-5 py-4 font-semibold text-cg-ink">{l.reference}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <Avatar name={l.workerName} url={l.avatarUrl} />
                        <div>
                          <p className="font-semibold text-cg-ink">{l.workerName}</p>
                          {l.zone ? (
                            <p className="text-xs text-cg-ink/50">Zone: {l.zone}</p>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-cg-ink">{taka(l.principal)}</td>
                    <td className="px-5 py-4 text-cg-ink">{taka(l.repaid)}</td>
                    <td className="px-5 py-4">
                      <Progress pct={l.progressPct} />
                    </td>
                    <td className="px-5 py-4 text-cg-ink">{taka(l.dailyDeduction)}</td>
                    <td className="px-5 py-4">
                      <StatusPill status={l.status} />
                    </td>
                    <td className="px-5 py-4 text-right">
                      {isAdmin ? (
                        <button
                          type="button"
                          className={BTN_GHOST}
                          onClick={() => setRepayFor(l)}
                        >
                          <LuHandCoins size={14} /> Record repayment
                        </button>
                      ) : (
                        <span className="text-xs text-cg-ink/40">Admin only</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 bg-[#D3FFAC] px-5 py-3 text-sm">
          <span className="text-cg-ink/60">
            {from}–{to} of {repay.total} entries
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-semibold text-cg-ink/70 transition hover:bg-white/60 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <LuChevronLeft size={16} /> Previous
            </button>
            {pageWindow(page, repay.totalPages).map((p, i) =>
              p === "gap" ? (
                <span key={`gap-${i}`} className="px-2 text-cg-ink/40">
                  …
                </span>
              ) : (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`h-8 w-8 rounded-lg font-semibold transition ${
                    p === page ? "bg-cg-dark text-white" : "text-cg-ink/70 hover:bg-white/60"
                  }`}
                >
                  {p + 1}
                </button>
              ),
            )}
            <button
              onClick={() => setPage((p) => Math.min(repay.totalPages - 1, p + 1))}
              disabled={page >= repay.totalPages - 1}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-semibold text-cg-ink/70 transition hover:bg-white/60 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next <LuChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {showAdd ? (
        <NewRequestModal
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false);
            setReqPage(0);
            loadTop().catch(() => {});
          }}
        />
      ) : null}

      {repayFor ? (
        <RepayModal
          loan={repayFor}
          onClose={() => setRepayFor(null)}
          onSaved={() => {
            setRepayFor(null);
            // Refresh the KPI row (Recovered) and the repayments table together.
            Promise.all([loadTop(), loadRepay()]).catch(() => {});
          }}
        />
      ) : null}

      {scoring ? (
        <LoanScoreCard loan={scoring} onClose={() => setScoring(null)} />
      ) : null}
    </div>
  );
}
