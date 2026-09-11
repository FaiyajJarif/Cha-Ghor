import { useEffect, useState } from "react";
import { LuBrain, LuTriangleAlert } from "react-icons/lu";
import api from "../../api/client";
import { apiError } from "../../lib/apiError";

// How the two vision models are actually doing, from readings a supervisor has
// ruled on.
//
// ============================================================================
// WHY THIS PANEL EXISTS
// ============================================================================
//
// GET /leaf/vision/accuracy was the ONLY endpoint in the whole application with
// no frontend caller. The estate measured its grader honestly -- 56.7% against
// a 51% always-guess-A baseline, p = 0.15, indistinguishable from guessing --
// and then had nowhere to show it. An accuracy figure nobody can see is not a
// safeguard, it is a file.
//
// Showing it is the stronger position, not the weaker one: it is what justifies
// the design decision that the grader SUGGESTS and never pre-fills, and it is
// the first thing an examiner should be handed rather than have to find.
//
// TWO FIGURES, NEVER ONE. Until V41 both models wrote the same subject_type, so
// a single pooled percentage mixed a chance-level grader with a health detector
// that has never been measured. The panel deliberately has no combined number.

const CARDS = [
  {
    key: "leafGrade",
    title: "Leaf grade suggester",
    what: "Suggests A / B / C from a photo of the bulk on the scale.",
    // The stake, stated on screen. This is why the number matters.
    stake: "Grade-A kilos carry a ৳1/kg bonus, so a wrong grade is money.",
  },
  {
    key: "leafHealth",
    title: "Leaf health detector",
    what: "Scores leaf health and flags possible disease from a photo.",
    stake: "Advisory only — it never changes a wage or a field's condition.",
  },
];

function pct(v) {
  return v == null ? "—" : `${v}%`;
}

// Colour follows the EVIDENCE, not the score. An unmeasured model is grey, not
// green: "no data" must never look like "doing fine".
function tone(m) {
  if (!m || !m.enough) return "bg-slate-100 text-slate-600";
  if (m.accuracyPct == null) return "bg-slate-100 text-slate-600";
  if (m.accuracyPct >= 80) return "bg-emerald-100 text-emerald-700";
  if (m.accuracyPct >= 60) return "bg-amber-100 text-amber-800";
  return "bg-rose-100 text-rose-700";
}

export default function ModelAccuracyPanel() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    api
      .get("/leaf/vision/accuracy")
      .then(({ data: d }) => alive && setData(d))
      .catch((err) => alive && setError(apiError(err, "Could not read model accuracy.")))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <section className="overflow-hidden rounded-2xl bg-white shadow ring-1 ring-cg-green/10">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-[#C0F28B] px-4 py-3 sm:px-5">
        <h2 className="flex items-center gap-2 font-bold text-cg-ink">
          <LuBrain size={18} /> How the models are performing
        </h2>
        <span className="text-xs font-semibold text-cg-ink/70">
          measured, not claimed
        </span>
      </div>

      <div className="p-4 sm:p-5">
        {error && (
          <p className="mb-4 rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-700">
            {error}
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
          {CARDS.map(({ key, title, what, stake }) => {
            const m = data?.[key];
            return (
              <div
                key={key}
                className="min-w-0 rounded-2xl bg-[#F4FFE9] p-4 ring-1 ring-cg-green/10"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 text-sm font-bold text-cg-ink">{title}</p>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${tone(m)}`}
                  >
                    {loading ? "…" : pct(m?.accuracyPct)}
                  </span>
                </div>

                <p className="mt-1 text-[11px] leading-snug text-cg-ink/55">{what}</p>

                {/* The sample size sits WITH the number, not in a footnote.
                    CLAUDE.md §9.5: a statistical claim states its sample or
                    says it was not measured. */}
                <p className="mt-2 text-xs font-semibold text-cg-ink/70">
                  {loading
                    ? "Loading…"
                    : m?.sample
                      ? `n = ${m.sample} checked readings`
                      : "not measured yet"}
                </p>

                {!loading && m && !m.enough && (
                  <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] leading-snug text-amber-900">
                    <LuTriangleAlert size={13} className="mt-0.5 shrink-0" />
                    <span>{m.note}</span>
                  </p>
                )}

                {!loading && m?.enough && (
                  <p className="mt-2 text-[11px] leading-snug text-cg-ink/50">
                    {m.note}
                  </p>
                )}

                <p className="mt-2 text-[11px] leading-snug text-cg-ink/45">{stake}</p>
              </div>
            );
          })}
        </div>

        <p className="mt-4 text-[11px] leading-snug text-cg-ink/50">
          Counted from readings a supervisor actually agreed or disagreed with.
          Refusals are excluded rather than scored as wrong. There is no combined
          figure on purpose — these are two different models, and one number for
          both would describe neither.
        </p>
      </div>
    </section>
  );
}
