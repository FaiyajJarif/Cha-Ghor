import { useCallback, useEffect, useState } from "react";
import { LuTriangleAlert, LuRefreshCw, LuCircleCheck } from "react-icons/lu";
import api from "../../api/client";
import { apiError } from "../../lib/apiError";
import { BTN_GHOST } from "../../lib/ui";
import InfoTip from "./InfoTip";

// AI anomaly flags for one module (scope = "payroll" | "loan").
//
// The scan is stateless: every run re-reviews the current rows, so a flag
// disappears once the record is fixed. Nothing is stored and nothing is
// dismissed.
//
// The flags are AI-generated, so the panel says so plainly and never presents a
// flag as a finding. The backend has already dropped anything pointing at a row
// that does not exist; `discarded` reports how many, because a model that keeps
// inventing rows is worth noticing.

const SEVERITY = {
  high: {
    label: "High",
    pill: "bg-rose-100 text-rose-700 ring-rose-200",
    bar: "bg-rose-500",
  },
  medium: {
    label: "Medium",
    pill: "bg-amber-100 text-amber-800 ring-amber-200",
    bar: "bg-amber-500",
  },
  low: {
    label: "Low",
    pill: "bg-cg-lime text-cg-green ring-cg-green/20",
    bar: "bg-cg-green",
  },
};

export default function AnomalyPanel({ scope, title = "AI anomaly flags" }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ran, setRan] = useState(false);

  const run = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data: res } = await api.get("/anomalies", { params: { scope } });
      setData(res);
    } catch (err) {
      setError(apiError(err, "Could not run the anomaly check."));
    } finally {
      setLoading(false);
      setRan(true);
    }
  }, [scope]);

  // Deliberately NOT run on mount: this is a slow LLM call, and firing it on
  // every page load would make Payroll and Loans feel broken. The admin asks
  // for it.
  useEffect(() => {
    setData(null);
    setRan(false);
    setError("");
  }, [scope]);

  const flags = data?.flags || [];
  const offline = data && data.available === false;

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow ring-1 ring-cg-green/10">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#C0F28B] px-4 py-3">
        <div className="flex items-center gap-2 font-bold text-cg-ink">
          <LuTriangleAlert size={18} /> {title}
          <InfoTip text="An AI model reviews the current records and points out what looks wrong. Flags are suggestions, not findings — always check the record itself before acting. Nothing is stored; each run re-reviews the live data." />
        </div>
        <button
          type="button"
          className={BTN_GHOST}
          onClick={run}
          disabled={loading}
        >
          <LuRefreshCw size={14} className={loading ? "animate-spin" : ""} />
          {loading ? "Reviewing…" : ran ? "Run again" : "Run check"}
        </button>
      </div>

      <div className="p-4">
        {error && (
          <div className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {!ran && !loading && !error && (
          <p className="px-1 py-3 text-sm text-cg-ink/60">
            {
              "Run a check to have the AI review these records for anything that looks wrong."
            }
          </p>
        )}

        {loading && (
          <p className="px-1 py-3 text-sm text-cg-ink/60">
            {"Reviewing records… this uses a language model and can take a few seconds."}
          </p>
        )}

        {offline && !loading && (
          <div className="rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-800 ring-1 ring-amber-200">
            {data.message}
          </div>
        )}

        {ran && !loading && !error && data?.available && flags.length === 0 && (
          <p className="flex items-center gap-2 px-1 py-3 text-sm text-cg-ink/70">
            <LuCircleCheck size={16} className="text-cg-green" />
            {data.rowsReviewed > 0
              ? `Nothing looked wrong across ${data.rowsReviewed} record${data.rowsReviewed === 1 ? "" : "s"}.`
              : "There are no records to review yet."}
          </p>
        )}

        {flags.length > 0 && (
          <ul className="space-y-2">
            {flags.map((f, i) => {
              const sev = SEVERITY[f.severity] || SEVERITY.medium;
              return (
                <li
                  key={`${f.ref}-${i}`}
                  className="flex gap-3 rounded-xl ring-1 ring-cg-green/10"
                >
                  <span className={`w-1 shrink-0 rounded-l-xl ${sev.bar}`} />
                  <div className="min-w-0 flex-1 py-3 pr-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${sev.pill}`}
                      >
                        {sev.label}
                      </span>
                      <span className="font-semibold text-cg-ink">
                        {f.title}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-cg-ink/70">{f.reason}</p>
                    <p className="mt-1 text-xs text-cg-ink/40">{f.label}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {ran && !loading && data?.available && (
          <p className="mt-3 border-t border-cg-green/10 pt-2 text-xs text-cg-ink/40">
            AI-generated from {data.rowsReviewed} record
            {data.rowsReviewed === 1 ? "" : "s"}
            {data.provider ? ` · ${data.provider}` : ""}
            {data.discarded > 0
              ? ` · ${data.discarded} suggestion${data.discarded === 1 ? "" : "s"} discarded for naming records that do not exist`
              : ""}
            . Check the record before acting.
          </p>
        )}
      </div>
    </div>
  );
}
