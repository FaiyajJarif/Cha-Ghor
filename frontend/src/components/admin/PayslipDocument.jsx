import { useEffect, useState } from "react";
import api from "../../api/client";
import { createPortal } from "react-dom";
import { LuPrinter, LuX } from "react-icons/lu";
import { BTN_DARK, BTN_GHOST } from "../../lib/ui";

// Printable payslip. There is no PDF library here on purpose -- the browser's
// own "Save as PDF" destination produces a cleaner, smaller, text-selectable
// file than jsPDF/html2canvas rasterisation, needs no new dependency, and works
// offline. The trick is the print stylesheet below: everything on the page is
// hidden with `visibility`, then only this document is shown again. We use
// visibility rather than display so the print root does not have to be a direct
// child of <body>, which keeps it mountable from anywhere.
//
// LAYOUT RULE: #payslip-print-root must NOT be nested inside any .no-print
// element. `.no-print` is display:none when printing, and nothing inside a
// display:none ancestor can be brought back by `visibility: visible` -- the
// subtree is simply not rendered and you get blank pages. So the payslips are
// rendered twice from one `pages` array: once inside the modal for the preview,
// and once in a print-only root that is a sibling of the modal.
const PRINT_CSS = `
#payslip-print-root { display: none; }
@media print {
  body * { visibility: hidden !important; }
  #payslip-print-root, #payslip-print-root * { visibility: visible !important; }
  #payslip-print-root {
    display: block !important;
    position: absolute !important;
    left: 0 !important;
    top: 0 !important;
    width: 100% !important;
    max-height: none !important;
    overflow: visible !important;
    background: #fff !important;
    padding: 0 !important;
    margin: 0 !important;
  }
  .no-print { display: none !important; }
  .payslip-page {
    page-break-after: always;
    break-after: page;
    box-shadow: none !important;
    border: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
  }
  .payslip-page:last-child { page-break-after: auto; break-after: auto; }
  /* A month of days will not fit beside the summary. Let the table flow onto
     a second sheet rather than clipping it, but never split a single day's
     row across a page break -- a half-row is how a figure gets misread. */
  .payslip-days { page-break-inside: auto; break-inside: auto; }
  .payslip-days tr { page-break-inside: avoid; break-inside: avoid; }
  .payslip-days thead { display: table-header-group; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
}
@page { size: A4 portrait; margin: 14mm; }
`;

function taka(n) {
  const v = Number(n ?? 0);
  return "\u09f3" + v.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function fmtDate(iso) {
  if (!iso) return "\u2014";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function workerCode(id) {
  return "CG-" + String(id ?? 0).padStart(4, "0");
}

function Line({ label, value, muted, strong, negative }) {
  return (
    <div className="flex items-baseline justify-between py-1.5">
      <span className={muted ? "text-xs text-gray-500" : "text-sm text-cg-ink"}>
        {label}
      </span>
      <span
        className={
          "tabular-nums " +
          (strong ? "text-sm font-bold text-cg-ink" : "text-sm text-cg-ink") +
          (negative ? " text-rose-600" : "")
        }
      >
        {negative ? "-" : ""}
        {taka(value)}
      </span>
    </div>
  );
}

function OnePayslip({ row, config, daily }) {
  const gross = Number(row.grossAmount ?? 0);
  const loan = Number(row.loanDeduction ?? 0);
  const advance = Number(row.advanceRecovery ?? 0);
  const other = Number(row.otherDeduction ?? 0);
  const totalDed = loan + advance + other;

  return (
    <section className="payslip-page mx-auto w-full max-w-[720px] bg-white p-8">
      {/* Letterhead */}
      <header className="flex items-start justify-between border-b-2 border-cg-green pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-cg-lime text-lg">
              🌿
            </span>
            <span className="text-xl font-extrabold text-cg-ink">
              Cha <span className="text-cg-green">Ghor</span>
            </span>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Tea Estate Management · Sylhet, Bangladesh
          </p>
        </div>
        <div className="text-right">
          <h1 className="text-lg font-bold uppercase tracking-wide text-cg-ink">
            Payslip
          </h1>
          <p className="mt-1 text-xs text-gray-500">
            {fmtDate(row.periodStart)} – {fmtDate(row.periodEnd)}
          </p>
          <p className="text-xs text-gray-500">
            Slip #{String(row.id ?? "\u2014")}
          </p>
        </div>
      </header>

      {/* Worker block */}
      <div className="mt-5 grid grid-cols-2 gap-x-8 gap-y-2 rounded-lg bg-cg-lime/30 p-4">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-gray-500">
            Worker
          </p>
          <p className="text-sm font-semibold text-cg-ink">{row.workerName}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-gray-500">
            Worker ID
          </p>
          <p className="text-sm font-semibold text-cg-ink">
            {workerCode(row.workerId)}
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-gray-500">
            Zone
          </p>
          <p className="text-sm text-cg-ink">{row.zoneName || "\u2014"}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-gray-500">
            Days present
          </p>
          <p className="text-sm text-cg-ink">{row.presentDays ?? 0}</p>
        </div>
      </div>

      {/* Earnings / deductions */}
      <div className="mt-6 grid grid-cols-2 gap-6">
        <div>
          <h2 className="mb-1 border-b border-cg-green/20 pb-1 text-xs font-bold uppercase tracking-wide text-cg-green">
            Earnings
          </h2>
          <Line label="Base wage" value={row.baseAmount} />
          <Line label="Leaf surplus" value={row.surplusAmount} />
          <Line label="Grade-A bonus" value={row.gradeBonus} />
          <div className="mt-1 border-t border-cg-green/20 pt-1">
            <Line label="Gross" value={gross} strong />
          </div>
        </div>

        <div>
          <h2 className="mb-1 border-b border-cg-green/20 pb-1 text-xs font-bold uppercase tracking-wide text-cg-green">
            Deductions
          </h2>
          <Line label="Loan instalment" value={loan} negative />
          <Line label="Advance recovery" value={advance} negative />
          <Line label="Other" value={other} negative />
          <div className="mt-1 border-t border-cg-green/20 pt-1">
            <Line label="Total deductions" value={totalDed} strong negative />
          </div>
        </div>
      </div>

      {/* Net */}
      <div className="mt-6 flex items-center justify-between rounded-xl bg-cg-dark px-5 py-4 text-white">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-white/60">
            Net payable
          </p>
          <p className="text-xs text-white/60">
            Status: {String(row.status || "").toUpperCase()}
            {row.paidAt ? " \u00b7 paid " + fmtDate(row.paidAt) : ""}
          </p>
        </div>
        <p className="text-2xl font-extrabold tabular-nums">
          {taka(row.netPayable)}
        </p>
      </div>

      {/* How it was calculated */}
      {config ? (
        <p className="mt-4 text-[11px] leading-relaxed text-gray-500">
          Calculated at {taka(config.baseDailyWage)}/present day, with leaf above
          a {Number(config.leafQuotaKg ?? 0)} kg daily quota paid at{" "}
          {taka(config.surplusRate)}/kg and grade-A leaf earning a further{" "}
          {taka(config.gradeBonusRate)}/kg. Total leaf recorded this period:{" "}
          {Number(row.totalLeafKg ?? 0)} kg.
        </p>
      ) : null}

      {/* ==================================================================
          DAY BY DAY — the working, not just the answer.
          ==================================================================
          Until now this document printed four summary lines and nothing else,
          so neither the office nor the worker could see how a figure was
          reached. A worker handed a slip saying "net ৳0" had no way to check
          it, which is the exact dispute this system exists to end.

          Every row here is a fact from daily_settlement where it says
          "settled", and a projection where it says "pending". */}
      {daily?.days?.length ? (
        <div className="mt-6">
          <h2 className="mb-1 border-b border-cg-green/20 pb-1 text-xs font-bold uppercase tracking-wide text-cg-green">
            Day by day
          </h2>
          <table className="payslip-days w-full text-left text-[11px]">
            <thead className="text-gray-500">
              <tr>
                <th className="py-1 pr-2 font-semibold">Date</th>
                <th className="py-1 pr-2 font-semibold">Status</th>
                <th className="py-1 pr-2 text-right font-semibold">kg</th>
                <th className="py-1 pr-2 text-right font-semibold">Earned</th>
                <th className="py-1 pr-2 text-right font-semibold">Loan</th>
                <th className="py-1 pr-2 text-right font-semibold">Advance</th>
                <th className="py-1 pr-2 text-right font-semibold">Worker gets</th>
                <th className="py-1 font-semibold">Settled</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {daily.days
                .filter((d) => d.status || Number(d.earned) > 0)
                .map((d) => (
                  <tr key={d.date} className="border-t border-gray-200">
                    <td className="py-1 pr-2 text-cg-ink">{fmtDate(d.date)}</td>
                    <td className="py-1 pr-2 text-gray-500">{d.status || "\u2014"}</td>
                    <td className="py-1 pr-2 text-right text-gray-600">
                      {Number(d.kg) > 0 ? Number(d.kg).toFixed(1) : "\u2014"}
                    </td>
                    <td className="py-1 pr-2 text-right text-cg-ink">{taka(d.earned)}</td>
                    <td className="py-1 pr-2 text-right text-rose-600">
                      {Number(d.toLoan) > 0 ? "-" + taka(d.toLoan) : "\u2014"}
                    </td>
                    <td className="py-1 pr-2 text-right text-rose-600">
                      {Number(d.toAdvance) > 0 ? "-" + taka(d.toAdvance) : "\u2014"}
                    </td>
                    <td className="py-1 pr-2 text-right font-semibold text-cg-ink">
                      {taka(d.payable)}
                    </td>
                    {/* The distinction the whole daily model rests on. A
                        "pending" row is a forecast and may still change. */}
                    <td className="py-1 text-gray-500">
                      {d.settled ? "yes" : "pending"}
                      {d.mismatch ? " (edited)" : ""}
                    </td>
                  </tr>
                ))}
              <tr className="border-t-2 border-cg-green/30 font-bold">
                <td className="py-1 pr-2" colSpan={3}>
                  Total
                </td>
                <td className="py-1 pr-2 text-right">{taka(daily.totalEarned)}</td>
                <td className="py-1 pr-2 text-right text-rose-600">
                  -{taka(daily.totalToLoan)}
                </td>
                <td className="py-1 pr-2 text-right text-rose-600">
                  -{taka(daily.totalToAdvance)}
                </td>
                <td className="py-1 pr-2 text-right">{taka(daily.totalPayable)}</td>
                <td className="py-1" />
              </tr>
            </tbody>
          </table>

          {/* Say it plainly rather than letting the reader assume. */}
          <p className="mt-2 text-[10px] leading-relaxed text-gray-500">
            Wages are settled daily. A row marked <strong>yes</strong> has
            already moved the loan and advance balances; <strong>pending</strong>{" "}
            has not and may still change. Today is never settled, because leaf
            can still be weighed in.
            {Number(daily.mismatchedDays) > 0
              ? " Rows marked (edited) were changed after settlement — what was actually deducted differs from the figures shown."
              : ""}
          </p>
        </div>
      ) : (
        <p className="mt-6 text-[11px] text-gray-500">
          Day-by-day breakdown unavailable for this period.
        </p>
      )}

      {/* Signatures */}
      <div className="mt-10 grid grid-cols-2 gap-10">
        <div className="border-t border-gray-400 pt-1 text-center text-[11px] text-gray-500">
          Worker signature
        </div>
        <div className="border-t border-gray-400 pt-1 text-center text-[11px] text-gray-500">
          Estate manager
        </div>
      </div>

      <p className="mt-6 text-center text-[10px] text-gray-400">
        Computer-generated payslip · Cha Ghor · generated{" "}
        {fmtDate(new Date().toISOString())}
      </p>
    </section>
  );
}

// `rows` is one or many payslips. Passing several prints them as a batch, one
// per page, which is how a month's run gets filed.
export default function PayslipDocument({ rows, config, onClose }) {
  const list = Array.isArray(rows) ? rows : rows ? [rows] : [];

  // The day-by-day working, keyed by payslip id.
  //
  // FETCHED SEQUENTIALLY, ON PURPOSE. Printing a whole month's run means one
  // request per worker; firing fifty at once to hammer the estate's server so a
  // sheet of paper can render is not a trade worth making. A slip whose days
  // fail to load still prints — it just says so instead of showing a blank
  // table, because a payslip that silently omits its working is how this
  // document lost the office's trust in the first place.
  const [dailyById, setDailyById] = useState({});

  useEffect(() => {
    let cancelled = false;
    const wanted = list
      .filter((r) => r?.id && r?.workerId && r?.periodStart && r?.periodEnd)
      .map((r) => r);
    if (!wanted.length) return undefined;

    (async () => {
      for (const r of wanted) {
        if (cancelled) return;
        try {
          const { data } = await api.get(`/workers/${r.workerId}/daily`, {
            params: { from: r.periodStart, to: r.periodEnd },
          });
          if (cancelled) return;
          setDailyById((prev) => ({ ...prev, [r.id]: data }));
        } catch {
          // Leave it absent. OnePayslip renders the "unavailable" line rather
          // than an empty table that looks like a worker did nothing.
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.map((r) => r?.id).join(",")]);

  // Escape closes the preview.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!list.length) return null;

  const many = list.length > 1;

  // Built once, rendered twice: in the modal for the on-screen preview, and in
  // the print-only root below. See the layout rule above PRINT_CSS.
  const pages = list.map((r) => (
    <div key={r.id} className="rounded-lg shadow ring-1 ring-black/5">
      <OnePayslip row={r} config={config} daily={dailyById[r.id]} />
    </div>
  ));

  return createPortal(
    <>
      <style>{PRINT_CSS}</style>

      <div className="no-print fixed inset-0 z-[1200] bg-black/40" onClick={onClose} />

      <div className="no-print fixed inset-0 z-[1210] flex items-center justify-center p-4">
        <div
          className="flex max-h-[92vh] w-full max-w-[820px] flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between bg-[#C0F28B] px-5 py-3">
            <div>
              <h3 className="text-sm font-bold text-cg-ink">
                {many ? list.length + " payslips" : "Payslip preview"}
              </h3>
              <p className="text-xs text-cg-ink/70">
                Choose “Save as PDF” as the destination to get a file.
              </p>
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

          <div className="flex-1 overflow-y-auto bg-gray-100 p-4">
            <div className="space-y-4">{pages}</div>
          </div>

          <div className="flex items-center justify-end gap-2 bg-[#D3FFAC] px-5 py-3">
            <button type="button" className={BTN_GHOST} onClick={onClose}>
              Close
            </button>
            <button
              type="button"
              className={BTN_DARK}
              onClick={() => window.print()}
            >
              <LuPrinter className="mr-1.5 inline" />
              Print / Save as PDF
            </button>
          </div>
        </div>
      </div>

      {/* Print-only copy. MUST stay OUTSIDE the .no-print wrappers above:
          .no-print is display:none when printing, and a display:none ancestor
          cannot be undone by visibility on a descendant. Nesting the print root
          inside the modal is what made this print blank pages. */}
      <div id="payslip-print-root" className="space-y-4">
        {pages}
      </div>
    </>,
    document.body
  );
}
