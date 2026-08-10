import { useCallback, useEffect, useState } from "react";
import {
  LuSparkles,
  LuInfo,
  LuCloudRain,
  LuCalendarPlus,
  LuRefreshCw,
} from "react-icons/lu";
import api from "../../api/client";
import { apiError } from "../../lib/apiError";

// Which field to pluck next.
//
// WHY THIS IS DEFENSIBLE AND THE PHOTO GRADER IS NOT
//   Tea is picked on a round of roughly 7-10 days. Leaf left past the round
//   coarsens, and coarse leaf grades down -- which is exactly what the
//   TeaLeafAgeQuality dataset encodes (1-2 days old -> A, 7+ days -> B). So
//   "days since this field was last plucked" is a checkable predictor of
//   tomorrow's quality, computed from rows already in leaf_collection.
//
//   THE ORDER IS ARITHMETIC, done in Java. The model is handed the finished
//   table and asked to write a paragraph; it cannot reorder anything, invent a
//   field or change a number. The written summary is behind a button and its
//   absence costs nothing -- if the AI service is down the ranking still shows.
//   After measuring the photo grader at 56.7% against a 51% baseline, an AI
//   feature whose useful half needs no model at all is the point, not a
//   compromise.

const CARD_STROKE = "ring-1 ring-[#13483B59]";

const BAND = {
  OVERDUE: { label: "Overdue", tone: "bg-rose-100 text-rose-700" },
  DUE: { label: "Due", tone: "bg-amber-100 text-amber-800" },
  RESTING: { label: "Resting", tone: "bg-emerald-100 text-emerald-700" },
  NO_DATA: { label: "No data", tone: "bg-slate-100 text-slate-500" },
  CLOSED: { label: "Closed", tone: "bg-slate-100 text-slate-400" },
};

export default function FieldAiPanel({ onSchedule }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (withNarrative) => {
    const setBusy = withNarrative ? setWriting : setLoading;
    setBusy(true);
    try {
      const { data: d } = await api.get("/harvest-schedules/advice", {
        params: { narrative: !!withNarrative },
      });
      setData(d);
      setError("");
    } catch (err) {
      setError(apiError(err, "Could not work out the pluck round."));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  const rows = data?.fields || [];
  // Closed fields are kept out of the headline count: a field shut for pruning
  // is not work waiting to be done.
  const urgent = rows.filter((f) => f.band === "OVERDUE").length;

  return (
    <div className={`overflow-hidden rounded-2xl bg-white shadow ${CARD_STROKE}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 bg-[#C0F28B] px-5 py-3">
        <div className="flex items-center gap-2 font-bold text-cg-ink">
          <LuSparkles size={16} /> Pluck round — what to pick next
        </div>
        <button
          type="button"
          onClick={() => load(false)}
          disabled={loading}
          title="Recalculate from the latest weigh-ins"
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold text-cg-ink/70 transition hover:bg-white/60 disabled:opacity-40"
        >
          <LuRefreshCw size={13} /> Refresh
        </button>
      </div>

      <div className="space-y-4 p-5">
        {error && (
          <p className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</p>
        )}

        {loading ? (
          <p className="py-6 text-center text-sm text-cg-ink/50">
            {"Working out the round…"}
          </p>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-cg-ink/50">
            No fields to advise on yet.
          </p>
        ) : (
          <>
            <p className="text-sm text-cg-ink/70">
              {urgent > 0 ? (
                <>
                  <span className="font-bold text-rose-700">
                    {urgent} field{urgent === 1 ? "" : "s"} past the round
                  </span>{" "}
                  — leaf this old usually comes in coarse.
                </>
              ) : (
                <>The round looks on track. Nothing is overdue.</>
              )}{" "}
              <span className="text-cg-ink/45">
                Measured against a {data.cycleDays}-day pluck round.
              </span>
            </p>

            {data.weatherNote && (
              <p className="flex items-start gap-2 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-900 ring-1 ring-sky-200">
                <LuCloudRain size={14} className="mt-0.5 shrink-0" />
                {data.weatherNote}
              </p>
            )}

            <ul className="divide-y divide-cg-green/10">
              {rows.map((f) => {
                const b = BAND[f.band] || BAND.NO_DATA;
                return (
                  <li
                    key={f.zoneId}
                    className="flex flex-wrap items-start justify-between gap-3 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-cg-ink">{f.zoneName}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${b.tone}`}
                        >
                          {b.label}
                        </span>
                        {f.recentAvgKg != null && (
                          <span className="text-xs text-cg-ink/45">
                            {Number(f.recentAvgKg).toFixed(1)} kg on an average picking day
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-cg-ink/60">{f.reason}</p>
                    </div>
                    {/* Only offer to schedule work that is actually waiting. */}
                    {(f.band === "OVERDUE" || f.band === "DUE") && (
                      <button
                        type="button"
                        onClick={() => onSchedule?.(f)}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#14493B] px-3 py-1.5 text-xs font-bold text-white transition hover:brightness-110"
                      >
                        <LuCalendarPlus size={13} /> Schedule
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>

            {/* The written summary is opt-in. Fetching it on page load would
                spend a model call every time someone opens the board. */}
            {data.narrative ? (
              <p className="rounded-xl bg-[#F4FFE9] px-4 py-3 text-sm text-cg-ink ring-1 ring-[#13483B]/10">
                {data.narrative}
              </p>
            ) : data.narrativeError ? (
              <p className="rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-900 ring-1 ring-amber-200">
                {data.narrativeError}
              </p>
            ) : (
              <button
                type="button"
                onClick={() => load(true)}
                disabled={writing}
                className="inline-flex items-center gap-2 rounded-xl bg-[#14493B] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
              >
                <LuSparkles size={14} />
                {writing ? "Writing…" : "Write it up for me"}
              </button>
            )}

            <p className="flex items-start gap-2 text-[11px] text-cg-ink/45">
              <LuInfo size={13} className="mt-0.5 shrink-0" />
              The ranking is arithmetic — days since each field was last weighed
              in, against the round. Only the written paragraph is AI, and it
              cannot change the order or any number above it.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
