import { useState } from "react";
import { createPortal } from "react-dom";
import { LuBrain, LuX, LuRefreshCw } from "react-icons/lu";
import api from "../../api/client";
import { apiError } from "../../lib/apiError";
import { BTN_DARK, BTN_GHOST } from "../../lib/ui";

// AI credit assessment for one pending loan request.
//
// The numbers in "What this is based on" are computed by the backend from the
// estate's records, not written by the model — so they are reproducible. The
// risk level and the wording are the model's opinion.
//
// This component deliberately has NO approve or reject button. The decision
// stays on the row behind it, with the admin. A suggestion that sits next to
// the real buttons is a suggestion; one that replaces them is not.

const RISK = {
  low: { label: "Low risk", cls: "bg-emerald-100 text-emerald-700 ring-emerald-200" },
  med: { label: "Medium risk", cls: "bg-amber-100 text-amber-800 ring-amber-200" },
  high: { label: "High risk", cls: "bg-rose-100 text-rose-700 ring-rose-200" },
};

const RECO = {
  approve: { label: "Suggests: approve", cls: "text-emerald-700" },
  review: { label: "Suggests: look closer", cls: "text-amber-700" },
  decline: { label: "Suggests: decline", cls: "text-rose-700" },
};

const taka = (n) =>
  "৳" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

// Only the facts worth an admin's attention, in plain words.
const FACT_LABELS = [
  ["prior_loans", "Previous loans"],
  ["prior_repaid_in_full", "Repaid in full"],
  ["prior_ever_overdue", "Ever overdue"],
  ["prior_still_outstanding", "Still outstanding"],
  ["total_repaid_before", "Repaid before", "money"],
  ["outstanding_now", "Owes now", "money"],
  ["daily_wage", "Daily wage", "money"],
  ["requested_to_daily_wage", "Request in days of wages"],
  ["attendance_rate_pct", "Attendance rate", "pct"],
  ["months_employed", "Months employed"],
];

function factValue(key, raw, kind) {
  if (raw === null || raw === undefined || raw === "") {
    return key === "attendance_rate_pct" ? "not recorded" : "—";
  }
  if (kind === "money") return taka(raw);
  if (kind === "pct") return `${raw}%`;
  return String(raw);
}

export default function LoanScoreCard({ loan, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ran, setRan] = useState(false);

  const run = async () => {
    setLoading(true);
    setError("");
    try {
      const { data: res } = await api.post(`/loans/requests/${loan.id}/score`);
      setData(res);
    } catch (err) {
      setError(apiError(err, "Could not score this request."));
    } finally {
      setLoading(false);
      setRan(true);
    }
  };

  const risk = data?.risk ? RISK[data.risk] || RISK.med : null;
  const reco = data?.recommendation ? RECO[data.recommendation] || RECO.review : null;
  const facts = data?.facts || {};

  return createPortal(
    <>
      <div className="fixed inset-0 z-[1200] bg-black/40" onClick={onClose} />
      <div className="fixed inset-0 z-[1210] flex items-center justify-center p-4">
        <div
          className="flex max-h-[90vh] w-full max-w-[560px] flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between bg-[#C0F28B] px-5 py-3">
            <div className="flex items-center gap-2">
              <LuBrain size={18} />
              <div>
                <h3 className="text-sm font-bold text-cg-ink">
                  AI credit assessment
                </h3>
                <p className="text-xs text-cg-ink/70">
                  {loan.workerName} · {taka(loan.amount)}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="grid h-8 w-8 place-items-center rounded-lg hover:bg-black/5"
              aria-label="Close"
            >
              <LuX />
            </button>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            {error && (
              <div className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            {!ran && !loading && !error && (
              <p className="text-sm text-cg-ink/60">
                {
                  "Score this request to see the worker's borrowing and attendance record, with an AI opinion on the risk."
                }
              </p>
            )}

            {loading && (
              <p className="text-sm text-cg-ink/60">
                {"Assessing… this uses a language model and can take a few seconds."}
              </p>
            )}

            {data && data.available === false && (
              <div className="rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-800 ring-1 ring-amber-200">
                {data.message}
              </div>
            )}

            {data && data.available && (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ring-1 ${risk.cls}`}
                  >
                    {risk.label}
                  </span>
                  <span className={`text-sm font-semibold ${reco.cls}`}>
                    {reco.label}
                  </span>
                </div>

                {data.suggestedAmount ? (
                  <div className="rounded-xl bg-cg-lime/40 px-4 py-3 text-sm text-cg-ink">
                    Suggests lending{" "}
                    <span className="font-bold">{taka(data.suggestedAmount)}</span>{" "}
                    instead of the {taka(loan.amount)} requested.
                  </div>
                ) : null}

                {data.reasonEn ? (
                  <p className="text-sm leading-relaxed text-cg-ink/80">
                    {data.reasonEn}
                  </p>
                ) : null}
                {data.reasonBn ? (
                  <p className="border-l-2 border-cg-green/30 pl-3 text-sm leading-relaxed text-cg-ink/70">
                    {data.reasonBn}
                  </p>
                ) : null}
              </>
            )}

            {/* The evidence. Shown even when the AI is unavailable, because
                these figures are ours and are useful on their own. */}
            {ran && Object.keys(facts).length > 0 && (
              <div>
                <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-cg-ink/60">
                  What this is based on
                </h4>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                  {FACT_LABELS.filter(([k]) => k in facts).map(([k, label, kind]) => (
                    <div key={k} className="flex justify-between gap-2">
                      <dt className="text-cg-ink/60">{label}</dt>
                      <dd className="font-semibold tabular-nums text-cg-ink">
                        {factValue(k, facts[k], kind)}
                      </dd>
                    </div>
                  ))}
                </dl>
                {facts.linked_to_worker === false && (
                  <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
                    This request is not linked to a worker record, so there is no
                    history to judge it on — and if approved it cannot be
                    deducted from wages automatically.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 bg-[#D3FFAC] px-5 py-3">
            <p className="text-xs text-cg-ink/60">
              {data?.available
                ? `AI suggestion${data.model ? ` · ${data.model}` : ""} · you decide`
                : "Approve and reject stay with you."}
            </p>
            <div className="flex items-center gap-2">
              <button type="button" className={BTN_GHOST} onClick={onClose}>
                Close
              </button>
              <button
                type="button"
                className={BTN_DARK}
                onClick={run}
                disabled={loading}
              >
                <LuRefreshCw size={14} className={loading ? "animate-spin" : ""} />
                {loading ? "Assessing…" : ran ? "Score again" : "Score request"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
