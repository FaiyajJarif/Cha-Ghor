import { useEffect } from "react";
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

function OnePayslip({ row, config }) {
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
      <OnePayslip row={r} config={config} />
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
