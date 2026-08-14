import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import {
  LuWallet,
  LuUsers,
  LuBanknote,
  LuClipboardList,
  LuSettings,
  LuRefreshCw,
  LuCheck,
  LuCheckCheck,
  LuX,
  LuPencil,
  LuFilter,
  LuDownload,
  LuPlay,
  LuScale,
  LuTrendingUp,
  LuTrendingDown,
  LuActivity,
  LuCalendarDays,
  LuTriangleAlert,
} from "react-icons/lu";
import api from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { BTN_DARK, BTN_GHOST } from "../../lib/ui";
import { apiError } from "../../lib/apiError";
import InfoTip from "../../components/admin/InfoTip";
import WithdrawalsPanel from "../../components/admin/WithdrawalsPanel";
import AnomalyPanel from "../../components/admin/AnomalyPanel";
import SmsLogPanel from "../../components/admin/SmsLogPanel";
import PayslipDocument from "../../components/admin/PayslipDocument";
import PayslipReviewDrawer from "../../components/admin/PayslipReviewDrawer";
import { monthStartISO, monthEndISO } from "../../lib/localDate";

const GREEN = "#3f8f43";

const STATUS_META = {
  draft: {
    label: "Draft",
    pill: "bg-gray-100 text-gray-600",
    icon: LuPencil,
    desc: "Freshly built from attendance. Fully editable — adjust deductions before sending on.",
  },
  review: {
    label: "Review",
    pill: "bg-amber-100 text-amber-700",
    icon: LuClipboardList,
    desc: "Submitted for a second check. Deductions can still be tweaked, but the base amounts are frozen.",
  },
  approved: {
    label: "Approved",
    pill: "bg-sky-100 text-sky-700",
    icon: LuCheck,
    desc: "Signed off and ready to disburse. No more edits allowed.",
  },
  paid: {
    label: "Paid",
    pill: "bg-green-100 text-green-700",
    icon: LuBanknote,
    desc: "Money released to the worker and stamped with the payment time. Final state.",
  },
};
const STAGES = ["draft", "review", "approved", "paid"];

// Payroll owns three sub-parts. Withdrawals and the SMS log are not separate
// admin features -- they are Payroll concerns, so they live here as tabs
// rather than as their own sidebar entries.
const PAYROLL_TABS = [
  { key: "payslips", label: "Payslips" },
  { key: "withdrawals", label: "Withdrawals" },
  { key: "sms", label: "SMS Log" },
];

const ROLE_LABEL = {
  plucker: "Plucker",
  maintenance: "Maintenance",
  sprayer: "Sprayer",
  weeder: "Weeder",
  factory: "Factory",
  other: "Other",
};

const PAGE_SIZE = 8;
const FIELD =
  "mt-1 w-full rounded-lg border border-cg-green/20 bg-cg-lime/30 px-3 py-2 text-sm outline-none focus:border-cg-green";

function taka(n) {
  return (
    "৳" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })
  );
}
function workerCode(id) {
  return "#CG" + String(id).padStart(3, "0");
}
// apiError() is imported from ../../lib/apiError (shared, single source of truth).

function StatCard({ icon: Icon, label, value, sub, info }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow ring-1 ring-cg-green/10">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-cg-ink/50">
            {label}
          </p>
          {info ? <InfoTip text={info} /> : null}
        </div>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-cg-lime text-cg-green">
          <Icon size={18} />
        </span>
      </div>
      <p className="mt-2 text-2xl font-extrabold text-cg-ink">{value}</p>
      {sub ? <p className="mt-1 text-xs text-cg-ink/50">{sub}</p> : null}
    </div>
  );
}

function RateField({ label, value, unit, info }) {
  return (
    <div>
      <div className="flex items-center gap-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-cg-ink/50">
          {label}
        </p>
        {info ? <InfoTip text={info} /> : null}
      </div>
      <div className="mt-1 rounded-lg bg-cg-lime/40 px-3 py-2 text-lg font-bold text-cg-ink">
        {value}
        {unit ? (
          <span className="ml-1 text-xs font-medium text-cg-ink/50">
            {unit}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function StatusPill({ status }) {
  const m = STATUS_META[status] || STATUS_META.draft;
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${m.pill}`}
    >
      {m.label}
    </span>
  );
}

// Reusable dark modal header that matches the New Worker Enrollment design.
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

export default function Payroll() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [periodStart, setPeriodStart] = useState(monthStartISO());
  const [periodEnd, setPeriodEnd] = useState(monthEndISO());
  const [rows, setRows] = useState([]);
  const [trend, setTrend] = useState([]);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const [tab, setTab] = useState("payslips");
  const [settlement, setSettlement] = useState(null);
  const [settling, setSettling] = useState(false);
  const [settleNote, setSettleNote] = useState("");
  // v10: payslip PDF preview, and advances still waiting to be recovered.
  const [printRows, setPrintRows] = useState(null);
  const [pending, setPending] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [nameQuery, setNameQuery] = useState("");
  const [page, setPage] = useState(1);

  const [editRow, setEditRow] = useState(null);
  const [ded, setDed] = useState({
    loanDeduction: 0,
    advanceRecovery: 0,
    otherDeduction: 0,
  });
  const [savingDed, setSavingDed] = useState(false);
  const [dedErr, setDedErr] = useState("");

  const [reviewRow, setReviewRow] = useState(null);
  const [skipped, setSkipped] = useState([]);
  const [cfgOpen, setCfgOpen] = useState(false);
  const [cfgDraft, setCfgDraft] = useState(null);
  const [savingCfg, setSavingCfg] = useState(false);
  const [cfgErr, setCfgErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [listRes, trendRes, cfgRes, pendRes, setlRes] = await Promise.all([
        api.get("/payroll", { params: { periodStart, periodEnd } }),
        api.get("/payroll/trend", { params: { limit: 14 } }),
        api.get("/payroll/config"),
        api.get("/payroll/pending-recoveries"),
        // Settlement is the thing that actually moves money now, so its state
        // belongs on the same screen as the payslips. Failing softly: a broken
        // status call must not blank the whole payroll page.
        api.get("/settlement/status").catch(() => ({ data: null })),
      ]);
      setRows(listRes.data);
      setTrend(trendRes.data);
      setConfig(cfgRes.data);
      setPending(pendRes.data);
      setSettlement(setlRes.data);
    } catch (err) {
      setError(
        apiError(
          err,
          "Could not load payroll. Make sure the backend is running and you're signed in as admin or supervisor.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [periodStart, periodEnd]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    setPage(1);
  }, [statusFilter, periodStart, periodEnd]);

  const filtered = useMemo(() => {
    const q = nameQuery.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (statusFilter === "all" || r.status === statusFilter) &&
        (!q || (r.workerName || "").toLowerCase().includes(q)),
    );
  }, [rows, statusFilter, nameQuery]);

  const totals = useMemo(() => {
    const t = {
      gross: 0,
      net: 0,
      paidNet: 0,
      deductions: 0,
      workers: rows.length,
      zones: new Set(),
      draft: 0,
      review: 0,
      approved: 0,
      paid: 0,
    };
    for (const r of rows) {
      t.gross += Number(r.grossAmount || 0);
      t.net += Number(r.netPayable || 0);
      t.deductions +=
        Number(r.loanDeduction || 0) +
        Number(r.advanceRecovery || 0) +
        Number(r.otherDeduction || 0);
      if (r.status === "paid") t.paidNet += Number(r.netPayable || 0);
      if (r.zoneName) t.zones.add(r.zoneName);
      t[r.status] = (t[r.status] || 0) + 1;
    }
    return t;
  }, [rows]);

  const trendData = useMemo(
    () =>
      trend.map((p, i) => ({
        label: "p" + (i + 1),
        net: Number(p.totalNet || 0),
      })),
    [trend],
  );
  const trendStats = useMemo(() => {
    if (trendData.length === 0) return null;
    const nets = trendData.map((d) => d.net);
    const total = nets.reduce((s, n) => s + n, 0);
    const maxIdx = nets.indexOf(Math.max(...nets));
    const minIdx = nets.indexOf(Math.min(...nets));
    return {
      total,
      avg: Math.round(total / nets.length),
      high: { label: trendData[maxIdx].label, net: nets[maxIdx] },
      low: { label: trendData[minIdx].label, net: nets[minIdx] },
    };
  }, [trendData]);

  const paidPct = totals.workers
    ? Math.round((totals.paid / totals.workers) * 100)
    : 0;
  const avgWage = totals.workers
    ? Math.round(totals.gross / totals.workers)
    : 0;

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Run settlement now. Safe to press twice: daily_settlement is UNIQUE on
  // (worker_id, work_date), so a second run settles nothing a second time.
  // Rows whose register has moved since they were built. Derived, not fetched:
  // the flag rides along on every payslip in the list.
  const staleRows = rows.filter((r) => r.stale);

  const runSettlement = async () => {
    setSettling(true);
    setSettleNote("");
    setError("");
    try {
      const { data } = await api.post("/settlement/run");
      const days = Number(data?.daysSettled || 0);
      const workers = Number(data?.workersSettled || 0);
      const failures = data?.failures || [];
      setSettleNote(
        days === 0
          ? "Nothing to settle — every completed day is already recorded."
          : `Settled ${days} day${days === 1 ? "" : "s"} across ${workers} worker${
              workers === 1 ? "" : "s"
            }.` +
            (failures.length
              ? ` ${failures.length} could not be settled: ${failures.join(", ")}.`
              : "")
      );
      // Loan balances have moved, so the payslips on screen are stale.
      await load();
    } catch (err) {
      setError(apiError(err, "Could not run settlement."));
    } finally {
      setSettling(false);
    }
  };

  const generate = async () => {
    setBusy(true);
    setNotice("");
    setError("");
    try {
      const { data } = await api.post("/payroll/generate", {
        periodStart,
        periodEnd,
      });
      // The response now carries who was LEFT OUT as well as who got a
      // payslip. Generate used to skip any worker whose status is not "active"
      // and say nothing at all, so a worker who turned up and weighed in leaf
      // could be missing from the pay run with no way to notice.
      const built = data?.payslips || [];
      const skipped = data?.skipped || [];
      setRows(built);
      setSkipped(skipped);
      const trendRes = await api.get("/payroll/trend", {
        params: { limit: 14 },
      });
      setTrend(trendRes.data);
      const worked = skipped.filter((s) => s.workedInPeriod);
      setNotice(
        `Pay run applied: ${built.length} draft payslip(s) built/refreshed from attendance. ` +
          `Rows already in Review/Approved/Paid were left untouched.` +
          (skipped.length
            ? ` ${skipped.length} worker(s) skipped${
                worked.length ? ` — ${worked.length} of them worked in this period.` : "."
              }`
            : ""),
      );
    } catch (err) {
      setError(apiError(err, "Could not apply the pay run."));
    } finally {
      setBusy(false);
    }
  };

  const act = async (row, path, fallback) => {
    setBusy(true);
    setError("");
    try {
      await api.post(`/payroll/${row.id}/${path}`);
      // Close the review drawer once the stage has actually moved, so it can
      // never sit open showing the previous status.
      setReviewRow(null);
      await load();
    } catch (err) {
      setError(apiError(err, fallback));
    } finally {
      setBusy(false);
    }
  };

  const openDed = (row) => {
    setEditRow(row);
    setDed({
      loanDeduction: row.loanDeduction ?? 0,
      advanceRecovery: row.advanceRecovery ?? 0,
      otherDeduction: row.otherDeduction ?? 0,
    });
    setDedErr("");
  };
  const saveDed = async (e) => {
    e.preventDefault();
    setSavingDed(true);
    setDedErr("");
    try {
      await api.put(`/payroll/${editRow.id}/deductions`, {
        // loanDeduction and advanceRecovery are derived server-side and
        // ignored by PUT /payroll/{id}/deductions. Not sent, so the request
        // says what it means.
        otherDeduction: Number(ded.otherDeduction) || 0,
      });
      setEditRow(null);
      await load();
    } catch (err) {
      setDedErr(apiError(err, "Could not save deductions."));
    } finally {
      setSavingDed(false);
    }
  };

  const openConfig = () => {
    setCfgDraft({ ...config });
    setCfgErr("");
    setCfgOpen(true);
  };
  const saveConfig = async (e) => {
    e.preventDefault();
    setSavingCfg(true);
    setCfgErr("");
    try {
      const { data } = await api.put("/payroll/config", {
        baseDailyWage: Number(cfgDraft.baseDailyWage) || 0,
        leafQuotaKg: Number(cfgDraft.leafQuotaKg) || 0,
        surplusRate: Number(cfgDraft.surplusRate) || 0,
        gradeBonusRate: Number(cfgDraft.gradeBonusRate) || 0,
        advanceCap: Number(cfgDraft.advanceCap) || 0,
        loanCap: Number(cfgDraft.loanCap) || 0,
        loanDailyDeduction: Number(cfgDraft.loanDailyDeduction) || 0,
      });
      setConfig(data);
      setCfgOpen(false);
    } catch (err) {
      setCfgErr(apiError(err, "Could not save the configuration."));
    } finally {
      setSavingCfg(false);
    }
  };

  const exportCsv = () => {
    const head = [
      "Worker ID",
      "Name",
      "Role",
      "Zone",
      "Present days",
      "Weight (kg)",
      "Base wage",
      "Incentives",
      "Deduction",
      "Net pay",
      "Status",
    ];
    const lines = filtered.map((r) => {
      const incent = Number(r.surplusAmount || 0) + Number(r.gradeBonus || 0);
      const ded =
        Number(r.loanDeduction || 0) +
        Number(r.advanceRecovery || 0) +
        Number(r.otherDeduction || 0);
      return [
        workerCode(r.workerId),
        r.workerName,
        ROLE_LABEL[r.jobRole] || "",
        r.zoneName || "",
        r.presentDays,
        Number(r.totalLeafKg || 0),
        r.baseAmount,
        incent,
        ded,
        r.netPayable,
        r.status,
      ]
        .map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`)
        .join(",");
    });
    const csv = [head.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payroll-${periodStart}_to_${periodEnd}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold text-cg-ink">
          Wage &amp; Payroll
        </h1>
        <p className="text-sm text-cg-ink/60">
          Managing compensation for {totals.workers} garden worker
          {totals.workers === 1 ? "" : "s"}
          {totals.zones.size
            ? ` across ${totals.zones.size} zone${totals.zones.size === 1 ? "" : "s"}`
            : ""}
          .
        </p>
      </div>

      {/* Sub-part tabs: payslips / withdrawals / SMS log */}
      <div className="flex flex-wrap gap-2 rounded-2xl bg-white p-2 shadow ring-1 ring-cg-green/10">
        {PAYROLL_TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                active
                  ? "bg-cg-dark text-white"
                  : "text-cg-ink/60 hover:bg-cg-lime hover:text-cg-ink"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* WHO WAS LEFT OUT. A worker skipped by the pay run while their own
          register says they turned up is unpaid work — the single failure this
          product exists to prevent. It gets its own panel, not a footnote. */}
      {skipped.some((s) => s.workedInPeriod) && (
        <div className="rounded-xl bg-amber-50 px-4 py-3 ring-1 ring-amber-200">
          <p className="flex items-center gap-2 text-sm font-bold text-amber-900">
            <LuTriangleAlert size={16} />
            {skipped.filter((s) => s.workedInPeriod).length} worker(s) worked
            this period but got no payslip
          </p>
          <ul className="mt-1.5 space-y-0.5 text-xs text-amber-800">
            {skipped
              .filter((s) => s.workedInPeriod)
              .map((s) => (
                <li key={s.workerId}>
                  <b>{s.workerName}</b> — {s.reason} Set their status to
                  &ldquo;active&rdquo; in Workforce and run the pay run again.
                </li>
              ))}
          </ul>
        </div>
      )}

      {notice && (
        <div className="rounded-lg bg-cg-lime px-4 py-2 text-sm text-cg-green">
          {notice}
        </div>
      )}
      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {tab === "payslips" && (
        <>
      {/* LEGACY BANNER. Read the note below before trusting the number.
          These rows were parked by the old monthly model when an advance had no
          editable payslip to land on. Daily settlement recovers an advance from
          the withdrawal row itself, so the SAME advances are already being
          worked off — the count here is history, not outstanding debt, and
          nothing writes new rows. It said "click Generate and they will be
          deducted automatically", which is now simply untrue. */}
      {pending && pending.count > 0 && (
        <div className="rounded-2xl bg-white p-4 ring-1 ring-cg-green/15">
          <p className="text-sm font-semibold text-cg-ink/80">
            {pending.count} legacy advance{pending.count === 1 ? "" : "s"} worth{" "}
            {taka(pending.total)} from the old monthly model
          </p>
          <p className="mt-1 text-sm text-cg-ink/60">
            Not outstanding. These were parked when an advance had no editable
            payslip to land on. Advances are now recovered daily from the
            withdrawal itself, so these same amounts are already being worked
            off — do not deduct them a second time.
          </p>
          <ul className="mt-2 space-y-0.5 text-xs text-cg-ink/55">
            {pending.items.slice(0, 5).map((it) => (
              <li key={it.id}>
                {it.workerName} — {taka(it.amount)}
                {it.note ? " · " + it.note : ""}
              </li>
            ))}
            {pending.items.length > 5 && (
              <li>and {pending.items.length - 5} more</li>
            )}
          </ul>
        </div>
      )}

      {/* THE REGISTER MOVED AFTER THESE WERE BUILT.
          Surfaced at the top rather than only as row badges, because the whole
          point is that nobody was looking. Regenerating is safe: a payslip is a
          statement, it holds up no money, and generate() no longer freezes. */}
      {staleRows.length > 0 && (
        <div className="rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
          <p className="text-sm font-semibold text-amber-900">
            {staleRows.length} payslip{staleRows.length === 1 ? " is" : "s are"} out of
            date — the register changed after {staleRows.length === 1 ? "it was" : "they were"} generated
          </p>
          <ul className="mt-2 space-y-0.5 text-xs text-amber-800">
            {staleRows.slice(0, 6).map((r) => (
              <li key={r.id}>
                <span className="font-semibold">{r.workerName}</span>
                {r.staleReason ? " — " + r.staleReason : ""}
                {r.status === "paid" && (
                  <span className="ml-1 font-bold">
                    (already closed — the figures on record are wrong)
                  </span>
                )}
              </li>
            ))}
            {staleRows.length > 6 && <li>and {staleRows.length - 6} more</li>}
          </ul>
          {isAdmin && (
            <button
              onClick={generate}
              className={`${BTN_DARK} mt-3`}
              disabled={busy}
            >
              <LuPlay size={16} /> Rebuild these payslips
            </button>
          )}
        </div>
      )}

      {/* ===================================================================
          DAILY SETTLEMENT — the thing that actually moves money now.
          ===================================================================
          It runs on a schedule at 00:30. This card exists because a schedule
          you cannot see is a schedule you cannot trust, and because a demo,
          a restarted server or a missed night must not leave a worker's loan
          frozen until tomorrow. */}
      <div className="rounded-2xl bg-white p-5 shadow ring-1 ring-cg-green/10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="font-bold text-cg-ink">Daily settlement</h2>
            <InfoTip text="Wages are settled per day, not per payslip. Settlement records each completed day and moves the loan and advance balances. Today is never settled — leaf can still be weighed in. Running it twice is harmless." />
          </div>
          {isAdmin && (
            <button
              onClick={runSettlement}
              className={BTN_DARK}
              disabled={settling}
            >
              <LuPlay size={16} />{" "}
              {settling ? "Settling…" : "Run settlement now"}
            </button>
          )}
        </div>

        {settlement ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <RateField
              label="Last closed day"
              value={settlement.lastClosedDay || "—"}
              unit=""
            />
            <RateField
              label="Workers settled for it"
              value={`${settlement.settledYesterday ?? 0} / ${
                settlement.activeWorkers ?? 0
              }`}
              unit=""
            />
            <RateField
              label="Workers behind"
              value={String(settlement.workersBehind ?? 0)}
              unit=""
            />
          </div>
        ) : (
          <p className="mt-3 text-sm text-cg-ink/50">
            Settlement status unavailable.
          </p>
        )}

        {/* A worker who is behind is a worker whose loan is not being repaid
            and whose screen still says "will be deducted". Not a warning to
            bury in a log. */}
        {settlement && Number(settlement.workersBehind) > 0 && (
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
            {settlement.workersBehind} worker
            {Number(settlement.workersBehind) === 1 ? " is" : "s are"} not
            settled up to {settlement.lastClosedDay}. Their loan and advance
            balances have not moved for those days.
          </p>
        )}

        {settleNote && (
          <p className="mt-3 rounded-xl bg-cg-lime/25 px-3 py-2 text-sm text-cg-ink/75">
            {settleNote}
          </p>
        )}
      </div>

      {/* Today's Operating Rates */}
      <div className="rounded-2xl bg-white p-5 shadow ring-1 ring-cg-green/10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="font-bold text-cg-ink">Today's Operating Rates</h2>
            <InfoTip text="The pay rules currently in force. 'Apply to Pay Run' feeds these numbers into every worker's wage. Editing them starts a new rate period from today." />
            {config?.effectiveFrom && (
              <span className="inline-flex items-center gap-1 rounded-full bg-cg-lime/60 px-2.5 py-0.5 text-xs text-cg-ink/70">
                <LuCalendarDays size={12} /> Rate last changed:{" "}
                {config.effectiveFrom}
              </span>
            )}
          </div>
          {isAdmin && (
            <div className="flex items-center gap-2">
              <button
                onClick={openConfig}
                className={BTN_GHOST}
                disabled={busy || !config}
              >
                <LuSettings size={16} /> Edit rates
              </button>
              <button onClick={generate} className={BTN_DARK} disabled={busy}>
                <LuPlay size={16} /> Apply to Pay Run
              </button>
            </div>
          )}
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <RateField
            label="Base Wage"
            value={config ? taka(config.baseDailyWage) : "—"}
            unit="/ day"
            info="The guaranteed daily wage for a full present day, before any leaf incentive or deduction."
          />
          <RateField
            label="Surplus Rate"
            value={config ? taka(config.surplusRate) : "—"}
            unit="/ kg"
            info="Extra pay per kg of leaf plucked above the daily quota. Rewards high pickers. Activates with the Leaf Collection module."
          />
          <RateField
            label="Grade-A Bonus"
            value={config ? taka(config.gradeBonusRate) : "—"}
            unit="/ kg"
            info="Additional pay per kg for premium, top-grade leaf. Activates with the Leaf Collection module."
          />
          <RateField
            label="Leaf Quota"
            value={config ? Number(config.leafQuotaKg) : "—"}
            unit="kg / day"
            info="The daily leaf target in kg. Only leaf plucked above this quota earns the surplus rate."
          />
          {/* Borrowing limits (V32). Shown on the same strip as the wage rates
              because they are the same kind of thing — one row per estate,
              latest effective_from wins, every change on the same audit trail.
              All three are edited through "Edit rates" above. */}
          <RateField
            label="Advance Limit"
            value={config ? taka(config.advanceCap) : "—"}
            unit="max owed"
            info="The most a worker may owe in advances at once. An advance is money against days not yet worked, and is recovered by withholding ALL of their daily earnings until it clears — so this is also roughly how many days they will be paid nothing."
          />
          <RateField
            label="Loan Limit"
            value={config ? taka(config.loanCap) : "—"}
            unit="max owed"
            info="The most a worker may owe in loans at once. Enforced when a worker files a request; an unpaid loan already blocks a new one separately."
          />
          <RateField
            label="Loan Recovery"
            value={config ? taka(config.loanDailyDeduction) : "—"}
            unit="/ working day"
            info="Taken from each day's earnings toward a loan, BEFORE any advance recovery. The worker keeps whatever is left, so a loan never leaves them with nothing. A day they do not work deducts nothing."
          />
        </div>
      </div>

      {/* Approval workflow stepper (full width) */}
      <div className="rounded-2xl bg-white p-5 shadow ring-1 ring-cg-green/10">
        <div className="mb-5 flex items-center gap-2">
          <h2 className="font-bold text-cg-ink">Approval workflow</h2>
          <InfoTip text="Every payslip moves left to right: Draft → Review → Approved → Paid. Advance each one with the row actions in the table below. The number under each stage is how many payslips sit there right now." />
        </div>
        <div className="flex items-start">
          {STAGES.map((s, i) => {
            const m = STATUS_META[s];
            const Icon = m.icon;
            return (
              <Fragment key={s}>
                <div className="flex w-24 flex-col items-center gap-1 text-center">
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-cg-lime text-cg-green">
                    <Icon size={18} />
                  </span>
                  <span className="flex items-center gap-1 text-sm font-semibold text-cg-ink">
                    {m.label}
                    <InfoTip text={m.desc} />
                  </span>
                  <span className="text-xs text-cg-ink/50">
                    {totals[s] || 0} payslip(s)
                  </span>
                </div>
                {i < STAGES.length - 1 && (
                  <div className="mt-5 h-0.5 flex-1 rounded bg-cg-green/20" />
                )}
              </Fragment>
            );
          })}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={LuWallet}
          label="Total Payroll"
          value={taka(totals.gross)}
          sub={`${totals.workers} worker(s) in cycle`}
          info="Gross wages for everyone in this cycle, before deductions."
        />
        <StatCard
          icon={LuBanknote}
          label="Paid"
          value={taka(totals.paidNet)}
          sub={`${paidPct}% complete`}
          info="Net pay already disbursed (payslips marked Paid), and the share of the workforce that covers."
        />
        <StatCard
          icon={LuUsers}
          label="Avg Worker Wage"
          value={taka(avgWage)}
          sub="Base + incentives"
          info="Average gross wage per worker this cycle (total payroll ÷ number of workers)."
        />
        <StatCard
          icon={LuScale}
          label="Deduction"
          value={taka(totals.deductions)}
          sub="Loan &amp; advance recoveries"
          info="Total loan repayments, advance recoveries and other amounts withheld this cycle."
        />
      </div>

      {/* Net Pay Trend */}
      <div className="rounded-2xl bg-white p-5 shadow ring-1 ring-cg-green/10">
        <div className="flex items-center gap-2">
          <h2 className="font-bold text-cg-ink">
            Net Pay Trend (Last {trendData.length || 0} Periods)
          </h2>
          <InfoTip text="Total net pay (after deductions) paid to all workers in each completed period. Use it to spot payroll spikes or drops over time." />
        </div>
        <p className="text-xs text-cg-green">
          Total net pay (after deductions) paid to all workers in each period.
        </p>
        <div className="mt-4">
          {trendData.length === 0 ? (
            <div className="grid h-[260px] place-items-center text-sm text-cg-ink/50">
              No payroll history yet — apply a pay run to start the trend.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="netpay" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={GREEN} stopOpacity={0.45} />
                    <stop offset="95%" stopColor={GREEN} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5efe0" />
                <XAxis dataKey="label" fontSize={12} />
                <YAxis
                  fontSize={12}
                  tickFormatter={(v) => taka(v)}
                  width={70}
                />
                <Tooltip formatter={(v) => [taka(v), "Net pay"]} />
                <Area
                  type="monotone"
                  dataKey="net"
                  stroke={GREEN}
                  fill="url(#netpay)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
        {trendStats && (
          <div className="mt-4 grid gap-3 rounded-xl bg-cg-lime/30 p-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex items-center gap-2">
              <LuTrendingUp className="text-cg-green" size={18} />
              <div>
                <p className="text-xs text-cg-ink/50">
                  Highest ({trendStats.high.label})
                </p>
                <p className="font-bold text-cg-ink">
                  {taka(trendStats.high.net)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <LuTrendingDown className="text-red-500" size={18} />
              <div>
                <p className="text-xs text-cg-ink/50">
                  Lowest ({trendStats.low.label})
                </p>
                <p className="font-bold text-cg-ink">
                  {taka(trendStats.low.net)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <LuActivity className="text-sky-500" size={18} />
              <div>
                <p className="text-xs text-cg-ink/50">Average / period</p>
                <p className="font-bold text-cg-ink">{taka(trendStats.avg)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <LuCalendarDays className="text-purple-500" size={18} />
              <div>
                <p className="text-xs text-cg-ink/50">
                  Total ({trendData.length} periods)
                </p>
                <p className="font-bold text-cg-ink">
                  {taka(trendStats.total)}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* AI anomaly flags — live. Run it before approving a payroll run. */}
      <AnomalyPanel
        scope="payroll"
        title="AI anomaly flags — payroll"
      />

      {/* Payroll details table */}
      <div className="overflow-hidden rounded-2xl bg-white shadow ring-1 ring-cg-green/10">
        <div className="flex flex-wrap items-center justify-between gap-3 bg-[#C0F28B] px-4 py-3">
          <div className="flex items-center gap-2 font-bold text-cg-ink">
            <LuClipboardList size={18} /> Payroll details — {periodStart} to{" "}
            {periodEnd}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1 text-xs font-semibold text-cg-ink/70">
              From
              <input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                className="rounded-lg border border-cg-green/30 bg-white px-2 py-1 text-sm outline-none"
              />
            </label>
            <label className="flex items-center gap-1 text-xs font-semibold text-cg-ink/70">
              To
              <input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                className="rounded-lg border border-cg-green/30 bg-white px-2 py-1 text-sm outline-none"
              />
            </label>
            {/* SEARCH BY NAME. The table shows 8 rows a page with no way to
                look one person up, so "is Abdul's payslip here?" meant paging
                through the estate. A missing worker and a worker on page 3 look
                identical without this. */}
            <input
              value={nameQuery}
              onChange={(e) => {
                setNameQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Find a worker…"
              aria-label="Find a worker by name"
              className="rounded-lg border border-cg-green/30 bg-white px-3 py-1 text-sm text-cg-ink outline-none focus:border-cg-green"
            />
            <span className="flex items-center gap-1 text-xs font-semibold text-cg-ink/70">
              <LuFilter size={14} /> Status
            </span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-cg-green/30 bg-white px-2 py-1 text-sm outline-none"
            >
              <option value="all">All</option>
              <option value="draft">Draft</option>
              <option value="review">Review</option>
              <option value="approved">Approved</option>
              <option value="paid">Paid</option>
            </select>
            <button
              onClick={load}
              className={BTN_GHOST}
              disabled={loading || busy}
            >
              <LuRefreshCw size={16} /> Refresh
            </button>
            <button onClick={exportCsv} className={BTN_GHOST}>
              <LuDownload size={16} /> Export
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-cg-ink/50">
              <tr>
                <th className="px-4 py-3">Worker ID</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3 text-right">Present</th>
                <th className="px-4 py-3 text-right">Weight (kg)</th>
                <th className="px-4 py-3 text-right">Base Wage</th>
                <th className="px-4 py-3 text-right">Incentives</th>
                <th className="px-4 py-3 text-right">Deduction</th>
                <th className="px-4 py-3 text-right">Net Pay</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cg-green/10">
              {loading ? (
                <tr>
                  <td
                    colSpan={10}
                    className="px-4 py-10 text-center text-cg-ink/50"
                  >
                    Loading…
                  </td>
                </tr>
              ) : pageRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={10}
                    className="px-4 py-10 text-center text-cg-ink/50"
                  >
                    No payslips for this period yet.
                    {isAdmin
                      ? " Click Apply to Pay Run to build drafts from attendance."
                      : ""}
                  </td>
                </tr>
              ) : (
                pageRows.map((r) => {
                  const incent =
                    Number(r.surplusAmount || 0) + Number(r.gradeBonus || 0);
                  const deductions =
                    Number(r.loanDeduction || 0) +
                    Number(r.advanceRecovery || 0) +
                    Number(r.otherDeduction || 0);
                  const editable =
                    r.status === "draft" || r.status === "review";
                  return (
                    <tr
                      key={r.id}
                      className={
                        r.stale ? "bg-amber-50/70 hover:bg-amber-50" : "hover:bg-cg-lime/20"
                      }
                    >
                      <td className="px-4 py-3 font-mono text-xs text-cg-ink/70">
                        {workerCode(r.workerId)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-semibold text-cg-ink">
                            {r.workerName}
                          </span>
                          {/* WHOSE DATA MOVED, ON THE ROW ITSELF.
                              A supervisor amends a weigh-in and this payslip is
                              instantly out of date, but nothing on the page said
                              so — the admin was reading a figure the register no
                              longer agreed with and had no way to tell. */}
                          {r.stale && (
                            <span
                              title={r.staleReason || "The register changed after this was generated."}
                              className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900 ring-1 ring-amber-300"
                            >
                              <LuTriangleAlert size={10} /> Out of date
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-cg-ink/50">
                          {ROLE_LABEL[r.jobRole] || "—"}
                          {r.zoneName ? " • " + r.zoneName : ""}
                        </div>
                        {r.stale && (
                          <div className="mt-0.5 text-[11px] text-amber-800">
                            {r.staleReason}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">{r.presentDays}</td>
                      <td className="px-4 py-3 text-right">
                        {Number(r.totalLeafKg) > 0 ? (
                          Number(r.totalLeafKg).toFixed(2)
                        ) : (
                          <span className="text-cg-ink/40">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {taka(r.baseAmount)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-cg-green">
                        {incent ? "+" + taka(incent) : "+৳0"}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-red-600">
                        {deductions ? "−" + taka(deductions) : "−৳0"}
                      </td>
                      <td className="px-4 py-3 text-right font-extrabold text-cg-ink">
                        {taka(r.netPayable)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill status={r.status} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => setPrintRows([r])}
                            title="Payslip PDF"
                            className="grid h-8 w-8 place-items-center rounded-lg text-cg-ink/60 hover:bg-cg-lime hover:text-cg-green"
                          >
                            <LuDownload size={15} />
                          </button>
                          {isAdmin && editable && (
                            <button
                              onClick={() => openDed(r)}
                              title="Edit deductions"
                              className="grid h-8 w-8 place-items-center rounded-lg text-cg-ink/60 hover:bg-cg-lime hover:text-cg-green"
                            >
                              <LuPencil size={15} />
                            </button>
                          )}
                          {/* REVIEW OPENS THE EVIDENCE. It used to post the
                              transition straight away, so "review" moved a
                              payslip toward payment without showing anything to
                              review. The drawer carries the Submit button. */}
                          {isAdmin && r.status === "draft" && (
                            <button
                              onClick={() => setReviewRow(r)}
                              className={BTN_DARK}
                              disabled={busy}
                            >
                              Review
                            </button>
                          )}
                          {isAdmin && r.status === "review" && (
                            <button
                              onClick={() => setReviewRow(r)}
                              className={BTN_DARK}
                              disabled={busy}
                            >
                              <LuCheck size={15} /> Approve
                            </button>
                          )}
                          {isAdmin && r.status === "approved" && (
                            <button
                              onClick={() =>
                                act(r, "pay", "Could not mark paid.")
                              }
                              className={BTN_DARK}
                              disabled={busy}
                            >
                              <LuBanknote size={15} /> Pay
                            </button>
                          )}
                          {r.status === "paid" && (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-600">
                              <LuCheckCheck size={15} /> Paid
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 bg-[#D3FFAC] px-4 py-2 text-sm text-cg-ink/70">
          <span>
            {(nameQuery || statusFilter !== "all") && rows.length !== filtered.length ? (
              <span className="mr-2 rounded bg-amber-100 px-2 py-0.5 text-amber-800">
                filtered from {rows.length}
              </span>
            ) : null}
            Showing {filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–
            {Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} •
            Net{" "}
            {taka(filtered.reduce((s, r) => s + Number(r.netPayable || 0), 0))}
          </span>
          {pageCount > 1 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded px-2 py-1 disabled:opacity-40"
              >
                Prev
              </button>
              <span>
                {page} / {pageCount}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                disabled={page >= pageCount}
                className="rounded px-2 py-1 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
        </>
      )}

      {tab === "withdrawals" && <WithdrawalsPanel />}
      {tab === "sms" && <SmsLogPanel />}

      {/* v10: payslip PDF. Browser print -> "Save as PDF" beats bundling a
          PDF library: no dependency, smaller file, selectable text. */}
      <PayslipReviewDrawer
        row={reviewRow}
        busy={busy}
        onClose={() => setReviewRow(null)}
        onAdvance={act}
      />

      {printRows && (
        <PayslipDocument
          rows={printRows}
          config={config}
          onClose={() => setPrintRows(null)}
        />
      )}

      {/* Deductions modal */}
      {editRow &&
        createPortal(
          <div
            className="fixed inset-0 z-[80] grid place-items-center bg-black/40 p-4"
            onClick={() => setEditRow(null)}
          >
            <form
              onClick={(e) => e.stopPropagation()}
              onSubmit={saveDed}
              className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
            >
              <ModalHeader
                title="Deductions"
                subtitle={`${editRow.workerName} · Gross ${taka(editRow.grossAmount)}`}
                onClose={() => setEditRow(null)}
              />
              <div className="p-6">
                <p className="text-xs text-cg-ink/50">
                  Net pay updates automatically when you save.
                </p>
                {dedErr && (
                  <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                    {dedErr}
                  </div>
                )}
                {/* LOAN AND ADVANCE ARE NO LONGER TYPED IN.
                    They are the sum of what daily settlement actually took, so
                    a hand-typed value would be silently overwritten by the next
                    Apply to Pay Run. An input that looks editable, saves without
                    complaint and then reverts is worse than no input at all —
                    so they are shown as read-only figures with their source. */}
                <div className="mt-4 space-y-3">
                  <div className="rounded-xl bg-cg-lime/20 p-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-semibold text-cg-ink/70">
                        Loan repayment
                      </span>
                      <span className="font-bold tabular-nums text-cg-ink">
                        {taka(ded.loanDeduction)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-sm">
                      <span className="font-semibold text-cg-ink/70">
                        Advance recovery
                      </span>
                      <span className="font-bold tabular-nums text-cg-ink">
                        {taka(ded.advanceRecovery)}
                      </span>
                    </div>
                    <p className="mt-2 text-[11px] leading-relaxed text-cg-ink/55">
                      Totalled from daily settlement — these are what was
                      actually deducted, day by day. To change them, correct the
                      attendance or leaf record and run settlement again.
                    </p>
                  </div>

                  <label className="block text-sm font-semibold text-cg-ink/70">
                    Other deduction (৳)
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={ded.otherDeduction}
                      onChange={(e) =>
                        setDed((d) => ({ ...d, otherDeduction: e.target.value }))
                      }
                      className={FIELD}
                    />
                  </label>
                </div>
              </div>
              <div className="flex justify-end gap-2 border-t border-cg-green/10 px-6 py-4">
                <button
                  type="button"
                  onClick={() => setEditRow(null)}
                  className={BTN_GHOST}
                >
                  Cancel
                </button>
                <button type="submit" className={BTN_DARK} disabled={savingDed}>
                  {savingDed ? "Saving…" : "Save deductions"}
                </button>
              </div>
            </form>
          </div>,
          document.body,
        )}

      {/* Config modal */}
      {cfgOpen &&
        cfgDraft &&
        createPortal(
          <div
            className="fixed inset-0 z-[80] grid place-items-center bg-black/40 p-4"
            onClick={() => setCfgOpen(false)}
          >
            {/* max-w-2xl and a two-column body: seven stacked fields made this
                dialog taller than the viewport, so Save could not be reached.
                max-h with flex-col keeps the header and footer fixed and lets
                only the field list scroll, instead of the whole dialog growing
                past the screen. */}
            <form
              onClick={(e) => e.stopPropagation()}
              onSubmit={saveConfig}
              className="flex max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            >
              <ModalHeader
                title="Edit Operating Rates"
                subtitle="Set the pay rules used to calculate every wage"
                onClose={() => setCfgOpen(false)}
              />
              <div className="min-h-0 flex-1 overflow-y-auto p-6">
                <p className="text-xs text-cg-ink/50">
                  Saving starts a new rate period from today. Base wage is the
                  fallback; each worker's own daily wage is used when set.
                </p>
                {cfgErr && (
                  <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                    {cfgErr}
                  </div>
                )}
                <div className="mt-4 grid gap-x-5 gap-y-3 sm:grid-cols-2">
                  {[
                    ["baseDailyWage", "Base daily wage (৳)"],
                    ["leafQuotaKg", "Leaf quota (kg / day)"],
                    ["surplusRate", "Surplus rate (৳ / kg over quota)"],
                    ["gradeBonusRate", "Grade-A bonus (৳ / kg)"],
                    [
                      "advanceCap",
                      "Advance limit (৳)",
                      "Most a worker may owe in advances at once. An advance is recovered by withholding ALL of their daily earnings until it clears, so this is also roughly how many days they will be paid nothing.",
                    ],
                    [
                      "loanCap",
                      "Loan limit (৳)",
                      "Most a worker may owe in loans at once.",
                    ],
                    [
                      "loanDailyDeduction",
                      "Loan recovery (৳ / working day)",
                      "Taken from each day's earnings toward a loan, before any advance recovery. The worker keeps the remainder, so a loan never leaves them with nothing.",
                    ],
                  ].map(([key, label, info]) => (
                    <label
                      key={key}
                      className="block text-sm font-semibold text-cg-ink/70"
                    >
                      {label}
                      {/* These three change what a worker may borrow from the
                          next request onward. Lowering one never claws back an
                          advance already taken, and nothing here recomputes an
                          existing payslip. */}
                      {info && (
                        <span className="mt-0.5 block text-xs font-normal text-cg-ink/45">
                          {info}
                        </span>
                      )}
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={cfgDraft[key] ?? ""}
                        onChange={(e) =>
                          setCfgDraft((c) => ({ ...c, [key]: e.target.value }))
                        }
                        className={FIELD}
                      />
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex shrink-0 justify-end gap-2 border-t border-cg-green/10 px-6 py-4">
                <button
                  type="button"
                  onClick={() => setCfgOpen(false)}
                  className={BTN_GHOST}
                >
                  Cancel
                </button>
                <button type="submit" className={BTN_DARK} disabled={savingCfg}>
                  {savingCfg ? "Saving…" : "Save rates"}
                </button>
              </div>
            </form>
          </div>,
          document.body,
        )}
    </div>
  );
}
