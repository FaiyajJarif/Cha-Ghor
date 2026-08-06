import { useCallback, useEffect, useMemo, useState } from "react";
import {
  LuMessageSquare,
  LuSend,
  LuTriangleAlert,
  LuCircleCheck,
  LuSearch,
  LuRefreshCw,
  LuPhone,
} from "react-icons/lu";
import api from "../../api/client";
import { BTN_GHOST } from "../../lib/ui";
import { apiError } from "../../lib/apiError";

// Outbound SMS delivery log. Rendered as a TAB INSIDE the Payroll page, so it
// has no <h1> of its own.
//
// Backend contract (sms module):
//   GET /sms/log   ADMIN only -> findTop50ByOrderBySentAtDesc()
//
// Returns the SmsLog entity directly:
//   { id, workerId, phone, message, category, status, provider, sentAt }
//   category: payroll | loan | withdrawal | alert
//   status:   mock | sent | failed
//
// There is no filter or pagination on the server -- it always returns the most
// recent 50 rows -- so every filter below is deliberately client-side.

const CATEGORIES = ["all", "payroll", "withdrawal", "loan", "alert"];
const STATUSES = ["all", "mock", "sent", "failed"];

const FIELD =
  "rounded-lg border border-cg-green/20 bg-cg-lime/30 px-3 py-2 text-sm outline-none focus:border-cg-green";

function dateTimeFmt(iso) {
  if (!iso) return "\u2014";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "\u2014";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  });
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

function Badge({ value, kind }) {
  const catMap = {
    payroll: "bg-sky-100 text-sky-700",
    withdrawal: "bg-violet-100 text-violet-700",
    loan: "bg-amber-100 text-amber-700",
    alert: "bg-rose-100 text-rose-700",
  };
  const statusMap = {
    mock: "bg-cg-lime text-cg-green",
    sent: "bg-emerald-100 text-emerald-700",
    failed: "bg-red-100 text-red-700",
  };
  const key = String(value || "").toLowerCase();
  const cls =
    (kind === "category" ? catMap[key] : statusMap[key]) || "bg-cg-lime/60 text-cg-ink/70";
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${cls}`}>
      {value || "\u2014"}
    </span>
  );
}

export default function SmsLogPanel() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/sms/log");
      setRows(Array.isArray(data) ? data : []);
      setError("");
    } catch (err) {
      setError(
        apiError(
          err,
          "Could not load the SMS log. This view is admin-only \u2014 make sure you're signed in as admin and the backend is running.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (category !== "all" && String(r.category).toLowerCase() !== category) return false;
      if (status !== "all" && String(r.status).toLowerCase() !== status) return false;
      if (!needle) return true;
      return (
        String(r.message || "").toLowerCase().includes(needle) ||
        String(r.phone || "").toLowerCase().includes(needle) ||
        String(r.workerId || "").includes(needle)
      );
    });
  }, [rows, category, status, q]);

  const counts = useMemo(
    () => ({
      mock: rows.filter((r) => String(r.status).toLowerCase() === "mock").length,
      sent: rows.filter((r) => String(r.status).toLowerCase() === "sent").length,
      failed: rows.filter((r) => String(r.status).toLowerCase() === "failed").length,
    }),
    [rows],
  );

  const noPhoneCount = rows.filter((r) => !r.phone).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-cg-ink">SMS Log</h2>
          <p className="text-sm text-cg-ink/60">
            Every message the system sent to workers, newest first.
          </p>
        </div>
        <button className={BTN_GHOST} onClick={load} disabled={loading}>
          <LuRefreshCw size={16} /> Refresh
        </button>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={LuMessageSquare}
          label="Messages"
          value={rows.length}
          sub="Most recent 50"
        />
        <StatCard
          icon={LuSend}
          label="Mock"
          value={counts.mock}
          sub="Logged, not really sent"
        />
        <StatCard
          icon={LuCircleCheck}
          label="Sent"
          value={counts.sent}
          sub="Accepted by a real provider"
        />
        <StatCard
          icon={LuTriangleAlert}
          label="Failed"
          value={counts.failed}
          sub="Rejected or no phone on file"
          tone={counts.failed > 0 ? "red" : "default"}
        />
      </div>

      {/* Mock-mode explainer */}
      <div className="rounded-xl bg-cg-lime/40 px-4 py-3 text-sm text-cg-ink/70 ring-1 ring-cg-green/10">
        <span className="font-semibold text-cg-ink">Mock mode.</span> No SMS gateway is
        connected, so messages are recorded here instead of being delivered. Pay a payslip
        or decide a withdrawal, then refresh this page to see exactly what the worker would
        have received.
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          <LuTriangleAlert size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {noPhoneCount > 0 ? (
        <div className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
          <LuPhone size={16} className="mt-0.5 shrink-0" />
          <span>
            {noPhoneCount} message{noPhoneCount === 1 ? "" : "s"} could not be addressed
            because the worker has no phone number saved. Add one in Workforce so future
            notifications reach them.
          </span>
        </div>
      ) : null}

      {/* Filters + table */}
      <div className="rounded-2xl bg-white shadow ring-1 ring-cg-green/10">
        <div className="flex flex-wrap items-center gap-3 border-b border-cg-green/10 px-6 py-4">
          <div className="relative flex-1 min-w-[200px]">
            <LuSearch
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-cg-ink/40"
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search message, phone or worker ID"
              className={`${FIELD} w-full pl-9`}
            />
          </div>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={FIELD}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c === "all" ? "All categories" : c[0].toUpperCase() + c.slice(1)}
              </option>
            ))}
          </select>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className={FIELD}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s === "all" ? "All statuses" : s[0].toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto px-6 py-2">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-cg-ink/50">
                <th className="py-3 pr-4 font-semibold">Sent</th>
                <th className="py-3 pr-4 font-semibold">Worker</th>
                <th className="py-3 pr-4 font-semibold">Phone</th>
                <th className="py-3 pr-4 font-semibold">Category</th>
                <th className="py-3 pr-4 font-semibold">Status</th>
                <th className="py-3 pr-4 font-semibold">Message</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cg-green/10">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-cg-ink/50">
                    Loading…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-cg-ink/50">
                    {rows.length === 0
                      ? "No messages yet. Pay a payslip or decide a withdrawal to generate one."
                      : "No messages match these filters."}
                  </td>
                </tr>
              ) : (
                filtered.map((r) => {
                  const failed = String(r.status).toLowerCase() === "failed";
                  return (
                    <tr key={r.id} className={failed ? "bg-red-50/40" : undefined}>
                      <td className="whitespace-nowrap py-3 pr-4 text-cg-ink/70">
                        {dateTimeFmt(r.sentAt)}
                      </td>
                      <td className="py-3 pr-4 text-cg-ink/70">
                        {r.workerId ? "#" + r.workerId : "—"}
                      </td>
                      <td className="whitespace-nowrap py-3 pr-4 text-cg-ink/70">
                        {r.phone || (
                          <span className="text-red-600">no phone on file</span>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        <Badge value={r.category} kind="category" />
                      </td>
                      <td className="py-3 pr-4">
                        <Badge value={r.status} kind="status" />
                      </td>
                      <td className="py-3 pr-4 text-cg-ink/80">{r.message}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="border-t border-cg-green/10 px-6 py-4 text-xs text-cg-ink/50">
          Showing {filtered.length} of {rows.length} logged messages. The server returns the
          most recent 50 only.
        </div>
      </div>
    </div>
  );
}
