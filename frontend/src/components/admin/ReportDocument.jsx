import { useEffect } from "react";
import { createPortal } from "react-dom";
import { LuPrinter, LuX } from "react-icons/lu";
import { BTN_DARK, BTN_GHOST } from "../../lib/ui";

// Printable Reports & Analytics document.
//
// Same approach as PayslipDocument on purpose: no PDF library. The browser's
// own "Save as PDF" destination gives a smaller, text-selectable file than
// jsPDF/html2canvas rasterisation, adds no dependency and works offline. The
// print stylesheet hides everything on the page with `visibility`, then shows
// this document again -- visibility rather than display, so the print root does
// not have to be a direct child of <body>.
//
// This is a DIFFERENT feature from the payslip PDF. It uses its own print root
// id so the two can never fight if both are mounted.
//
// The 6-month trend prints as a TABLE rather than the recharts SVG: it prints
// reliably in every browser, stays selectable, and reads better on paper than a
// shrunken chart.
//
// LAYOUT RULE, LEARNED THE HARD WAY: #report-print-root must NOT be nested
// inside any .no-print element. `.no-print` is display:none when printing, and
// nothing inside a display:none ancestor can be brought back by
// `visibility: visible` -- the whole subtree is simply not rendered, and you
// get blank pages. So the document is rendered twice from one `pages` element:
// once inside the modal for the on-screen preview, and once in a print-only
// root that is a sibling of the modal, not a descendant.
const PRINT_CSS = `
#report-print-root { display: none; }
@media print {
  body * { visibility: hidden !important; }
  #report-print-root, #report-print-root * { visibility: visible !important; }
  #report-print-root {
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
  .report-page {
    page-break-after: always;
    break-after: page;
    box-shadow: none !important;
    border: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
  }
  .report-page:last-child { page-break-after: auto; break-after: auto; }
  tr, td, th { page-break-inside: avoid; break-inside: avoid; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
}
@page { size: A4 portrait; margin: 14mm; }
`;

function taka(n) {
  return (
    "৳" +
    Number(n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })
  );
}

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function num(n, suffix = "") {
  if (n === null || n === undefined || n === "") return "—";
  return Number(n).toLocaleString("en-IN", { maximumFractionDigits: 1 }) + suffix;
}

// One figure in the KPI grid.
function Figure({ label, value, sub, strong }) {
  return (
    <div className="border border-gray-200 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
        {label}
      </p>
      <p
        className={
          "mt-1 tabular-nums " +
          (strong
            ? "text-lg font-extrabold text-cg-ink"
            : "text-base font-bold text-cg-ink")
        }
      >
        {value}
      </p>
      {sub ? <p className="mt-0.5 text-[10px] text-gray-500">{sub}</p> : null}
    </div>
  );
}

export default function ReportDocument({
  summary,
  trend = [],
  periodStart,
  periodEnd,
  report = null, // a saved report, when exporting one row
  onClose,
}) {
  // Escape closes the preview (same as PayslipDocument).
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!summary && !report) return null;

  // A saved report carries its own period and figures; otherwise use the
  // live period summary currently on screen.
  const start = report?.periodStart ?? periodStart;
  const end = report?.periodEnd ?? periodEnd;
  const revenue = report ? report.revenue : summary?.revenue;
  const expense = report ? report.expense : summary?.expense;
  const netProfit = report ? report.netProfit : summary?.netProfit;

  // Margin: a saved report stores only the three money figures, so derive it
  // rather than showing a live margin that belongs to a different period.
  const margin =
    report && Number(report.revenue) > 0
      ? (Number(report.netProfit) / Number(report.revenue)) * 100
      : report
        ? null
        : summary?.profitMargin;

  const title = report?.title || "Estate Performance Report";

  // Built once, rendered twice: in the modal for the screen preview, and in the
  // print-only root below. Do not inline this into the modal only -- see the
  // layout rule above PRINT_CSS.
  const pages = (
    <section className="report-page mx-auto w-full max-w-[720px] bg-white p-8">
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
            {title}
          </h1>
          <p className="mt-1 text-xs text-gray-500">
            {fmtDate(start)} – {fmtDate(end)}
          </p>
          {report?.status ? (
            <p className="text-xs text-gray-500">
              {report.status === "FINALIZED" ? "Finalized" : "Draft"}
            </p>
          ) : null}
        </div>
      </header>

      {/* Headline figures */}
      <h2 className="mt-6 text-xs font-bold uppercase tracking-wide text-cg-ink">
        Financial summary
      </h2>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <Figure label="Revenue" value={taka(revenue)} />
        <Figure label="Expenses" value={taka(expense)} />
        <Figure
          label="Net profit"
          value={taka(netProfit)}
          sub={margin === null ? null : `Margin ${num(margin, "%")}`}
          strong
        />
      </div>

      {/* Operational figures come from the live period summary only. */}
      {summary && !report ? (
        <>
          <h2 className="mt-6 text-xs font-bold uppercase tracking-wide text-cg-ink">
            Labour &amp; operations
          </h2>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <Figure
              label="Payroll cost"
              value={taka(summary.payrollCost)}
              sub="Wages in period"
            />
            <Figure
              label="Attendance rate"
              value={num(summary.attendanceRate, "%")}
              sub="Present / total marks"
            />
            <Figure
              label="Active workers"
              value={num(summary.activeWorkers)}
              sub="Current headcount"
            />
          </div>

          <h2 className="mt-6 text-xs font-bold uppercase tracking-wide text-cg-ink">
            Loans &amp; advances
          </h2>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Figure label="Outstanding" value={taka(summary.loanOutstanding)} />
            <Figure label="Recovered" value={taka(summary.loanRecovered)} />
          </div>
        </>
      ) : null}

      {/* 6-month trend as a table, not a chart. */}
      {trend.length > 0 ? (
        <>
          <h2 className="mt-6 text-xs font-bold uppercase tracking-wide text-cg-ink">
            Six-month trend
          </h2>
          <table className="mt-2 w-full border-collapse text-sm">
            <thead>
              <tr className="bg-[#D3FFAC] text-left text-[10px] uppercase tracking-wide text-cg-ink/70">
                <th className="border border-gray-200 px-3 py-2">Month</th>
                <th className="border border-gray-200 px-3 py-2 text-right">
                  Revenue
                </th>
                <th className="border border-gray-200 px-3 py-2 text-right">
                  Expense
                </th>
                <th className="border border-gray-200 px-3 py-2 text-right">
                  Profit
                </th>
              </tr>
            </thead>
            <tbody>
              {trend.map((p) => (
                <tr key={p.month}>
                  <td className="border border-gray-200 px-3 py-1.5 text-cg-ink">
                    {p.month}
                  </td>
                  <td className="border border-gray-200 px-3 py-1.5 text-right tabular-nums text-cg-ink">
                    {taka(p.revenue)}
                  </td>
                  <td className="border border-gray-200 px-3 py-1.5 text-right tabular-nums text-cg-ink">
                    {taka(p.expense)}
                  </td>
                  <td className="border border-gray-200 px-3 py-1.5 text-right tabular-nums font-semibold text-cg-ink">
                    {taka(p.profit)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}

      {/* AI narrative, when exporting a saved report. */}
      {report?.summary ? (
        <>
          <h2 className="mt-6 text-xs font-bold uppercase tracking-wide text-cg-ink">
            Narrative
          </h2>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-cg-ink/80">
            {report.summary}
          </p>
        </>
      ) : null}

      <footer className="mt-8 border-t border-gray-200 pt-3 text-[10px] text-gray-500">
        <p>
          Generated by Cha Ghor on {fmtDate(new Date().toISOString())}
          {report?.generatedAt
            ? ` · report generated ${report.generatedAt.slice(0, 10)}`
            : ""}
          {report?.finalizedAt
            ? ` · finalized ${report.finalizedAt.slice(0, 10)}`
            : ""}
        </p>
        <p className="mt-0.5">
          Figures are drawn from the estate finance ledger, attendance register
          and loan book for the stated period.
        </p>
      </footer>
    </section>
  );

  return createPortal(
    <>
      <style>{PRINT_CSS}</style>

      <div
        className="no-print fixed inset-0 z-[1200] bg-black/40"
        onClick={onClose}
      />

      <div className="no-print fixed inset-0 z-[1210] flex items-center justify-center p-4">
        <div
          className="flex max-h-[92vh] w-full max-w-[820px] flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between bg-[#C0F28B] px-5 py-3">
            <div>
              <h3 className="text-sm font-bold text-cg-ink">Report preview</h3>
              <p className="text-xs text-cg-ink/70">
                {"Choose “Save as PDF” as the destination to get a file."}
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
            {pages}
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
          .no-print is display:none when printing, and a display:none
          ancestor cannot be undone by visibility on a descendant. */}
      <div id="report-print-root">{pages}</div>
    </>,
    document.body,
  );
}
