import { useCallback, useEffect, useState } from "react";
import { LuCalendarDays, LuRefreshCw, LuPrinter } from "react-icons/lu";
// The client lives in api/, not lib/, and apiError is a NAMED export. Both are
// easy to guess wrong; these paths match what Payroll.jsx already imports.
import api from "../../api/client";
import { apiError } from "../../lib/apiError";
import { BTN_GHOST } from "../../lib/ui";
import RecordCard, { CARD_PILL, CARD_CHIP } from "./RecordCard";

// ===========================================================================
// THE DAY SHEET. One day, every worker, what they earned and where it went.
// ===========================================================================
//
// This is the payslip that matches how a tea estate actually works. The
// monthly statement is a summary stacked on top of these days.
//
// IT DISPLAYS SETTLEMENT ROWS AND COMPUTES NOTHING. Every figure came from
// daily_settlement, written when the day was settled, and is the same number
// that moved loan.repaid. The only arithmetic here is the column totals, which
// are sums of what the server already sent -- and the server sends its own
// totals too, so the footer uses those rather than a second addition that could
// drift from them.
//
// An unsettled day shows an empty state, NOT rows of zeroes. "This worker
// earned nothing" and "this day has not been settled yet" are different
// sentences, and printing the first when the second is true would hand a worker
// a slip saying he did no work.

function taka(n) {
  return (
    "৳" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })
  );
}

function yesterdayISO() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  // Local date, not toISOString() -- that converts to UTC first and hands back
  // the wrong day for anyone east of Greenwich, which is everyone here.
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function DailyPaySheet() {
  const [date, setDate] = useState(yesterdayISO);
  const [sheet, setSheet] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Declared with useCallback ABOVE the useEffect that lists it -- a const
  // below would throw "Cannot access before initialization" and blank the page.
  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const { data } = await api.get("/settlement/day-sheet", {
        params: { date },
      });
      setSheet(data);
    } catch (err) {
      setError(apiError(err, "Could not load the day sheet."));
      setSheet(null);
    } finally {
      setBusy(false);
    }
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  const slips = sheet?.slips || [];

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white p-5 shadow ring-1 ring-cg-green/10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <label className="block text-xs font-semibold uppercase tracking-wide text-cg-ink/55">
              Day
            </label>
            <div className="mt-1 flex items-center gap-2">
              <LuCalendarDays size={16} className="shrink-0 text-cg-green" />
              <input
                type="date"
                value={date}
                max={yesterdayISO()}
                onChange={(e) => setDate(e.target.value)}
                className="rounded-lg border border-cg-green/20 bg-cg-lime/30 px-3 py-2 text-sm outline-none focus:border-cg-green"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={load} className={BTN_GHOST} disabled={busy}>
              <LuRefreshCw size={16} /> {busy ? "Loading…" : "Refresh"}
            </button>
            <button
              onClick={() => window.print()}
              className={BTN_GHOST}
              disabled={busy || slips.length === 0}
            >
              <LuPrinter size={16} /> Print
            </button>
          </div>
        </div>

        {error && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {/* Totals for the day. Straight from the server, not re-added here. */}
        {sheet?.settled && (
          <div className="mt-4 grid gap-2 sm:grid-cols-5">
            <Figure label="Workers" value={String(sheet.workerCount)} plain />
            <Figure label="Earned" value={taka(sheet.totalEarned)} />
            <Figure label="To loan" value={taka(sheet.totalToLoan)} />
            <Figure label="To advance" value={taka(sheet.totalToAdvance)} />
            <Figure label="Payable" value={taka(sheet.totalPayable)} emphasis />
          </div>
        )}
      </div>

      {/* ---- the slips ---- */}
      <div className="overflow-hidden rounded-2xl bg-white shadow ring-1 ring-cg-green/10">
        <div className="bg-[#C0F28B] px-4 py-3">
          <h2 className="font-bold text-cg-ink">
            Daily pay — {sheet?.date || date}
          </h2>
        </div>

        {!busy && slips.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm font-semibold text-cg-ink/70">
              This day has not been settled yet.
            </p>
            <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-cg-ink/50">
              Nothing is shown rather than rows of zeroes — a zero would say
              these workers earned nothing, which is not what we know. Settle the
              day from the Daily settlement card, then come back.
            </p>
          </div>
        ) : (
          <ul>
            {slips.map((s) => (
              <RecordCard
                key={s.workerId}
                title={s.workerName}
                meta={[s.nameBn, s.jobRole].filter(Boolean).join(" • ")}
                // `pills` is a ReactNode, not a list of objects -- RecordCard
                // renders it straight into JSX. Passing an array of {label,
                // value} throws "Objects are not valid as a React child" and
                // blanks the whole tab.
                pills={
                  <span className={`${CARD_PILL} bg-cg-lime text-cg-green`}>
                    {taka(s.payable)} payable
                  </span>
                }
                footer={
                  <>
                    <span className={`${CARD_CHIP} bg-cg-lime/40 text-cg-ink/75`}>
                      Earned {taka(s.earned)}
                    </span>
                    {/* Deduction chips appear ONLY when something was taken.
                        A row of "Loan ৳0" chips on every worker trains the eye
                        to skip the line where it finally is not zero. */}
                    {Number(s.toLoan) > 0 && (
                      <span className={`${CARD_CHIP} bg-amber-50 text-amber-900`}>
                        Loan −{taka(s.toLoan)}
                      </span>
                    )}
                    {Number(s.toAdvance) > 0 && (
                      <span className={`${CARD_CHIP} bg-amber-50 text-amber-900`}>
                        Advance −{taka(s.toAdvance)}
                      </span>
                    )}
                    {Number(s.toOverdraw) > 0 && (
                      <span className={`${CARD_CHIP} bg-amber-50 text-amber-900`}>
                        Overdraw −{taka(s.toOverdraw)}
                      </span>
                    )}
                  </>
                }
              />
            ))}
          </ul>
        )}

        {slips.length > 0 && (
          <div className="bg-[#D3FFAC] px-5 py-3 text-sm text-cg-ink/75">
            {/* Says out loud what the day sheet is, because the difference
                between "you were paid" and "this is what you are owed" is the
                thing workers ask about. */}
            No cash moved on this sheet. These are the amounts workers may
            withdraw; the loan and advance columns were taken before that.
          </div>
        )}
      </div>
    </div>
  );
}

function Figure({ label, value, emphasis = false, plain = false }) {
  return (
    <div
      className={
        "min-w-0 rounded-lg px-3 py-2 " +
        (emphasis ? "bg-cg-lime/50 ring-1 ring-cg-green/20" : "bg-cg-lime/20")
      }
    >
      <p className="truncate text-[11px] text-cg-ink/55">{label}</p>
      <p
        className={
          "mt-0.5 truncate font-bold " +
          (plain ? "text-cg-ink/80" : emphasis ? "text-cg-ink" : "text-cg-ink/80")
        }
      >
        {value}
      </p>
    </div>
  );
}
