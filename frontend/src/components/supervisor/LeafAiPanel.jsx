import { useCallback, useEffect, useRef, useState } from "react";
import {
  LuCamera,
  LuInfo,
  LuTriangleAlert,
  LuCircleCheck,
  LuTrendingUp,
  LuLeaf,
  LuStethoscope,
} from "react-icons/lu";
import api from "../../api/client";
import { apiError } from "../../lib/apiError";
import { BTN_DARK, BTN_GHOST } from "../../lib/ui";

// The two AI features on the leaf page.
//
// GRADING is advisory and the UI says so on every result. Grade A pays a bonus
// per kilo, so a model's read of a phone photo taken at a field scale must
// never become a pay grade on its own. The panel deliberately has no "apply"
// button: the supervisor sets the grade on the weigh-in row as they always did.
//
// FORECAST is arithmetic, not a model, and its assumptions are printed under
// the number so a supervisor can disagree with the reasoning rather than the
// figure.

const CARD_STROKE = "ring-1 ring-[#13483B59]";

const CONFIDENCE = {
  GOOD: { label: "Good history", tone: "bg-emerald-100 text-emerald-700" },
  FAIR: { label: "Some history", tone: "bg-amber-100 text-amber-800" },
  WEAK: { label: "Little history", tone: "bg-rose-100 text-rose-700" },
};

const kg = (v) => (v == null ? "—" : Number(v).toFixed(1));

// Health bands. Colour carries the severity, so a SEVERE reading is visible
// before anyone reads a word of it.
const BAND = {
  HEALTHY:  { label: "Healthy",  ring: "ring-emerald-200", bg: "bg-emerald-50", text: "text-emerald-700", bar: "bg-emerald-500" },
  MINOR:    { label: "Minor",    ring: "ring-lime-200",    bg: "bg-lime-50",    text: "text-lime-800",    bar: "bg-lime-500" },
  MODERATE: { label: "Moderate", ring: "ring-amber-200",   bg: "bg-amber-50",   text: "text-amber-800",   bar: "bg-amber-500" },
  SEVERE:   { label: "Severe",   ring: "ring-rose-200",    bg: "bg-rose-50",    text: "text-rose-700",    bar: "bg-rose-500" },
};

export default function LeafAiPanel({ onGraded }) {
  const fileRef = useRef(null);
  const [preview, setPreview] = useState("");
  const [grading, setGrading] = useState(false);
  const [suggestion, setSuggestion] = useState(null);
  const [gradeErr, setGradeErr] = useState("");
  // Health is a SECOND question about the same photo: what is wrong with the
  // leaf. It works on a bush photo, which the pluck grader refuses — the two
  // answer different questions and both are worth having.
  const [health, setHealth] = useState(null);
  const [checking, setChecking] = useState(false);
  const [lastFile, setLastFile] = useState(null);

  // A second, deliberate question about the same photo: what is WRONG with the
  // leaf. Separate because it costs another model call, and most weigh-ins do
  // not need a diagnosis.
  const checkHealth = async () => {
    if (!lastFile) return;
    setChecking(true);
    try {
      const f = new FormData();
      f.append("file", lastFile);
      const { data } = await api.post("/leaf/health-photo", f, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setHealth(data);
    } catch (err) {
      setGradeErr(apiError(err, "Could not examine the leaf's condition."));
    } finally {
      setChecking(false);
    }
  };

  const [forecast, setForecast] = useState(null);
  const [loadingCast, setLoadingCast] = useState(true);
  const [castErr, setCastErr] = useState("");

  const loadForecast = useCallback(async () => {
    setLoadingCast(true);
    try {
      const { data } = await api.get("/leaf/forecast");
      setForecast(data);
      setCastErr("");
    } catch (err) {
      setForecast(null);
      setCastErr(apiError(err, "Could not build a forecast."));
    } finally {
      setLoadingCast(false);
    }
  }, []);

  useEffect(() => {
    loadForecast();
  }, [loadForecast]);

  // Revoke the object URL when it changes or the panel unmounts, or every
  // photo taken in a shift leaks a blob for as long as the tab is open.
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const onPick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // let the same photo be chosen again
    if (!file) return;

    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(file);
    });
    setSuggestion(null);
    setHealth(null);
    setGradeErr("");
    setGrading(true);
    try {
      const mk = () => {
        const f = new FormData();
        f.append("file", file);
        return f;
      };
      const hdr = { headers: { "Content-Type": "multipart/form-data" } };
      // ONE call per photo.
      //
      // This used to fire grade AND health together, which doubled the cost of
      // every photograph. On a free Gemini tier of 20 requests a day that is
      // ten photos, not twenty, and the second half of a shift gets 429s. The
      // diagnosis is now asked for deliberately, by the person who wants it.
      const { data } = await api.post("/leaf/grade-photo", mk(), hdr);
      setSuggestion(data);
      onGraded?.(data);
      // Keep the file so a diagnosis can be requested without re-photographing.
      setLastFile(file);
    } catch (err) {
      setGradeErr(apiError(err, "Could not examine that photo."));
    } finally {
      setGrading(false);
    }
  };

  const conf = suggestion?.confidence == null ? null : Number(suggestion.confidence);

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {/* ---------- photo grading ---------- */}
      <div className={`rounded-2xl bg-white p-5 shadow ${CARD_STROKE}`}>
        <h2 className="flex items-center gap-2 text-lg font-extrabold text-cg-ink">
          <LuCamera size={18} className="text-cg-green" />
          Grade leaf from a photo
        </h2>
        <p className="mt-1 text-xs text-cg-ink/50">
          Photograph the <span className="font-semibold">plucked bulk on the scale</span>{" "}
          and get a suggested grade. It is a suggestion only — you still set the
          grade on the weigh-in.
        </p>
        {/* The single most common mistake is photographing the bush. The
            grader judges HOW LEAF WAS PICKED, so leaf still on the plant has
            nothing to judge. Saying so up front is cheaper than a refusal. */}
        <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-cg-lime/40 px-3 py-2 text-[11px] text-cg-ink/70">
          <LuInfo size={12} className="mt-0.5 shrink-0 text-cg-green" />
          It grades the pluck, not the plant. A photo of leaf still on the bush
          will be refused — that is the check working, not an error.
        </p>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={onPick}
          className="hidden"
        />

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={grading}
            className={BTN_DARK}
          >
            <LuCamera size={15} /> {grading ? "Reading photo…" : "Take or choose a photo"}
          </button>
          {suggestion && !health && (
            <button
              type="button"
              onClick={checkHealth}
              disabled={checking || !lastFile}
              title="Asks the model a second question about this same photo — uses another request"
              className={BTN_GHOST}
            >
              <LuStethoscope size={15} />
              {checking ? "Examining…" : "Check for disease"}
            </button>
          )}
          {suggestion && (
            <button
              type="button"
              onClick={() => {
                setSuggestion(null);
                setHealth(null);
                setLastFile(null);
                setPreview((old) => {
                  if (old) URL.revokeObjectURL(old);
                  return "";
                });
              }}
              className={BTN_GHOST}
            >
              Clear
            </button>
          )}
        </div>

        {gradeErr && (
          <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {gradeErr}
          </p>
        )}

        {preview && (
          <img
            src={preview}
            alt="Leaf being graded"
            className="mt-4 h-44 w-full rounded-xl object-cover ring-1 ring-[#13483B59]"
          />
        )}

        {/* ---- what is WRONG with the leaf ----
            A second question about the same photo. This one works on leaf
            still on the bush, which the pluck grader refuses — so a "cannot
            grade" result is usually accompanied by a real diagnosis here. */}
        {health && (
          <div
            className={`mt-4 rounded-xl p-4 ring-1 ${
              health.usable && health.healthBand
                ? `${BAND[health.healthBand]?.bg} ${BAND[health.healthBand]?.ring}`
                : "bg-slate-50 ring-slate-200"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-cg-ink/60">
                <LuStethoscope size={13} /> Leaf condition
              </p>
              {health.healthBand && (
                <span
                  className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                    BAND[health.healthBand]?.bg
                  } ${BAND[health.healthBand]?.text} ring-1 ${BAND[health.healthBand]?.ring}`}
                >
                  {BAND[health.healthBand]?.label || health.healthBand}
                </span>
              )}
            </div>

            {!health.usable ? (
              <p className="mt-2 text-xs text-cg-ink/60">
                {health.advice || "This photo could not be examined."}
              </p>
            ) : (
              <>
                {health.healthScore != null && (
                  <div className="mt-2">
                    <div className="flex items-baseline justify-between">
                      <span className="text-3xl font-extrabold text-cg-ink">
                        {health.healthScore}
                        <span className="ml-1 text-sm font-bold text-cg-ink/40">/100</span>
                      </span>
                      <span className="text-[11px] text-cg-ink/50">
                        severity × how much is affected
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 w-full rounded-full bg-white/70">
                      <div
                        className={`h-2 rounded-full ${BAND[health.healthBand]?.bar || "bg-slate-400"}`}
                        style={{ width: `${Math.max(2, health.healthScore)}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Ranked possibilities, never one certain verdict. The list
                    includes non-disease causes on purpose: yellowing is more
                    often under-fertilising than infection, and a model that can
                    only name diseases will always name one. */}
                {health.candidates?.length > 0 && (
                  <div className="mt-3">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-cg-ink/50">
                      Most likely causes
                    </p>
                    <ul className="mt-1.5 space-y-1.5">
                      {health.candidates.map((c, i) => (
                        <li key={i} className="rounded-lg bg-white/80 px-3 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-bold capitalize text-cg-ink">
                              {c.condition}
                            </span>
                            <span className="shrink-0 text-xs font-bold text-cg-ink/60">
                              {Math.round((c.likelihood || 0) * 100)}%
                            </span>
                          </div>
                          <div className="mt-1 h-1.5 w-full rounded-full bg-cg-lime/40">
                            <div
                              className="h-1.5 rounded-full bg-cg-green"
                              style={{ width: `${Math.round((c.likelihood || 0) * 100)}%` }}
                            />
                          </div>
                          {c.why && (
                            <p className="mt-1 text-[11px] text-cg-ink/55">{c.why}</p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {health.advice && (
                  <p
                    className={`mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${
                      health.healthBand === "SEVERE" || health.healthBand === "MODERATE"
                        ? "bg-rose-50 font-semibold text-rose-800 ring-1 ring-rose-200"
                        : "bg-white text-cg-ink ring-1 ring-[#13483B]/10"
                    }`}
                  >
                    <LuTriangleAlert size={14} className="mt-0.5 shrink-0" />
                    <span>{health.advice}</span>
                  </p>
                )}

                {/* Never a chemical, never a dose. */}
                <p className="mt-2 text-[10px] text-cg-ink/40">
                  Possible causes only, from one photograph. No treatment or
                  chemical is recommended — have the field inspected.
                </p>
              </>
            )}
          </div>
        )}

        {suggestion && (
          <div
            className={`mt-4 rounded-xl border p-4 ${
              suggestion.grade
                ? "border-[#13483B59] bg-[#F4FFE9]"
                : "border-amber-300 bg-amber-50"
            }`}
          >
            <div className="flex flex-wrap items-center gap-3">
              {/* A null grade is a real answer, not a failure. */}
              <span
                className={`grid h-12 w-12 place-items-center rounded-xl text-2xl font-extrabold ${
                  suggestion.grade === "A"
                    ? "bg-emerald-100 text-emerald-700"
                    : suggestion.grade === "B"
                      ? "bg-amber-100 text-amber-800"
                      : "bg-slate-100 text-slate-400"
                }`}
              >
                {suggestion.grade || "?"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-cg-ink">
                  {suggestion.grade
                    ? `Suggests grade ${suggestion.grade}`
                    : "Not a plucked bulk — nothing to grade"}
                </p>
                {/* THE CONFIDENCE NUMBER IS NOT SHOWN FOR A GRADE, and that is
                    a measured decision, not caution. Over 97 labelled Sylhet
                    photographs the model reported a mean confidence of 0.96
                    when it was right and 0.96 when it was wrong. It carries no
                    information about correctness, so printing it would only
                    make a coin-flip look authoritative.

                    It is still shown for a REFUSAL, where it means something
                    different and cheaper to verify: how sure it is that the
                    frame is not pluckable leaf on a scale. */}
                {suggestion.grade ? (
                  <p className="text-xs text-cg-ink/60">
                    A guess from one photograph — check the leaf
                    {suggestion.provider ? ` · ${suggestion.provider}` : ""}
                  </p>
                ) : (
                  conf != null && (
                    <p className="text-xs text-cg-ink/60">
                      {Math.round(conf * 100)}% sure this is not pluckable leaf on a scale
                      {suggestion.provider ? ` · ${suggestion.provider}` : ""}
                    </p>
                  )
                )}
              </div>
            </div>

            {/* Always shown, never behind a click: this is what stops a
                suggestion being read as a decision. */}
            <p className="mt-3 flex items-start gap-2 rounded-lg bg-white px-3 py-2 text-xs text-cg-ink ring-1 ring-[#13483B]/10">
              <LuInfo size={14} className="mt-0.5 shrink-0 text-cg-green" />
              <span>{suggestion.advice}</span>
            </p>

            {suggestion.observations?.length > 0 && (
              <div className="mt-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-cg-ink/50">
                  {suggestion.grade ? "What it says it can see" : "What it saw instead"}
                </p>
                <ul className="mt-1 space-y-0.5">
                  {suggestion.observations.map((o, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs text-cg-ink/70">
                      <LuCircleCheck size={12} className="mt-0.5 shrink-0 text-cg-green" />
                      {o}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {suggestion.concerns?.length > 0 && (
              <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2.5 ring-1 ring-rose-200">
                <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-rose-700">
                  <LuTriangleAlert size={12} />
                  Look carefully before accepting
                </p>
                <ul className="mt-1.5 space-y-1">
                  {suggestion.concerns.map((c, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs font-medium text-rose-800">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-rose-500" />
                      {c}
                    </li>
                  ))}
                </ul>
                {/* Say what to DO, not only what is wrong. */}
                <p className="mt-2 border-t border-rose-200 pt-2 text-[11px] font-semibold text-rose-700">
                  {suggestion.grade
                    ? "Check the leaf yourself before you accept this grade."
                    : "Photograph the plucked leaf on the scale, not the bush, and try again."}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ---------- yield forecast ---------- */}
      <div className={`rounded-2xl bg-white p-5 shadow ${CARD_STROKE}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-extrabold text-cg-ink">
            <LuTrendingUp size={18} className="text-cg-green" />
            Expected tomorrow
          </h2>
          {forecast?.confidence && (
            <span
              className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                CONFIDENCE[forecast.confidence]?.tone || CONFIDENCE.WEAK.tone
              }`}
            >
              {CONFIDENCE[forecast.confidence]?.label || forecast.confidence}
            </span>
          )}
        </div>

        {castErr && (
          <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {castErr}
          </p>
        )}

        {loadingCast ? (
          <p className="py-10 text-center text-sm text-cg-ink/50">Working it out…</p>
        ) : !forecast ? (
          <div className="mt-4 grid min-h-[140px] place-items-center rounded-xl border border-dashed border-[#13483B59] px-4 text-center text-sm text-cg-ink/50">
            No forecast available.
          </div>
        ) : (
          <>
            <div className="mt-3 flex items-end justify-between gap-3 rounded-xl bg-[#D3FFAC] px-4 py-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-cg-ink/60">
                  Estate total
                </p>
                <p className="text-4xl font-extrabold leading-none text-cg-ink">
                  {kg(forecast.estateKg)}
                  <span className="ml-1.5 text-lg font-bold text-cg-ink/40">kg</span>
                </p>
              </div>
              <p className="text-right text-xs text-cg-ink/60">
                {forecast.workersAssumed} workers assumed
                <br />
                for {forecast.forDate}
              </p>
            </div>

            <ul className="mt-3 space-y-2">
              {forecast.fields?.map((f) => (
                <li
                  key={f.zoneId}
                  className="rounded-xl border border-[#13483B59] bg-white p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-cg-ink">{f.zoneName}</span>
                    <span className="text-sm font-extrabold text-cg-ink">
                      {f.expectedKg == null ? (
                        <span className="text-xs font-semibold text-cg-ink/40">
                          no forecast
                        </span>
                      ) : (
                        `${kg(f.expectedKg)} kg`
                      )}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-cg-ink/55">{f.note}</p>
                  {f.expectedKg != null && f.targetKgPerDay ? (
                    <p className="mt-0.5 text-[11px] text-cg-ink/40">
                      target {kg(f.targetKgPerDay)} kg
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>

            {/* The assumptions, printed. A forecast without them is a number
                nobody can argue with, which is worse than no forecast. */}
            {forecast.basis?.length > 0 && (
              <div className="mt-4 rounded-xl bg-cg-lime/30 px-4 py-3">
                <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-cg-ink/60">
                  <LuLeaf size={12} /> What this rests on
                </p>
                <ul className="mt-1.5 space-y-1">
                  {forecast.basis.map((b, i) => (
                    <li key={i} className="text-[11px] leading-snug text-cg-ink/70">
                      · {b}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
