import { useCallback, useEffect, useState } from "react";
import {
  LuShieldAlert,
  LuSparkles,
  LuChevronDown,
  LuChevronRight,
  LuInfo,
  LuTrophy,
  LuClock,
  LuCircleX,
  LuPlane,
  LuFileWarning,
} from "react-icons/lu";
import api from "../../api/client";
import { apiError } from "../../lib/apiError";
import { BTN_DARK } from "../../lib/ui";

// The two AI features on the attendance page.
//
// PROXY FLAGS load with the day and are patterns in the register — never
// accusations. Every flag is shown WITH its innocent explanation, because every
// rule has one, and a supervisor who is shown only the suspicion will act on
// the suspicion. Nothing here changes a mark or affects anyone's pay.
//
// MONTH REVIEW runs on a button press because it calls a language model, which
// costs time and money. The rankings are counted on the server; the model only
// writes the covering paragraph, so if it is unavailable the lists still appear.

const CARD_STROKE = "ring-1 ring-[#13483B59]";

const SEVERITY = {
  HIGH: "bg-rose-100 text-rose-700 ring-1 ring-rose-200",
  MED: "bg-amber-100 text-amber-800 ring-1 ring-amber-200",
  LOW: "bg-sky-100 text-sky-700 ring-1 ring-sky-200",
};

const LIST_META = {
  mostPresent: { icon: LuTrophy, title: "Most reliable", tone: "text-emerald-600" },
  persistentlyLate: { icon: LuClock, title: "Persistently late", tone: "text-amber-600" },
  excessiveAbsence: { icon: LuCircleX, title: "Frequently absent", tone: "text-rose-600" },
  excessiveLeave: { icon: LuPlane, title: "Heavy leave", tone: "text-sky-600" },
  unmarkedHeavy: { icon: LuFileWarning, title: "Days never marked", tone: "text-amber-700" },
};

const thisMonth = () => new Date().toISOString().slice(0, 7);

function Flag({ flag }) {
  const [open, setOpen] = useState(false);
  return (
    <li className={`rounded-xl bg-white p-3 ${CARD_STROKE}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start justify-between gap-2 text-left"
      >
        <span className="flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                SEVERITY[flag.severity] || SEVERITY.LOW
              }`}
            >
              {flag.severity}
            </span>
            <span className="text-sm font-bold text-cg-ink">{flag.title}</span>
            {flag.zoneName ? (
              <span className="text-xs text-cg-ink/50">{flag.zoneName}</span>
            ) : null}
          </span>
          <span className="mt-1 block text-xs text-cg-ink/60">{flag.evidence}</span>
        </span>
        {open ? (
          <LuChevronDown size={15} className="mt-1 shrink-0 text-cg-ink/40" />
        ) : (
          <LuChevronRight size={15} className="mt-1 shrink-0 text-cg-ink/40" />
        )}
      </button>

      {open && (
        <div className="mt-3 border-t border-[#13483B]/10 pt-3">
          {flag.workers?.length > 0 && (
            <p className="text-xs text-cg-ink">
              <span className="font-bold">Workers: </span>
              {flag.workers.map((w) => w.name).join(", ")}
            </p>
          )}
          {/* Shown every time the flag is opened, never behind another click.
              A flag without its counter-explanation is an accusation. */}
          <p className="mt-2 flex items-start gap-2 rounded-lg bg-cg-lime/40 px-3 py-2 text-xs text-cg-ink">
            <LuInfo size={14} className="mt-0.5 shrink-0 text-cg-green" />
            <span>
              <span className="font-bold">This may be nothing. </span>
              {flag.innocentExplanation}
            </span>
          </p>
        </div>
      )}
    </li>
  );
}

function ReviewList({ which, rows }) {
  const meta = LIST_META[which];
  const Icon = meta.icon;
  return (
    <div className={`rounded-xl bg-white p-4 ${CARD_STROKE}`}>
      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-cg-ink/60">
        <Icon size={15} className={meta.tone} />
        {meta.title}
      </p>
      {rows.length === 0 ? (
        <p className="mt-2 text-xs text-cg-ink/40">Nobody on this list.</p>
      ) : (
        <ol className="mt-2 space-y-1.5">
          {rows.map((r, i) => (
            <li key={r.workerId} className="flex items-start gap-2 text-sm">
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-cg-lime text-[10px] font-bold text-cg-green">
                {i + 1}
              </span>
              <span>
                <span className="font-semibold text-cg-ink">{r.name}</span>
                <span className="block text-xs text-cg-ink/50">{r.note}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export default function AttendanceAiPanel({ date, marked = 0 }) {
  const [flags, setFlags] = useState([]);
  const [flagsErr, setFlagsErr] = useState("");
  const [review, setReview] = useState(null);
  const [reviewing, setReviewing] = useState(false);
  const [reviewErr, setReviewErr] = useState("");
  const [month, setMonth] = useState(thisMonth);

  const loadFlags = useCallback(async () => {
    try {
      const { data } = await api.get("/attendance/flags", { params: { date } });
      setFlags(data || []);
      setFlagsErr("");
    } catch (err) {
      setFlags([]);
      setFlagsErr(apiError(err, "Could not check the register for unusual patterns."));
    }
  }, [date]);

  useEffect(() => {
    loadFlags();
  }, [loadFlags]);

  const runReview = async () => {
    setReviewing(true);
    setReviewErr("");
    try {
      const { data } = await api.post("/attendance/review", null, { params: { month } });
      setReview(data);
    } catch (err) {
      setReviewErr(apiError(err, "Could not review that month."));
    } finally {
      setReviewing(false);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {/* Proxy-attendance flags */}
      <div className={`rounded-2xl bg-white p-5 shadow ${CARD_STROKE}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-extrabold text-cg-ink">
            <LuShieldAlert size={18} className="text-cg-green" />
            Register checks
          </h2>
          <span className="rounded-full bg-cg-lime px-2.5 py-1 text-[10px] font-bold text-cg-green">
            {flags.length} to review
          </span>
        </div>
        <p className="mt-1 text-xs text-cg-ink/50">
          Patterns worth a second look for {date}. These are not accusations —
          each one opens with the ordinary explanation for it.
        </p>

        {flagsErr && (
          <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {flagsErr}
          </p>
        )}

        {flags.length === 0 && !flagsErr ? (
          <div className="mt-4 grid min-h-[140px] place-items-center rounded-xl border border-dashed border-[#13483B59] px-4 text-center text-sm text-cg-ink/50">
            {/* An empty register and a clean register look identical from the
                flag list alone. Saying which one it is matters: one means
                nothing is wrong, the other means nothing has been checked. */}
            {marked === 0 ? (
              <span>
                Nothing to check yet — no attendance has been saved for this
                day.
                <span className="mt-1 block text-xs text-cg-ink/40">
                  Mark the register and save, then the checks run against it.
                </span>
              </span>
            ) : (
              <span>
                Nothing unusual in this register.
                <span className="mt-1 block text-xs text-cg-ink/40">
                  {marked} marks checked against 4 rules.
                </span>
              </span>
            )}
          </div>
        ) : (
          <ul className="mt-4 space-y-2">
            {flags.map((f, i) => (
              <Flag key={`${f.rule}-${i}`} flag={f} />
            ))}
          </ul>
        )}
      </div>

      {/* Month review */}
      <div className={`rounded-2xl bg-white p-5 shadow ${CARD_STROKE}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-extrabold text-cg-ink">
            <LuSparkles size={18} className="text-cg-green" />
            Review the month
          </h2>
          <div className="flex items-center gap-2">
            <input
              type="month"
              value={month}
              max={thisMonth()}
              onChange={(e) => setMonth(e.target.value)}
              className="rounded-lg border border-[#13483B59] px-2 py-1.5 text-xs outline-none focus:border-cg-green"
            />
            <button
              type="button"
              onClick={runReview}
              disabled={reviewing}
              className={`${BTN_DARK} !px-3 !py-1.5 !text-xs`}
            >
              {reviewing ? "Reviewing…" : "Run review"}
            </button>
          </div>
        </div>
        <p className="mt-1 text-xs text-cg-ink/50">
          Who turned up, who is persistently late, and whose days were never
          marked. Counted from the register, not estimated.
        </p>

        {reviewErr && (
          <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {reviewErr}
          </p>
        )}

        {!review && !reviewErr ? (
          <div className="mt-4 grid min-h-[140px] place-items-center rounded-xl border border-dashed border-[#13483B59] px-4 text-center text-sm text-cg-ink/50">
            Pick a month and press Run review.
          </div>
        ) : review ? (
          <div className="mt-4 space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-cg-ink/50">
              {review.workersConsidered} workers · {review.workingDays} days
            </p>

            {review.narrative && (
              <p className="whitespace-pre-wrap rounded-xl bg-cg-lime/40 px-4 py-3 text-sm leading-relaxed text-cg-ink">
                {review.narrative}
              </p>
            )}
            {/* The lists are the deliverable; the paragraph is a courtesy. Say
                so plainly rather than leaving a silent gap. */}
            {review.narrativeError && (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
                {review.narrativeError}
              </p>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <ReviewList which="mostPresent" rows={review.mostPresent || []} />
              <ReviewList which="persistentlyLate" rows={review.persistentlyLate || []} />
              <ReviewList which="excessiveAbsence" rows={review.excessiveAbsence || []} />
              <ReviewList which="excessiveLeave" rows={review.excessiveLeave || []} />
            </div>
            <ReviewList which="unmarkedHeavy" rows={review.unmarkedHeavy || []} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
