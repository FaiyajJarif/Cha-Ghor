import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  LuX,
  LuCircleCheck,
  LuTriangleAlert,
  LuClock,
  LuCircleX,
  LuInfo,
  LuLock,
} from "react-icons/lu";
import api from "../../api/client";
import { apiError } from "../../lib/apiError";
import { BTN_DARK, BTN_GHOST } from "../../lib/ui";

// The evidence behind one payslip.
//
// WHY THIS EXISTS
//   "Review" was a bare status flip: draft -> review, with nothing shown. An
//   admin saw two aggregate numbers in the table — Present and Weight (kg) —
//   and was asked to move a payslip toward payment on that basis. There was
//   nothing to review, which is exactly the objection that produced this file.
//
//   CHA_GHOR_IDEA.md §1 is that a worker "cannot verify their own kilos or
//   their own arithmetic". The same was true of the person approving the money.
//
// WHAT IT SHOWS
//   The register day by day, the weigh-ins day by day, and — the part that
//   matters — whether those two agree with what the payslip claims. A mismatch
//   is stated in numbers, not implied by a colour.
//
// THE CROSS-CHECK IS THE POINT.
//   `presentDays` and `totalLeafKg` are stored ON the payslip, computed when it
//   was generated. The register and the weigh-in table are the source. If leaf
//   was recorded or amended after the payslip was generated, the two diverge —
//   and until now nothing on any screen would have shown that. The payslip is
//   not wrong in that case; it is STALE, and it needs regenerating. Those are
//   different problems and the wording says which.

const DAY_ICON = {
  present: { icon: LuCircleCheck, tone: "text-emerald-600", label: "Present" },
  late: { icon: LuClock, tone: "text-amber-600", label: "Late" },
  absent: { icon: LuCircleX, tone: "text-rose-600", label: "Absent" },
  leave: { icon: LuCircleX, tone: "text-cg-ink/35", label: "Leave" },
};

const taka = (n) =>
  "৳" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const kg = (n) => Number(n || 0).toFixed(1);

function Row({ label, value, hint }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-cg-green/10 py-2 last:border-0">
      <div>
        <p className="text-sm text-cg-ink">{label}</p>
        {hint ? <p className="text-[11px] text-cg-ink/45">{hint}</p> : null}
      </div>
      <p className="shrink-0 text-sm font-bold tabular-nums text-cg-ink">{value}</p>
    </div>
  );
}

export default function PayslipReviewDrawer({ row, onClose, onAdvance, busy }) {
  const [att, setAtt] = useState(null);
  const [leaf, setLeaf] = useState([]);
  const [daily, setDaily] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!row) return;
    setLoading(true);
    setError("");
    try {
      // The attendance endpoint takes a MONTH (yyyy-MM), not a range. For the
      // default period — a whole calendar month — they are the same window. For
      // a custom range it shows the month containing periodStart, which is
      // stated on screen rather than quietly assumed.
      const month = String(row.periodStart || "").slice(0, 7);
      const [a, l, d] = await Promise.all([
        api
          .get(`/attendance/worker/${row.workerId}`, { params: { month } })
          .catch(() => ({ data: null })),
        api
          .get(`/leaf/worker/${row.workerId}`, {
            params: { from: row.periodStart, to: row.periodEnd },
          })
          .catch(() => ({ data: [] })),
        // The SAME computation the worker's own screen runs. Abdul's phone
        // showed "11 August · 30 kg · earned ৳235 · advance cut ৳215" and the
        // office had no way to see it, so a dispute could not be settled here.
        api.get(`/payroll/${row.id}/daily`).catch(() => ({ data: null })),
      ]);
      setAtt(a.data);
      setLeaf(l.data || []);
      setDaily(d.data);
    } catch (err) {
      setError(apiError(err, "Could not load the evidence for this payslip."));
    } finally {
      setLoading(false);
    }
  }, [row]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!row) return null;

  // What the REGISTER says, versus what the payslip stored when it was built.
  const registerPayable = att ? Number(att.payableDays || 0) : null;
  const leafTotal = leaf.reduce((s, r) => s + Number(r.weightKg || 0), 0);
  const slipDays = Number(row.presentDays || 0);
  const slipKg = Number(row.totalLeafKg || 0);

  // The rows the table actually shows, hoisted so the summary line above the
  // table counts exactly what is below it. Counting the unfiltered array would
  // make the summary say "3 of 31 days" for a month with three working days.
  const shownDays = (daily?.days || []).filter(
    (d) => d.status || Number(d.earned) > 0
  );
  const settledCount = shownDays.filter((d) => d.settled).length;
  const mismatchCount = shownDays.filter((d) => d.mismatch).length;

  const daysMatch = registerPayable === null || registerPayable === slipDays;
  // A tenth of a kilo of float drift is not a discrepancy worth alarming over.
  const kgMatch = Math.abs(leafTotal - slipKg) < 0.05;
  const stale = !daysMatch || !kgMatch;

  const monthShown = String(row.periodStart || "").slice(0, 7);
  const wholeMonth =
    String(row.periodStart || "").slice(8) === "01" &&
    String(row.periodEnd || "").slice(0, 7) === monthShown;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[1200] bg-black/40" onClick={onClose} aria-hidden />
      <aside
        className="fixed inset-y-0 right-0 z-[1210] flex w-full max-w-2xl flex-col bg-white shadow-2xl"
        role="dialog"
        aria-label={`Payslip review for ${row.workerName || "worker"}`}
      >
        <div className="flex items-start justify-between gap-4 bg-cg-dark px-6 py-5 text-white">
          <div>
            <h3 className="text-lg font-extrabold">{row.workerName || `Worker #${row.workerId}`}</h3>
            <p className="mt-0.5 text-sm text-white/70">
              {row.periodStart} to {row.periodEnd}
              {row.zoneName ? ` · ${row.zoneName}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
          >
            <LuX size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {error && (
            <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}

          {/* THE CHECK, first. Anything else is detail. */}
          <div
            className={`mb-5 rounded-xl px-4 py-3 ring-1 ${
              stale
                ? "bg-amber-50 text-amber-900 ring-amber-200"
                : "bg-emerald-50 text-emerald-900 ring-emerald-200"
            }`}
          >
            <p className="flex items-center gap-2 text-sm font-bold">
              {stale ? <LuTriangleAlert size={16} /> : <LuCircleCheck size={16} />}
              {stale
                ? "This payslip no longer matches the register"
                : "Payslip matches the register"}
            </p>
            {stale ? (
              <ul className="mt-1.5 space-y-0.5 text-xs">
                {!daysMatch && (
                  <li>
                    Payable days: payslip says <b>{slipDays}</b>, register says{" "}
                    <b>{registerPayable}</b>
                  </li>
                )}
                {!kgMatch && (
                  <li>
                    Leaf: payslip says <b>{kg(slipKg)} kg</b>, weigh-ins total{" "}
                    <b>{kg(leafTotal)} kg</b>
                  </li>
                )}
                {/* Say what to DO about it. A stale payslip is not a wrong one. */}
                <li className="pt-1 text-amber-800">
                  Leaf or attendance changed after this payslip was generated.
                  Re-run “Apply to Pay Run” to rebuild it before approving.
                </li>
              </ul>
            ) : (
              <p className="mt-0.5 text-xs">
                {slipDays} payable days and {kg(slipKg)} kg, both confirmed against
                the source records.
              </p>
            )}
          </div>

          {loading ? (
            <p className="py-10 text-center text-sm text-cg-ink/50">{"Loading evidence…"}</p>
          ) : (
            <>
              {/* The wage lines, in the order the engine computes them. */}
              <h4 className="mb-1 text-xs font-bold uppercase tracking-wide text-cg-ink/50">
                How this was calculated
              </h4>
              <div className="mb-5 rounded-xl bg-cg-lime/20 px-4 py-2">
                <Row label="Base wage" value={taka(row.baseAmount)} hint={`${slipDays} payable days`} />
                <Row label="Surplus (leaf above quota)" value={taka(row.surplusAmount)} hint="Measured per day, then summed" />
                <Row label="Grade-A bonus" value={taka(row.gradeBonus)} />
                <Row label="Gross" value={taka(row.grossAmount)} />
                <Row label="Loan deduction" value={"− " + taka(row.loanDeduction)} />
                <Row label="Advance recovery" value={"− " + taka(row.advanceRecovery)} />
                <Row label="Other deduction" value={"− " + taka(row.otherDeduction)} />
                <Row label="Net payable" value={taka(row.netPayable)} />
              </div>

              {/* Attendance, day by day */}
              <h4 className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-cg-ink/50">
                Attendance register
                {!wholeMonth && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold normal-case text-amber-800">
                    <LuInfo size={10} /> showing all of {monthShown}
                  </span>
                )}
              </h4>
              {!att || !att.days?.length ? (
                <p className="mb-5 rounded-xl bg-cg-lime/20 px-4 py-4 text-sm text-cg-ink/55">
                  No register entries for this worker in {monthShown}.
                </p>
              ) : (
                <div className="mb-5 rounded-xl bg-cg-lime/20 p-3">
                  <div className="flex flex-wrap gap-1">
                    {att.days.map((d) => {
                      const m = DAY_ICON[d.status] || null;
                      const Icon = m?.icon;
                      return (
                        <span
                          key={d.date}
                          title={`${d.date} — ${m?.label || "not marked"}${
                            d.lateMinutes ? ` (${d.lateMinutes} min late)` : ""
                          }`}
                          className={`inline-flex h-7 w-9 items-center justify-center gap-0.5 rounded-md bg-white text-[10px] font-bold ${
                            m?.tone || "text-cg-ink/25"
                          }`}
                        >
                          {String(d.date).slice(8)}
                          {Icon ? <Icon size={9} /> : null}
                        </span>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-[11px] text-cg-ink/55">
                    {att.present} present · {att.late} late · {att.absent} absent ·{" "}
                    {att.onLeave} leave · <b>{att.notMarked} never marked</b>
                  </p>
                </div>
              )}

              {/* Day by day — earnings and what each debt took. */}
              <h4 className="mb-1 text-xs font-bold uppercase tracking-wide text-cg-ink/50">
                Day by day
              </h4>
              {/* SAY WHETHER THIS HAS HAPPENED — PER DAY, NOT PER PAYSLIP.
                  This used to read the payslip's own status: paid meant
                  "settled", anything else meant "planned". That was true when
                  markPaid moved the money. It no longer does. Days are settled
                  nightly, so a Draft payslip can be almost entirely settled and
                  a Paid one can contain days that never were. Each row now
                  carries its own `settled` flag from daily_settlement. */}
              <p className="mb-2 text-[11px] text-cg-ink/55">
                {settledCount === 0
                  ? "Planned. None of these days has been settled yet, so no loan or advance balance has moved."
                  : settledCount === shownDays.length
                  ? "Settled. Every day here has been recorded and the loan and advance balances have already moved."
                  : `Partly settled — ${settledCount} of ${shownDays.length} days. Only the settled rows have moved a balance.`}
              </p>

              {/* A DAY WHOSE RECORD DISAGREES WITH TODAY'S DATA. Attendance or
                  leaf was edited after settlement, so what was deducted is not
                  what the current figures say should have been. This is the one
                  thing in the drawer an admin must not miss: it is a real
                  discrepancy in a worker's balance, not a rounding artefact. */}
              {mismatchCount > 0 && (
                <p className="mb-2 rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-900 ring-1 ring-amber-200">
                  {mismatchCount} settled {mismatchCount === 1 ? "day has" : "days have"} been
                  edited since settlement. What was actually deducted differs from what these
                  figures now show — the amounts recorded at settlement are in the tooltip on
                  each flagged row, and the worker&rsquo;s balance follows those, not these.
                </p>
              )}
              {!daily?.days?.length ? (
                <p className="mb-5 rounded-xl bg-cg-lime/20 px-4 py-4 text-sm text-cg-ink/55">
                  No working days in this period yet.
                </p>
              ) : (
                <div className="mb-2 overflow-hidden rounded-xl ring-1 ring-cg-green/15">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-cg-lime/40 text-[11px] uppercase tracking-wide text-cg-ink/60">
                      <tr>
                        <th className="px-3 py-2 font-bold">Date</th>
                        <th className="px-3 py-2 font-bold">Status</th>
                        <th className="px-3 py-2 text-right font-bold">kg</th>
                        <th className="px-3 py-2 text-right font-bold">Earned</th>
                        <th className="px-3 py-2 text-right font-bold">Loan</th>
                        <th className="px-3 py-2 text-right font-bold">Advance</th>
                        <th className="px-3 py-2 text-right font-bold">Worker gets</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-cg-green/10">
                      {shownDays.map((d) => (
                          <tr key={d.date} className={d.mismatch ? "bg-amber-50" : undefined}>
                            <td className="px-3 py-2 text-cg-ink">
                              <span className="flex items-center gap-1.5">
                                {d.date}
                                {d.settled ? (
                                  <LuLock
                                    size={11}
                                    className="shrink-0 text-cg-ink/40"
                                    title={
                                      d.mismatch
                                        ? `Settled, but edited since. Recorded: earned ${taka(
                                            d.settledEarned
                                          )}, loan ${taka(d.settledToLoan)}, advance ${taka(
                                            d.settledToAdvance
                                          )}, worker ${taka(d.settledPayable)}.`
                                        : "Settled — these amounts have moved."
                                    }
                                  />
                                ) : (
                                  <span
                                    className="shrink-0 text-[10px] font-semibold text-amber-700/70"
                                    title="Not settled yet. Nothing has moved for this day."
                                  >
                                    pending
                                  </span>
                                )}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-cg-ink/70">
                              {DAY_ICON[d.status]?.label || "—"}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-cg-ink/70">
                              {Number(d.kg) > 0 ? kg(d.kg) : "—"}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-cg-ink">
                              {taka(d.earned)}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-cg-ink/70">
                              {Number(d.toLoan) > 0 ? "− " + taka(d.toLoan) : "—"}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-cg-ink/70">
                              {Number(d.toAdvance) > 0 ? "− " + taka(d.toAdvance) : "—"}
                            </td>
                            <td className="px-3 py-2 text-right font-bold tabular-nums text-cg-ink">
                              {taka(d.payable)}
                            </td>
                          </tr>
                        ))}
                      <tr className="bg-cg-lime/20">
                        <td className="px-3 py-2 font-bold text-cg-ink" colSpan={3}>
                          Total
                        </td>
                        <td className="px-3 py-2 text-right font-extrabold tabular-nums">
                          {taka(daily.totalEarned)}
                        </td>
                        <td className="px-3 py-2 text-right font-extrabold tabular-nums">
                          − {taka(daily.totalToLoan)}
                        </td>
                        <td className="px-3 py-2 text-right font-extrabold tabular-nums">
                          − {taka(daily.totalToAdvance)}
                        </td>
                        <td className="px-3 py-2 text-right font-extrabold tabular-nums">
                          {taka(daily.totalPayable)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              {/* WHY the loan cut is what it is. The rate lives on each LOAN,
                  not on the estate config — which is why two workers can be
                  charged different daily amounts. */}
              {daily?.loans?.length ? (
                <p className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-cg-lime/20 px-3 py-2 text-[11px] text-cg-ink/70">
                  <LuInfo size={12} />
                  {daily.loans.map((l) => (
                    <span key={l.id}>
                      <b>{l.reference || `Loan #${l.id}`}</b>: {taka(l.perDay)}/working
                      day, {taka(l.owed)} outstanding
                    </span>
                  ))}
                </p>
              ) : null}

              {/* Weigh-ins, day by day */}
              <h4 className="mb-1 text-xs font-bold uppercase tracking-wide text-cg-ink/50">
                Weigh-ins ({leaf.length})
              </h4>
              {leaf.length === 0 ? (
                <p className="rounded-xl bg-cg-lime/20 px-4 py-4 text-sm text-cg-ink/55">
                  No leaf recorded for this worker in the period.
                </p>
              ) : (
                <div className="overflow-hidden rounded-xl ring-1 ring-cg-green/15">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-cg-lime/40 text-[11px] uppercase tracking-wide text-cg-ink/60">
                      <tr>
                        <th className="px-3 py-2 font-bold">Date</th>
                        <th className="px-3 py-2 font-bold">Field</th>
                        <th className="px-3 py-2 text-right font-bold">kg</th>
                        <th className="px-3 py-2 font-bold">Grade</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-cg-green/10">
                      {leaf.map((r) => (
                        <tr key={r.id}>
                          <td className="px-3 py-2 text-cg-ink">{r.date}</td>
                          <td className="px-3 py-2 text-cg-ink/70">{r.zone || "—"}</td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums text-cg-ink">
                            {kg(r.weightKg)}
                          </td>
                          <td className="px-3 py-2 text-cg-ink/70">{r.grade || "—"}</td>
                        </tr>
                      ))}
                      <tr className="bg-cg-lime/20">
                        <td className="px-3 py-2 font-bold text-cg-ink" colSpan={2}>
                          Total
                        </td>
                        <td className="px-3 py-2 text-right font-extrabold tabular-nums text-cg-ink">
                          {kg(leafTotal)}
                        </td>
                        <td />
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-cg-green/10 px-6 py-4">
          <button type="button" className={BTN_GHOST} onClick={onClose}>
            Close
          </button>
          {/* The transition now happens AFTER the evidence has been on screen,
              which is the whole point of the change. */}
          {row.status === "draft" && (
            <button
              type="button"
              className={BTN_DARK}
              disabled={busy}
              onClick={() => onAdvance?.(row, "review", "Could not submit for review.")}
            >
              Submit for review
            </button>
          )}
          {row.status === "review" && (
            <button
              type="button"
              className={BTN_DARK}
              disabled={busy}
              onClick={() => onAdvance?.(row, "approve", "Could not approve.")}
            >
              <LuCircleCheck size={15} /> Approve
            </button>
          )}
        </div>
      </aside>
    </>,
    document.body,
  );
}
