import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from "recharts";
import {
  LuBanknote,
  LuReceipt,
  LuTrendingUp,
  LuWallet,
  LuClock,
  LuTriangleAlert,
  LuArrowUpRight,
  LuArrowDownRight,
  LuFilter,
  LuRefreshCw,
  LuPlus,
  LuX,
  LuChevronLeft,
  LuChevronRight,
} from "react-icons/lu";
import api from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { BTN_DARK, BTN_GHOST } from "../../lib/ui";
import { apiError } from "../../lib/apiError";
import InfoTip from "../../components/admin/InfoTip";
import AnomalyPanel from "../../components/admin/AnomalyPanel";
import { todayISO } from "../../lib/localDate";

const PAGE_SIZE = 10;
const ACT_PAGE_SIZE = 8; // Money Movement feed
const FIELD =
  "mt-1 w-full rounded-lg border border-cg-green/20 bg-cg-lime/30 px-3 py-2 text-sm outline-none focus:border-cg-green";

// Estate money is in Bangladeshi Taka. Full grouped value for the ledger table.
function taka(n) {
  return (
    "৳" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })
  );
}

// Compact taka for the KPI cards: ৳X.XCr / ৳X.XL / grouped.
function takaCompact(n) {
  const v = Number(n || 0);
  const abs = Math.abs(v);
  if (abs >= 1e7) return "৳" + (v / 1e7).toFixed(2) + " Cr";
  if (abs >= 1e5) return "৳" + (v / 1e5).toFixed(2) + " L";
  return "৳" + v.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function fmtPct(p) {
  const v = Number(p || 0);
  return (v >= 0 ? "+" : "") + v.toFixed(1) + "%";
}

function titleCase(s) {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

// apiError() is imported from ../../lib/apiError (shared, single source of truth).

// Category badge palette (matches the Figma ledger legend).
const CATEGORY_BADGE = {
  REVENUE: "bg-blue-100 text-blue-700",
  PAYROLL: "bg-gray-200 text-gray-700",
  EXPENSE: "bg-rose-100 text-rose-700",
  LOAN: "bg-violet-100 text-violet-700",
};

// Pie slice colours, richest first.
const PIE_COLORS = [
  "#1c3a29",
  "#3f8f43",
  "#95c260",
  "#a9b263",
  "#c0f28b",
  "#dcefba",
];

// One KPI card. Matches the Payroll / Workforce StatCard: white, ring, label +
// info top-left, icon chip top-right. `tone` tints the chip + value for the two
// alert cards (amber Payables, red Overdue). `deltaPct` shows a coloured pill.
function StatCard({
  icon: Icon,
  label,
  value,
  deltaPct,
  sub,
  tone = "default",
  info,
}) {
  const chip =
    tone === "amber"
      ? "bg-amber-100 text-amber-600"
      : tone === "red"
        ? "bg-red-100 text-red-600"
        : "bg-cg-lime text-cg-green";
  const valueColor =
    tone === "red"
      ? "text-red-600"
      : tone === "amber"
        ? "text-amber-600"
        : "text-cg-ink";
  const hasDelta = deltaPct !== undefined && deltaPct !== null;
  const up = Number(deltaPct) >= 0;
  return (
    <div className="rounded-2xl bg-white p-5 shadow ring-1 ring-cg-green/10">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-cg-ink/50">
            {label}
          </p>
          {info ? <InfoTip text={info} /> : null}
        </div>
        <span
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${chip}`}
        >
          <Icon size={18} />
        </span>
      </div>
      <p className={`mt-2 text-2xl font-extrabold ${valueColor}`}>{value}</p>
      <div className="mt-1 flex items-center gap-2">
        {hasDelta ? (
          <span
            className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-semibold ${
              up ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"
            }`}
          >
            {up ? <LuArrowUpRight size={12} /> : <LuArrowDownRight size={12} />}
            {fmtPct(deltaPct)}
          </span>
        ) : null}
        {sub ? <p className="text-xs text-cg-ink/50">{sub}</p> : null}
      </div>
    </div>
  );
}

function StatusPill({ status }) {
  const pending = status === "PENDING";
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-cg-ink/80">
      <span
        className={`h-2 w-2 rounded-full ${pending ? "bg-amber-500" : "bg-emerald-500"}`}
      />
      {pending ? "Pending" : "Settled"}
    </span>
  );
}

// Dark modal header matching the New Worker Enrollment / Payroll modals.
function ModalHeader({ title, subtitle, onClose }) {
  return (
    <div className="flex items-start justify-between gap-4 bg-cg-dark px-6 py-5 text-white">
      <div>
        <h3 className="text-lg font-extrabold">{title}</h3>
        {subtitle ? (
          <p className="mt-0.5 text-sm text-white/70">{subtitle}</p>
        ) : null}
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

const EMPTY_ENTRY = {
  entryDate: todayISO(),
  refId: "",
  category: "EXPENSE",
  account: "",
  amount: "",
  status: "SETTLED",
  dueDate: "",
  note: "",
};

function AddEntryModal({ onClose, onSaved }) {
  const [form, setForm] = useState(EMPTY_ENTRY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.account.trim()) return setError("Account is required.");
    if (form.amount === "" || Number(form.amount) < 0)
      return setError("Enter a valid amount.");
    setSaving(true);
    try {
      await api.post("/finance/entries", {
        entryDate: form.entryDate || null,
        refId: form.refId || null,
        category: form.category,
        account: form.account.trim(),
        amount: Number(form.amount),
        status: form.status,
        dueDate: form.status === "PENDING" ? form.dueDate || null : null,
        note: form.note || null,
      });
      onSaved();
    } catch (err) {
      setError(apiError(err, "Could not save this entry. Try again."));
    } finally {
      setSaving(false);
    }
  };

  const lbl = "block text-sm font-semibold text-cg-ink/70";

  return createPortal(
    <div
      className="fixed inset-0 z-[80] grid place-items-center bg-black/40 p-4"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <ModalHeader
          title="Add ledger entry"
          subtitle="Record a manual revenue, expense, payroll or loan line."
          onClose={onClose}
        />
        <div className="space-y-4 p-6">
          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <label className={lbl}>
              Date
              <input
                type="date"
                className={FIELD}
                value={form.entryDate}
                onChange={(e) => set("entryDate", e.target.value)}
              />
            </label>
            <label className={lbl}>
              Reference ID
              <input
                className={FIELD}
                placeholder="e.g. TXN-98671"
                value={form.refId}
                onChange={(e) => set("refId", e.target.value)}
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <label className={lbl}>
              Category
              <select
                className={FIELD}
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
              >
                <option value="REVENUE">Revenue</option>
                <option value="EXPENSE">Expense</option>
                <option value="PAYROLL">Payroll</option>
                <option value="LOAN">Loan</option>
              </select>
            </label>
            <label className={lbl}>
              Account
              <input
                className={FIELD}
                placeholder="e.g. Fertilizer"
                value={form.account}
                onChange={(e) => set("account", e.target.value)}
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <label className={lbl}>
              Amount (৳)
              <input
                type="number"
                min="0"
                step="0.01"
                className={FIELD}
                placeholder="0"
                value={form.amount}
                onChange={(e) => set("amount", e.target.value)}
              />
            </label>
            <label className={lbl}>
              Status
              <select
                className={FIELD}
                value={form.status}
                onChange={(e) => set("status", e.target.value)}
              >
                <option value="SETTLED">Settled</option>
                <option value="PENDING">Pending</option>
              </select>
            </label>
          </div>
          {form.status === "PENDING" ? (
            <label className={lbl}>
              Due date
              <input
                type="date"
                className={FIELD}
                value={form.dueDate}
                onChange={(e) => set("dueDate", e.target.value)}
              />
            </label>
          ) : null}
          <label className={lbl}>
            Note
            <textarea
              className={FIELD}
              rows={2}
              placeholder="Optional"
              value={form.note}
              onChange={(e) => set("note", e.target.value)}
            />
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-cg-green/10 px-6 py-4">
          <button type="button" className={BTN_GHOST} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={BTN_DARK} disabled={saving}>
            {saving ? "Saving…" : "Save entry"}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

// The four auto-posted movement kinds shown in the Money Movement feed.
const KIND_META = {
  PAYROLL: { label: "Payroll paid", cls: "bg-cg-lime/70 text-cg-ink" },
  WITHDRAWAL: { label: "Withdrawal", cls: "bg-amber-100 text-amber-800" },
  LOAN_OUT: { label: "Loan out", cls: "bg-rose-100 text-rose-700" },
  LOAN_IN: { label: "Loan repaid", cls: "bg-emerald-100 text-emerald-700" },
  // Recovered from a payslip, not paid in cash: the loan balance moved but no
  // money did, so it is deliberately not coloured as an inflow.
  LOAN_IN_WAGE: {
    label: "Loan repaid (wages)",
    cls: "bg-cg-green/10 text-cg-ink/70",
  },
  OTHER: { label: "Other", cls: "bg-cg-green/10 text-cg-ink/70" },
};

function KindPill({ kind }) {
  const m = KIND_META[kind] || KIND_META.OTHER;
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${m.cls}`}
    >
      {m.label}
    </span>
  );
}

export default function Finance() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [summary, setSummary] = useState(null);
  const [trend, setTrend] = useState([]);
  const [breakdown, setBreakdown] = useState([]);
  const [ledger, setLedger] = useState({
    entries: [],
    total: 0,
    totalPages: 0,
  });
  const [page, setPage] = useState(0);
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [activity, setActivity] = useState({
    entries: [],
    total: 0,
    totalPages: 0,
    totalOut: 0,
    totalIn: 0,
  });
  const [actPage, setActPage] = useState(0);
  const [actKind, setActKind] = useState("");

  const loadTop = useCallback(async () => {
    const [s, t, b] = await Promise.all([
      api.get("/finance/summary"),
      api.get("/finance/trend", { params: { months: 6 } }),
      api.get("/finance/breakdown"),
    ]);
    setSummary(s.data);
    setTrend(t.data);
    setBreakdown(b.data);
  }, []);

  const loadLedger = useCallback(async () => {
    const { data } = await api.get("/finance/ledger", {
      params: { page, size: PAGE_SIZE, category, status, q },
    });
    setLedger(data);
  }, [page, category, status, q]);

  // Money Movement: the auto-posted lines only (payroll, withdrawals, loans).
  const loadActivity = useCallback(async () => {
    const { data } = await api.get("/finance/activity", {
      params: { page: actPage, size: ACT_PAGE_SIZE, kind: actKind },
    });
    setActivity(data);
  }, [actPage, actKind]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    Promise.all([loadTop(), loadLedger(), loadActivity()])
      .catch((err) =>
        setError(
          apiError(
            err,
            "Could not load finance data. Make sure the backend is running and you're signed in as admin or supervisor.",
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
    loadLedger().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, category, status]);

  useEffect(() => {
    loadActivity().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actPage, actKind]);

  const pieData = useMemo(
    () =>
      breakdown.map((d) => ({
        name: d.label,
        value: Number(d.amount),
        percent: d.percent,
      })),
    [breakdown],
  );

  // Profit margin = net profit / total revenue. Drives the snapshot strip that
  // fills out the right-hand breakdown card.
  const profitMargin =
    summary && Number(summary.totalRevenue) > 0
      ? (Number(summary.netProfit) / Number(summary.totalRevenue)) * 100
      : null;

  const onSearch = (e) => {
    e.preventDefault();
    setPage(0);
    loadLedger().catch(() => {});
  };

  const actFrom = activity.total === 0 ? 0 : actPage * ACT_PAGE_SIZE + 1;
  const actTo = Math.min((actPage + 1) * ACT_PAGE_SIZE, activity.total);
  const from = ledger.total === 0 ? 0 : page * PAGE_SIZE + 1;
  const to = Math.min((page + 1) * PAGE_SIZE, ledger.total);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-cg-ink">
            Finance Overview
          </h1>
          <p className="text-sm text-cg-ink/60">
            Monitor income, spending, and overall financial status in real time.
          </p>
        </div>
        {isAdmin ? (
          <button className={BTN_DARK} onClick={() => setShowAdd(true)}>
            <LuPlus size={16} /> Add entry
          </button>
        ) : null}
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          icon={LuBanknote}
          label="Total Revenue"
          value={takaCompact(summary?.totalRevenue)}
          deltaPct={summary?.revenueChangePct}
          sub="vs last month"
          info="Sum of all revenue ledger entries. Delta compares this month to last."
        />
        <StatCard
          icon={LuReceipt}
          label="Total Expenses"
          value={takaCompact(summary?.totalExpenses)}
          deltaPct={summary?.expenseChangePct}
          sub="vs last month"
          info="Expenses plus payroll. Delta compares this month to last."
        />
        <StatCard
          icon={LuTrendingUp}
          label="Net Profit"
          value={takaCompact(summary?.netProfit)}
          deltaPct={summary?.profitChangePct}
          sub="vs last month"
          info="Revenue minus expenses and payroll."
        />
        <StatCard
          icon={LuWallet}
          label="Cash on Hand"
          value={takaCompact(summary?.cashOnHand)}
          sub="Available for ops"
          info="Settled revenue minus settled expenses, payroll and loans."
        />
        <StatCard
          icon={LuClock}
          label="Payables Due"
          value={takaCompact(summary?.payablesDue)}
          sub="In the next 7 days"
          tone="amber"
          info="Pending lines with a due date within the next 7 days."
        />
        <StatCard
          icon={LuTriangleAlert}
          label="Overdue"
          value={takaCompact(summary?.overdue)}
          sub="Critical attention"
          tone="red"
          info="Pending lines already past their due date."
        />
      </div>

      {/* AI anomaly flags — live. Scans the ledger for duplicate spend,
          off-pattern amounts and overdue payables. */}
      <AnomalyPanel scope="finance" title="AI anomaly flags — ledger" />

      {/* Charts: cashflow trends (left) + expense pie (right) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl bg-white p-5 shadow ring-1 ring-cg-green/10">
          <div className="mb-4 flex items-center gap-2">
            <h2 className="font-bold text-cg-ink">
              Cashflow &amp; Profit Trends
            </h2>
            <InfoTip text="Monthly revenue versus profit (revenue minus expenses and payroll)." />
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trend} barGap={6}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#e5efe0"
                />
                <XAxis
                  dataKey="month"
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                />
                <YAxis
                  tickFormatter={(v) => takaCompact(v)}
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                  width={70}
                />
                <Tooltip formatter={(v, n) => [taka(v), titleCase(n)]} />
                <Legend />
                <Bar
                  dataKey="revenue"
                  name="Revenue"
                  fill="#1c3a29"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="profit"
                  name="Profit"
                  fill="#95c260"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow ring-1 ring-cg-green/10">
          <div className="mb-4 flex items-center gap-2">
            <h2 className="font-bold text-cg-ink">Revenue vs Expenses</h2>
            <InfoTip text="Monthly revenue against total spending (expenses plus payroll) over the last 6 months." />
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend}>
                <defs>
                  <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3f8f43" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#3f8f43" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="expFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#e11d48" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#e11d48" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#e5efe0"
                />
                <XAxis
                  dataKey="month"
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                />
                <YAxis
                  tickFormatter={(v) => takaCompact(v)}
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                  width={70}
                />
                <Tooltip formatter={(v, n) => [taka(v), titleCase(n)]} />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  name="Revenue"
                  stroke="#3f8f43"
                  strokeWidth={2}
                  fill="url(#revFill)"
                />
                <Area
                  type="monotone"
                  dataKey="expense"
                  name="Expense"
                  stroke="#e11d48"
                  strokeWidth={2}
                  fill="url(#expFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Secondary charts: expenses breakdown pie + cash flow summary */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl bg-white p-5 shadow ring-1 ring-cg-green/10">
          <div className="mb-4 flex items-center gap-2">
            <h2 className="font-bold text-cg-ink">Expenses Breakdown</h2>
            <InfoTip text="Share of total spending (expenses and payroll) by account." />
          </div>
          {pieData.length === 0 ? (
            <div className="grid h-72 place-items-center text-sm text-cg-ink/40">
              No data yet
            </div>
          ) : (
            <>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius="80%"
                    >
                      {pieData.map((_, i) => (
                        <Cell
                          key={i}
                          fill={PIE_COLORS[i % PIE_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v, n) => [taka(v), n]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-2 space-y-1.5">
                {pieData.map((d, i) => (
                  <li key={d.name} className="flex items-center gap-2 text-xs">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                    />
                    <span className="truncate text-cg-ink/70">{d.name}</span>
                    <span className="ml-auto tabular-nums text-cg-ink/50">
                      {taka(d.value)}
                    </span>
                    <span className="w-11 text-right font-semibold text-cg-ink">
                      {d.percent}%
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 grid grid-cols-2 gap-3 border-t border-cg-green/10 pt-3">
                <div>
                  <p className="text-xs text-cg-ink/50">Total spend</p>
                  <p className="text-sm font-extrabold text-cg-ink">
                    {takaCompact(summary?.totalExpenses)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-cg-ink/50">Profit margin</p>
                  <p
                    className={`text-sm font-extrabold ${
                      (profitMargin ?? 0) >= 0
                        ? "text-cg-green"
                        : "text-red-600"
                    }`}
                  >
                    {profitMargin === null ? "—" : fmtPct(profitMargin)}
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex flex-col rounded-2xl bg-white p-5 shadow ring-1 ring-cg-green/10">
          <div className="mb-4 flex items-center gap-2">
            <h2 className="font-bold text-cg-ink">Cash Flow Summary</h2>
            <InfoTip text="Totals across the ledger: money in, money out, and what is left." />
          </div>
          <div className="flex flex-1 flex-col gap-2.5">
            <div className="flex flex-1 items-center justify-between rounded-xl bg-cg-lime/30 px-4 ring-1 ring-cg-green/10">
              <span className="flex items-center gap-2 text-sm text-cg-ink/70">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-white text-cg-green">
                  <LuArrowUpRight size={16} />
                </span>
                Total inflow
              </span>
              <span className="text-base font-extrabold text-cg-green">
                {takaCompact(summary?.totalRevenue)}
              </span>
            </div>
            <div className="flex flex-1 items-center justify-between rounded-xl bg-cg-lime/30 px-4 ring-1 ring-cg-green/10">
              <span className="flex items-center gap-2 text-sm text-cg-ink/70">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-white text-red-600">
                  <LuArrowDownRight size={16} />
                </span>
                Total outflow
              </span>
              <span className="text-base font-extrabold text-red-600">
                {takaCompact(summary?.totalExpenses)}
              </span>
            </div>
            <div className="flex flex-1 items-center justify-between rounded-xl bg-cg-lime/30 px-4 ring-1 ring-cg-green/10">
              <span className="flex items-center gap-2 text-sm text-cg-ink/70">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-white text-cg-green">
                  <LuWallet size={16} />
                </span>
                Cash on hand
              </span>
              <span className="text-base font-extrabold text-cg-ink">
                {takaCompact(summary?.cashOnHand)}
              </span>
            </div>
            <div className="flex flex-1 items-center justify-between rounded-xl border border-cg-green/15 px-4 ring-1 ring-cg-green/10">
              <span className="flex items-center gap-2 text-sm text-cg-ink/70">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-cg-lime text-cg-green">
                  <LuTrendingUp size={16} />
                </span>
                Net profit
              </span>
              <span
                className={`text-base font-extrabold ${
                  Number(summary?.netProfit) >= 0
                    ? "text-cg-green"
                    : "text-red-600"
                }`}
              >
                {takaCompact(summary?.netProfit)}
              </span>
            </div>
            <div className="flex flex-1 items-center justify-between rounded-xl border border-cg-green/15 px-4 ring-1 ring-cg-green/10">
              <span className="flex items-center gap-2 text-sm text-cg-ink/70">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-cg-lime text-cg-green">
                  <LuTrendingUp size={16} />
                </span>
                Profit margin
              </span>
              <span
                className={`text-base font-extrabold ${
                  (profitMargin ?? 0) >= 0 ? "text-cg-green" : "text-red-600"
                }`}
              >
                {profitMargin === null ? "—" : fmtPct(profitMargin)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* General ledger */}
      <div className="overflow-hidden rounded-2xl bg-white shadow ring-1 ring-cg-green/10">
        <div className="flex flex-wrap items-center justify-between gap-3 bg-[#C0F28B] px-4 py-3">
          <div className="flex items-center gap-2 font-bold text-cg-ink">
            <LuReceipt size={18} /> General Ledger
          </div>
          <form
            onSubmit={onSearch}
            className="flex flex-wrap items-center gap-2"
          >
            <span className="flex items-center gap-1 text-xs font-semibold text-cg-ink/70">
              <LuFilter size={14} /> Filter
            </span>
            <select
              className="rounded-lg border border-cg-green/30 bg-white px-2 py-1 text-sm outline-none"
              value={category}
              onChange={(e) => {
                setPage(0);
                setCategory(e.target.value);
              }}
            >
              <option value="">All categories</option>
              <option value="REVENUE">Revenue</option>
              <option value="EXPENSE">Expense</option>
              <option value="PAYROLL">Payroll</option>
              <option value="LOAN">Loan</option>
            </select>
            <select
              className="rounded-lg border border-cg-green/30 bg-white px-2 py-1 text-sm outline-none"
              value={status}
              onChange={(e) => {
                setPage(0);
                setStatus(e.target.value);
              }}
            >
              <option value="">All status</option>
              <option value="SETTLED">Settled</option>
              <option value="PENDING">Pending</option>
            </select>
            <input
              className="rounded-lg border border-cg-green/30 bg-white px-3 py-1 text-sm outline-none"
              placeholder="Search account or ref…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <button type="submit" className={BTN_GHOST}>
              <LuRefreshCw size={14} /> Search
            </button>
          </form>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-cg-ink/60">
              <tr>
                <th className="bg-[#D3FFAC] px-5 py-3">Date</th>
                <th className="bg-[#D3FFAC] px-5 py-3">Ref ID</th>
                <th className="bg-[#D3FFAC] px-5 py-3">Category</th>
                <th className="bg-[#D3FFAC] px-5 py-3">Account</th>
                <th className="bg-[#D3FFAC] px-5 py-3 text-right">Amount</th>
                <th className="bg-[#D3FFAC] px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cg-green/10">
              {loading ? (
                <tr>
                  <td
                    colSpan={6}
                    className="bg-white px-5 py-10 text-center text-cg-ink/50"
                  >
                    Loading…
                  </td>
                </tr>
              ) : ledger.entries.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="bg-white px-5 py-10 text-center text-cg-ink/50"
                  >
                    No transactions found.
                  </td>
                </tr>
              ) : (
                ledger.entries.map((e) => (
                  <tr key={e.id} className="hover:bg-cg-lime/20">
                    <td className="px-5 py-3 text-cg-ink/70">{e.date}</td>
                    <td className="px-5 py-3 font-mono text-xs text-cg-ink/60">
                      {e.refId || "—"}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          CATEGORY_BADGE[e.category] ||
                          "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {titleCase(e.category)}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-cg-ink">{e.account}</td>
                    <td className="px-5 py-3 text-right font-semibold text-cg-ink">
                      {taka(e.amount)}
                    </td>
                    <td className="px-5 py-3">
                      <StatusPill status={e.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer / pagination */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-[#D3FFAC] px-5 py-3 text-sm text-cg-ink/70">
          <span>
            Showing {from}–{to} of {ledger.total} transactions
          </span>
          <div className="flex items-center gap-1">
            <button
              className="grid h-8 w-8 place-items-center rounded-lg bg-white/70 disabled:opacity-40"
              disabled={page <= 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              aria-label="Previous page"
            >
              <LuChevronLeft size={16} />
            </button>
            <span className="px-2">
              Page {ledger.totalPages === 0 ? 0 : page + 1} of{" "}
              {ledger.totalPages}
            </span>
            <button
              className="grid h-8 w-8 place-items-center rounded-lg bg-white/70 disabled:opacity-40"
              disabled={page + 1 >= ledger.totalPages}
              onClick={() => setPage((p) => p + 1)}
              aria-label="Next page"
            >
              <LuChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Money Movement: auto-posted payroll / withdrawal / loan lines */}
      <div className="overflow-hidden rounded-2xl bg-white shadow ring-1 ring-cg-green/10">
        <div className="flex flex-wrap items-center justify-between gap-3 bg-[#C0F28B] px-4 py-3">
          <div className="flex items-center gap-2 font-bold text-cg-ink">
            <LuWallet size={18} /> Money Movement
            <InfoTip text="Every amount the system posted to the ledger on its own: wages paid, worker withdrawals cashed out, and loan capital going out and coming back. Manual entries stay in the General Ledger above." />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1 text-xs font-semibold text-cg-ink/70">
              <LuFilter size={14} /> Type
            </span>
            <select
              className="rounded-lg border border-cg-green/30 bg-white px-2 py-1 text-sm outline-none"
              value={actKind}
              onChange={(e) => {
                setActPage(0);
                setActKind(e.target.value);
              }}
            >
              <option value="">All movement</option>
              <option value="payroll">Payroll paid</option>
              <option value="withdrawal">Withdrawals</option>
              <option value="loan_out">Loan out</option>
              <option value="loan_in">Loan repaid</option>
            </select>
            <button
              type="button"
              className={BTN_GHOST}
              onClick={() => loadActivity().catch(() => {})}
            >
              <LuRefreshCw size={14} /> Refresh
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-cg-ink/50">
                <th className="bg-[#D3FFAC] px-5 py-3 font-semibold">Date</th>
                <th className="bg-[#D3FFAC] px-5 py-3 font-semibold">Type</th>
                <th className="bg-[#D3FFAC] px-5 py-3 font-semibold">Reference</th>
                <th className="bg-[#D3FFAC] px-5 py-3 font-semibold">Worker / Account</th>
                <th className="bg-[#D3FFAC] px-5 py-3 font-semibold">Detail</th>
                <th className="bg-[#D3FFAC] px-5 py-3 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cg-green/10">
              {loading ? (
                <tr>
                  <td className="px-5 py-8 text-center text-cg-ink/50" colSpan={6}>
                    Loading...
                  </td>
                </tr>
              ) : activity.entries.length === 0 ? (
                <tr>
                  <td className="px-5 py-8 text-center text-cg-ink/50" colSpan={6}>
                    No automatic movement yet. Pay a payslip, approve a withdrawal
                    or disburse a loan and it will appear here.
                  </td>
                </tr>
              ) : (
                activity.entries.map((e) => {
                  const isIn = e.direction === "IN";
                  // NEUTRAL = loan repaid out of wages. No cash moved, so it
                  // gets no +/- and no red/green.
                  const isNeutral = e.direction === "NEUTRAL";
                  return (
                    <tr key={e.id} className="hover:bg-cg-lime/20">
                      <td className="whitespace-nowrap px-5 py-4 text-cg-ink/80">
                        {e.date}
                      </td>
                      <td className="px-5 py-4">
                        <KindPill kind={e.kind} />
                      </td>
                      <td className="px-5 py-4 font-semibold text-cg-ink">
                        {e.refId || "-"}
                      </td>
                      <td className="px-5 py-4 text-cg-ink">{e.account}</td>
                      <td className="px-5 py-4 text-xs text-cg-ink/60">
                        {e.note || "-"}
                      </td>
                      <td
                        className={`whitespace-nowrap px-5 py-4 text-right font-bold ${
                          isNeutral
                            ? "text-cg-ink/50"
                            : isIn
                              ? "text-emerald-600"
                              : "text-rose-600"
                        }`}
                      >
                        <span className="inline-flex items-center gap-1">
                          {isNeutral ? null : isIn ? (
                            <LuArrowDownRight size={14} />
                          ) : (
                            <LuArrowUpRight size={14} />
                          )}
                          {isNeutral ? "" : isIn ? "+" : "-"}
                          {taka(e.amount)}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 bg-[#D3FFAC] px-5 py-3 text-sm text-cg-ink/70">
          <div className="flex flex-wrap items-center gap-4">
            <span>
              {actFrom}-{actTo} of {activity.total} movements
            </span>
            <span className="font-semibold text-rose-600">
              Out {taka(activity.totalOut)}
            </span>
            <span className="font-semibold text-emerald-600">
              Back in {taka(activity.totalIn)}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              className="grid h-8 w-8 place-items-center rounded-lg bg-white/70 disabled:opacity-40"
              disabled={actPage <= 0}
              onClick={() => setActPage((p) => Math.max(0, p - 1))}
              aria-label="Previous page"
            >
              <LuChevronLeft size={16} />
            </button>
            <span className="px-2">
              Page {activity.totalPages === 0 ? 0 : actPage + 1} of{" "}
              {activity.totalPages}
            </span>
            <button
              className="grid h-8 w-8 place-items-center rounded-lg bg-white/70 disabled:opacity-40"
              disabled={actPage + 1 >= activity.totalPages}
              onClick={() => setActPage((p) => p + 1)}
              aria-label="Next page"
            >
              <LuChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {showAdd ? (
        <AddEntryModal
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false);
            setPage(0);
            loadTop().catch(() => {});
            loadLedger().catch(() => {});
          }}
        />
      ) : null}
    </div>
  );
}
