import { useCallback, useEffect, useState } from "react";
import { LuSparkles, LuInfo, LuRefreshCw, LuCloudRain } from "react-icons/lu";
import api from "../../api/client";
import { apiError } from "../../lib/apiError";

// What rain actually costs this estate.
//
// WHY THIS IS THE AI FEATURE ON THIS PAGE
//   The yield forecast has been cutting expectations by a flat 25% on wet days
//   since it was written. That number was invented — a plausible guess typed
//   into a service. But weather_log and leaf_collection have been recording
//   the same days side by side all along, so the real figure can be MEASURED
//   and the guess retired.
//
//   It is a ratio of two means, computed in Java. Someone with the day sheets
//   could reproduce it by hand, which is exactly why it is worth more than a
//   model's opinion — and why the panel prints both averages and both sample
//   sizes rather than just the headline.
//
//   PER WORKER, not per day: fewer people turn up when it rains, so comparing
//   daily totals would measure attendance as much as weather.

const CARD_STROKE = "ring-1 ring-[#13483B59]";

export default function RainImpactPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: d } = await api.get("/weather/rain-impact");
      setData(d);
      setError("");
    } catch (err) {
      setError(apiError(err, "Could not work out the rain impact."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const pct =
    data?.factor == null ? null : Math.round(Number(data.factor) * 100);
  const drop = pct == null ? null : 100 - pct;

  return (
    <div className={`overflow-hidden rounded-2xl bg-white shadow ${CARD_STROKE}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 bg-[#C0F28B] px-5 py-3">
        <div className="flex items-center gap-2 font-bold text-cg-ink">
          <LuSparkles size={16} /> What rain costs this estate
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          title="Recalculate from the latest weigh-ins and registers"
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold text-cg-ink/70 transition hover:bg-white/60 disabled:opacity-40"
        >
          <LuRefreshCw size={13} /> Recalculate
        </button>
      </div>

      <div className="space-y-4 p-5">
        {error && (
          <p className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</p>
        )}

        {loading ? (
          <p className="py-6 text-center text-sm text-cg-ink/50">{"Measuring…"}</p>
        ) : !data ? null : !data.enoughData ? (
          /* Refusing is the correct answer on a young database, and it says so
             instead of showing a decimal that looks measured and is not. */
          <>
            <p className="text-sm text-cg-ink/70">{data.summary}</p>
            <div className="flex flex-wrap gap-4 text-xs text-cg-ink/50">
              <span>
                <strong className="text-cg-ink">{data.wetDays}</strong> wet days matched
              </span>
              <span>
                <strong className="text-cg-ink">{data.dryDays}</strong> dry days matched
              </span>
              <span>
                falling back to <strong className="text-cg-ink">{data.fallbackFactor}</strong>
              </span>
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline gap-3">
              <span className="text-4xl font-extrabold text-cg-ink">{pct}%</span>
              <span className="text-sm text-cg-ink/60">
                of a dry day&rsquo;s picking, per plucker
              </span>
              {drop > 0 ? (
                <span className="rounded-full bg-sky-100 px-2.5 py-1 text-[10px] font-bold uppercase text-sky-800">
                  {drop}% drop
                </span>
              ) : (
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold uppercase text-emerald-700">
                  no measurable drop
                </span>
              )}
            </div>

            <p className="text-sm text-cg-ink">{data.summary}</p>

            {/* Both halves of the ratio, so the headline can be checked. */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-[#F4FFE9] p-3 ring-1 ring-[#13483B]/10">
                <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-cg-ink/50">
                  <LuCloudRain size={12} /> Wet days
                </p>
                <p className="mt-1 text-xl font-extrabold text-cg-ink">
                  {data.wetAvgKgPerWorker} kg
                  <span className="ml-1 text-xs font-bold text-cg-ink/40">per worker</span>
                </p>
                <p className="text-[11px] text-cg-ink/45">
                  from {data.wetDays} days at or above {data.wetThresholdMm} mm
                </p>
              </div>
              <div className="rounded-xl bg-[#F4FFE9] p-3 ring-1 ring-[#13483B]/10">
                <p className="text-[11px] font-bold uppercase tracking-wide text-cg-ink/50">
                  Dry days
                </p>
                <p className="mt-1 text-xl font-extrabold text-cg-ink">
                  {data.dryAvgKgPerWorker} kg
                  <span className="ml-1 text-xs font-bold text-cg-ink/40">per worker</span>
                </p>
                <p className="text-[11px] text-cg-ink/45">from {data.dryDays} days</p>
              </div>
            </div>

            {/* The point of the whole feature, stated plainly. */}
            <p className="rounded-xl bg-[#F4FFE9] px-4 py-3 text-xs text-cg-ink ring-1 ring-[#13483B]/10">
              The yield forecast now uses <strong>{data.factor}</strong> on heavy-rain
              days instead of its built-in {data.fallbackFactor} estimate, because
              this figure comes from your own records rather than an assumption.
            </p>
          </>
        )}

        <p className="flex items-start gap-2 text-[11px] text-cg-ink/45">
          <LuInfo size={13} className="mt-0.5 shrink-0" />
          Measured over the last {data?.windowDays ?? 180} days by comparing kilos
          per worker present on wet days against dry ones. Per worker, because
          fewer people come in when it rains — comparing daily totals would count
          that as weather. No model is involved.
        </p>
      </div>
    </div>
  );
}
