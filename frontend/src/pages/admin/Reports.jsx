import { Fragment, useCallback, useEffect, useState } from "react";
import {
  ResponsiveContainer,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Line,
  ComposedChart,
} from "recharts";
import {
  LuBanknote,
  LuReceipt,
  LuTrendingUp,
  LuWallet,
  LuCalendarCheck,
  LuUsers,
  LuFileText,
  LuPlus,
  LuCheckCheck,
  LuTrash2,
  LuChevronDown,
  LuChevronRight,
  LuDownload,
} from "react-icons/lu";
import api from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { BTN_DARK, BTN_GHOST } from "../../lib/ui";
import { apiError } from "../../lib/apiError";
import InfoTip from "../../components/admin/InfoTip";
import ReportDocument from "../../components/admin/ReportDocument";
import { isoDate } from "../../lib/localDate";

// Estate money is in Bangladeshi Taka (\u09f3).
function taka(n) {
  return (
    "\u09f3" +
    Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })
  );
}

function takaCompact(n) {
  const v = Number(n || 0);
  const abs = Math.abs(v);
  if (abs >= 1e7) return "\u09f3" + (v / 1e7).toFixed(2) + " Cr";
  if (abs >= 1e5) return "\u09f3" + (v / 1e5).toFixed(2) + " L";
  return "\u09f3" + v.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function titleCase(s) {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

// apiError lives in src/lib/apiError.js -- this file used to carry a private
// copy that missed 429 throttling and the Bean Validation {error, fields}
// shape. Import it; do not reintroduce a local one.

// First + last day of the current month as ISO strings, for the default period.
function monthDefaults() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const iso = isoDate;
  return { start: iso(start), end: iso(end) };
}

function StatCard({ icon: Icon, label, value, sub, tone = "default", info }) {
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
      {sub ? <p className="mt-1 text-xs text-cg-ink/50">{sub}</p> : null}
    </div>
  );
}

function StatusPill({ status }) {
  const finalized = status === "FINALIZED";
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-cg-ink/80">
      <span
        className={`h-2 w-2 rounded-full ${finalized ? "bg-emerald-500" : "bg-amber-500"}`}
      />
      {finalized ? "Finalized" : "Draft"}
    </span>
  );
}

export default function Reports() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const def = monthDefaults();
  const [periodStart, setPeriodStart] = useState(def.start);
  const [periodEnd, setPeriodEnd] = useState(def.end);

  const [summary, setSummary] = useState(null);
  const [trend, setTrend] = useState([]);
  const [reports, setReports] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [lang, setLang] = useState("en");
  const [error, setError] = useState("");
  // Export preview: { report } for a saved row, or {} for the current period.
  const [exporting, setExporting] = useState(null);
  // Two-step delete, so a saved report is never lost to a single stray click.
  const [confirmDelete, setConfirmDelete] = useState(null);

  // periodStart must not be after periodEnd. The backend would otherwise return
  // an empty summary with no explanation of why.
  const rangeError =
    periodStart && periodEnd && periodStart > periodEnd
      ? "The From date is after the To date."
      : "";

  const loadSummary = useCallback(async () => {
    const { data } = await api.get("/reports/summary", {
      params: { periodStart, periodEnd },
    });
    setSummary(data);
  }, [periodStart, periodEnd]);

  const loadStatic = useCallback(async () => {
    const [t, r] = await Promise.all([
      api.get("/reports/trend", { params: { months: 6 } }),
      api.get("/reports/saved"),
    ]);
    setTrend(t.data);
    setReports(r.data);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    Promise.all([loadSummary(), loadStatic()])
      .catch((err) =>
        setError(
          apiError(
            err,
            "Could not load reports. Make sure the backend is running and you're signed in as admin or supervisor.",
          ),
        ),
      )
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply reloads the trend as well as the summary -- the chart is period-
  // independent today, but refreshing both keeps the page from showing figures
  // and a chart that were fetched at different times.
  const applyPeriod = (e) => {
    e.preventDefault();
    if (rangeError) {
      setError(rangeError);
      return;
    }
    setError("");
    Promise.all([loadSummary(), loadStatic()]).catch((err) =>
      setError(apiError(err, "Could not load the summary for that period.")),
    );
  };

  const generate = async () => {
    if (rangeError) {
      setError(rangeError);
      return;
    }
    setGenerating(true);
    setError("");
    try {
      await api.post("/reports/generate", { periodStart, periodEnd, language: lang });
      // Reload the KPI cards and the trend too, not just the saved list --
      // generating changes what the period looks like.
      await Promise.all([loadSummary(), loadStatic()]);
    } catch (err) {
      setError(apiError(err, "Could not generate the report. Try again."));
    } finally {
      setGenerating(false);
    }
  };

  const finalize = async (id) => {
    try {
      await api.post(`/reports/${id}/finalize`);
      await loadStatic();
    } catch (err) {
      setError(apiError(err, "Could not finalize that report."));
    }
  };

  const remove = async (id) => {
    try {
      await api.delete(`/reports/${id}`);
      setConfirmDelete(null);
      await loadStatic();
    } catch (err) {
      setError(apiError(err, "Could not delete that report."));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header + period picker */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-cg-ink">
            Reports &amp; Analytics
          </h1>
          <p className="text-sm text-cg-ink/60">
            Estate-wide performance for a period, plus saved monthly report
            snapshots you can revisit anytime.
          </p>
        </div>
        <form onSubmit={applyPeriod} className="flex flex-wrap items-end gap-2">
          <label className="text-xs font-semibold text-cg-ink/60">
            From
            <input
              type="date"
              className="mt-1 block rounded-lg border border-cg-green/30 bg-white px-3 py-2 text-sm outline-none focus:border-cg-green"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
            />
          </label>
          <label className="text-xs font-semibold text-cg-ink/60">
            To
            <input
              type="date"
              className="mt-1 block rounded-lg border border-cg-green/30 bg-white px-3 py-2 text-sm outline-none focus:border-cg-green"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
            />
          </label>
          <button type="submit" className={BTN_GHOST} disabled={!!rangeError}>
            Apply
          </button>
          <button
            type="button"
            className={BTN_GHOST}
            onClick={() => setExporting({})}
            disabled={!summary || !!rangeError}
            title={
              summary
                ? "Preview and save this period as a PDF"
                : "Load a period first"
            }
          >
            <LuDownload size={16} /> Export
          </button>
          {isAdmin ? (
            <div className="flex overflow-hidden rounded-lg border border-cg-green/30 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setLang("en")}
                className={`px-3 py-2 ${lang === "en" ? "bg-cg-green text-white" : "bg-white text-cg-ink/70"}`}
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => setLang("bn")}
                className={`px-3 py-2 ${lang === "bn" ? "bg-cg-green text-white" : "bg-white text-cg-ink/70"}`}
              >
                বাংলা
              </button>
            </div>
          ) : null}
          {isAdmin ? (
            <button
              type="button"
              className={BTN_DARK}
              onClick={generate}
              disabled={generating || !!rangeError}
            >
              <LuPlus size={16} />{" "}
              {generating ? "Generating\u2026" : "Generate report"}
            </button>
          ) : null}
        </form>
      </div>

      {rangeError && (
        <div className="rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-800 ring-1 ring-amber-200">
          {rangeError} Pick a From date on or before the To date.
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          icon={LuBanknote}
          label="Revenue"
          value={takaCompact(summary?.revenue)}
          sub="Selected period"
          info="Revenue ledger entries with a date inside the selected period."
        />
        <StatCard
          icon={LuReceipt}
          label="Expenses"
          value={takaCompact(summary?.expense)}
          sub="Expenses + payroll"
          info="Expense and payroll ledger entries inside the selected period."
        />
        <StatCard
          icon={LuTrendingUp}
          label="Net Profit"
          value={takaCompact(summary?.netProfit)}
          sub={
            summary
              ? `Margin ${Number(summary.profitMargin).toFixed(1)}%`
              : "Margin \u2014"
          }
          info="Revenue minus expenses and payroll for the period."
        />
        <StatCard
          icon={LuWallet}
          label="Payroll Cost"
          value={takaCompact(summary?.payrollCost)}
          sub="Wages in period"
          info="Payroll ledger entries inside the selected period."
        />
        <StatCard
          icon={LuCalendarCheck}
          label="Attendance Rate"
          value={
            summary ? `${Number(summary.attendanceRate).toFixed(1)}%` : "\u2014"
          }
          sub="Present marks / total"
          info="Share of attendance marks recorded as present during the period."
        />
        <StatCard
          icon={LuUsers}
          label="Active Workers"
          value={summary ? summary.activeWorkers : "\u2014"}
          sub="Current headcount"
          info="Workers whose status is currently active."
        />
      </div>

      {/* Loans strip */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex items-center justify-between rounded-2xl bg-white p-4 shadow ring-1 ring-cg-green/10">
          <span className="text-sm text-cg-ink/70">Loans outstanding</span>
          <span className="text-lg font-extrabold text-cg-ink">
            {takaCompact(summary?.loanOutstanding)}
          </span>
        </div>
        <div className="flex items-center justify-between rounded-2xl bg-white p-4 shadow ring-1 ring-cg-green/10">
          <span className="text-sm text-cg-ink/70">Loans recovered</span>
          <span className="text-lg font-extrabold text-cg-green">
            {takaCompact(summary?.loanRecovered)}
          </span>
        </div>
      </div>

      {/* AI auto-reports (live) */}
      <div className="flex items-start gap-3 rounded-2xl border border-cg-green/30 bg-white p-4">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-cg-lime text-cg-green">
          🤖
        </span>
        <div className="text-sm text-cg-ink/70">
          <span className="font-semibold text-cg-ink">
            AI smart auto-reports.
          </span>{" "}
          Click <span className="font-semibold">Generate report</span> to turn the
          figures above into a polished, compliance-ready narrative in{" "}
          {lang === "bn" ? "Bangla" : "English"} (toggle EN/বাংলা above). Open any
          saved report below to read its AI narrative. If the AI service is
          offline, a templated summary is used automatically.
        </div>
      </div>

      {/* Trend chart */}
      <div className="rounded-2xl bg-white p-5 shadow ring-1 ring-cg-green/10">
        <div className="mb-4 flex items-center gap-2">
          <h2 className="font-bold text-cg-ink">
            Revenue, Expense &amp; Profit — last 6 months
          </h2>
          <InfoTip text="Monthly revenue and expense bars with the profit line overlaid, from the finance ledger." />
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={trend} barGap={6}>
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
                dataKey="expense"
                name="Expense"
                fill="#95c260"
                radius={[4, 4, 0, 0]}
              />
              <Line
                type="monotone"
                dataKey="profit"
                name="Profit"
                stroke="#e11d48"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Generated reports table */}
      <div className="overflow-hidden rounded-2xl bg-white shadow ring-1 ring-cg-green/10">
        <div className="flex flex-wrap items-center justify-between gap-3 bg-[#C0F28B] px-4 py-3">
          <div className="flex items-center gap-2 font-bold text-cg-ink">
            <LuFileText size={18} /> Generated Reports
          </div>
          <span className="text-xs font-semibold text-cg-ink/70">
            {reports.length} saved
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-cg-ink/60">
              <tr>
                <th className="bg-[#D3FFAC] px-5 py-3">Report</th>
                <th className="bg-[#D3FFAC] px-5 py-3">Period</th>
                <th className="bg-[#D3FFAC] px-5 py-3 text-right">Revenue</th>
                <th className="bg-[#D3FFAC] px-5 py-3 text-right">
                  Net Profit
                </th>
                <th className="bg-[#D3FFAC] px-5 py-3">Status</th>
                <th className="bg-[#D3FFAC] px-5 py-3 text-right">Actions</th>
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
              ) : reports.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="bg-white px-5 py-10 text-center text-cg-ink/50"
                  >
                    No reports yet. {isAdmin ? "Generate one above." : ""}
                  </td>
                </tr>
              ) : (
                reports.map((r) => {
                  const open = openId === r.id;
                  return (
                    <Fragment key={r.id}>
                      <tr className="hover:bg-cg-lime/20">
                        <td className="px-5 py-3">
                          <button
                            type="button"
                            onClick={() => setOpenId(open ? null : r.id)}
                            className="flex items-center gap-1.5 text-left font-medium text-cg-ink"
                          >
                            {open ? (
                              <LuChevronDown size={15} />
                            ) : (
                              <LuChevronRight size={15} />
                            )}
                            {r.title}
                          </button>
                        </td>
                        <td className="px-5 py-3 text-cg-ink/70">
                          {r.periodStart} → {r.periodEnd}
                        </td>
                        <td className="px-5 py-3 text-right text-cg-ink">
                          {taka(r.revenue)}
                        </td>
                        <td className="px-5 py-3 text-right font-semibold text-cg-ink">
                          {taka(r.netProfit)}
                        </td>
                        <td className="px-5 py-3">
                          <StatusPill status={r.status} />
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              className={BTN_GHOST}
                              onClick={() => setExporting({ report: r })}
                            >
                              <LuDownload size={14} /> Export
                            </button>
                            {isAdmin && r.status !== "FINALIZED" ? (
                              <button
                                type="button"
                                className={BTN_GHOST}
                                onClick={() => finalize(r.id)}
                              >
                                <LuCheckCheck size={14} /> Finalize
                              </button>
                            ) : null}
                            {isAdmin ? (
                              confirmDelete === r.id ? (
                                <span className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    className="rounded-lg bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-700"
                                    onClick={() => remove(r.id)}
                                  >
                                    Delete
                                  </button>
                                  <button
                                    type="button"
                                    className="rounded-lg px-2 py-1 text-xs font-semibold text-cg-ink/60 hover:bg-black/5"
                                    onClick={() => setConfirmDelete(null)}
                                  >
                                    Cancel
                                  </button>
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  aria-label="Delete report"
                                  className="grid h-8 w-8 place-items-center rounded-lg text-red-600 hover:bg-red-50"
                                  onClick={() => setConfirmDelete(r.id)}
                                >
                                  <LuTrash2 size={16} />
                                </button>
                              )
                            ) : null}
                          </div>
                        </td>
                      </tr>
                      {open ? (
                        <tr>
                          <td colSpan={6} className="bg-cg-lime/10 px-5 py-4">
                            <p className="text-sm leading-relaxed text-cg-ink/80">
                              {r.summary}
                            </p>
                            {r.generatedAt ? (
                              <p className="mt-2 text-xs text-cg-ink/40">
                                Generated {r.generatedAt.slice(0, 10)}
                                {r.finalizedAt
                                  ? ` \u00b7 finalized ${r.finalizedAt.slice(0, 10)}`
                                  : ""}
                              </p>
                            ) : null}
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {exporting && (
        <ReportDocument
          summary={summary}
          trend={trend}
          periodStart={periodStart}
          periodEnd={periodEnd}
          report={exporting.report || null}
          onClose={() => setExporting(null)}
        />
      )}
    </div>
  );
}
