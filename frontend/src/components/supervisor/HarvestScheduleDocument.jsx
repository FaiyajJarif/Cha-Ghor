import { useEffect } from "react";
import { createPortal } from "react-dom";
import { LuX, LuPrinter } from "react-icons/lu";

// A printable harvest schedule — the sheet a supervisor carries into the field.
//
// NO PDF LIBRARY. The browser's own "Save as PDF" is the printer, driven by the
// stylesheet below. This copies PayslipDocument.jsx exactly, because that
// approach is already proven here and because a PDF library would be a new
// dependency, a bundle-size cost and a second way of laying out a document that
// would immediately start disagreeing with the first.
//
// LAYOUT RULE, learned the hard way in PayslipDocument: #harvest-print-root
// must NOT be nested inside any .no-print element. `.no-print` is display:none
// when printing, and nothing inside a display:none ancestor can be brought back
// by visibility on a descendant — that is what made an earlier print come out
// as blank pages. So the modal is rendered twice: once on screen inside
// .no-print, and once in a print-only root that is a SIBLING of it.

const PRINT_CSS = `
#harvest-print-root { display: none; }
@media print {
  body * { visibility: hidden !important; }
  #harvest-print-root, #harvest-print-root * { visibility: visible !important; }
  #harvest-print-root {
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
  /* Repeat the header on every page — a two-page round sheet whose columns are
     only labelled on page one is worse than no sheet. */
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; break-inside: avoid; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  @page { margin: 14mm; }
}
`;

const fmtDate = (d) =>
  d
    ? new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";

function Sheet({ rows, generatedFor }) {
  // Grouped by day, because that is how the work is actually done: a supervisor
  // reads "Thursday" and wants everything for Thursday together.
  const byDate = rows.reduce((acc, r) => {
    (acc[r.date] ||= []).push(r);
    return acc;
  }, {});
  const days = Object.keys(byDate).sort();

  const totalExpected = rows.reduce((s, r) => s + Number(r.expectedKg || 0), 0);

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", color: "#14493B" }}>
      <div style={{ borderBottom: "2px solid #14493B", paddingBottom: 10, marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Cha Ghor — Harvest Schedule</h1>
        <p style={{ margin: "4px 0 0", fontSize: 12, opacity: 0.7 }}>
          Planned work by field · {rows.length} job{rows.length === 1 ? "" : "s"}
          {totalExpected > 0 ? ` · ${totalExpected.toFixed(0)} kg expected in total` : ""}
        </p>
        <p style={{ margin: "2px 0 0", fontSize: 11, opacity: 0.55 }}>
          Printed {generatedFor}
        </p>
      </div>

      {days.length === 0 ? (
        <p style={{ fontSize: 13 }}>Nothing is scheduled.</p>
      ) : (
        days.map((d) => (
          <div key={d} style={{ marginBottom: 18 }}>
            <h2
              style={{
                margin: "0 0 6px",
                fontSize: 14,
                fontWeight: 700,
                background: "#D3FFAC",
                padding: "5px 8px",
              }}
            >
              {fmtDate(d)}
            </h2>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #14493B" }}>
                  <th style={{ padding: "5px 6px" }}>Field</th>
                  <th style={{ padding: "5px 6px" }}>Task</th>
                  <th style={{ padding: "5px 6px" }}>Type</th>
                  <th style={{ padding: "5px 6px" }}>Assigned</th>
                  <th style={{ padding: "5px 6px", textAlign: "right" }}>Expected</th>
                  <th style={{ padding: "5px 6px" }}>Status</th>
                  {/* A paper sheet is used in a field with no signal. Somewhere
                      to write the real number is the point of printing it. */}
                  <th style={{ padding: "5px 6px", textAlign: "right" }}>Actual kg</th>
                </tr>
              </thead>
              <tbody>
                {byDate[d].map((r) => (
                  <tr key={r.id} style={{ borderBottom: "1px solid #e3ece7" }}>
                    <td style={{ padding: "6px", fontWeight: 600 }}>{r.zoneName || "—"}</td>
                    <td style={{ padding: "6px" }}>
                      {r.title || "Planned work"}
                      {r.description ? (
                        <div style={{ fontSize: 10, opacity: 0.6 }}>{r.description}</div>
                      ) : null}
                    </td>
                    <td style={{ padding: "6px", textTransform: "capitalize" }}>{r.type}</td>
                    <td style={{ padding: "6px" }}>
                      {r.workerName || <span style={{ opacity: 0.4 }}>unassigned</span>}
                    </td>
                    <td style={{ padding: "6px", textAlign: "right" }}>
                      {r.expectedKg ? `${Number(r.expectedKg).toFixed(0)} kg` : "—"}
                    </td>
                    <td style={{ padding: "6px", textTransform: "uppercase", fontSize: 10 }}>
                      {r.status}
                      {r.overdue ? " · overdue" : ""}
                    </td>
                    <td
                      style={{
                        padding: "6px",
                        textAlign: "right",
                        borderBottom: "1px solid #14493B",
                        minWidth: 70,
                      }}
                    />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}

      <p style={{ marginTop: 24, fontSize: 10, opacity: 0.5 }}>
        Expected figures are a plan, not a wage input. Pay is calculated only
        from what is weighed in and recorded against each worker.
      </p>
    </div>
  );
}

export default function HarvestScheduleDocument({ open, rows, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!open) return null;

  const list = rows || [];
  const generatedFor = new Date().toLocaleString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return createPortal(
    <>
      <style>{PRINT_CSS}</style>

      <div className="no-print fixed inset-0 z-[1200] bg-black/40" onClick={onClose} aria-hidden />
      <div className="no-print fixed inset-0 z-[1210] flex items-center justify-center p-4">
        <div
          className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-label="Harvest schedule sheet"
        >
          <div className="flex items-center justify-between bg-[#14493B] px-6 py-4">
            <div>
              <h3 className="text-xl font-extrabold text-white">Harvest schedule sheet</h3>
              <p className="text-xs text-white/60">
                Choose &quot;Save as PDF&quot; in the print dialog to keep a copy
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid h-9 w-9 place-items-center rounded-full bg-white/20 text-white"
            >
              <LuX size={16} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto bg-[#F4FFE9] p-6">
            <div className="rounded-xl bg-white p-6 shadow ring-1 ring-[#13483B]/10">
              <Sheet rows={list} generatedFor={generatedFor} />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 bg-[#D3FFAC] px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2.5 text-sm font-semibold text-[#14493B]/70"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-xl bg-[#14493B] px-5 py-2.5 text-sm font-bold text-white transition hover:brightness-110"
            >
              <LuPrinter size={15} /> Print / Save as PDF
            </button>
          </div>
        </div>
      </div>

      {/* Print-only copy. MUST stay OUTSIDE the .no-print wrappers above — see
          the layout rule at the top of this file. */}
      <div id="harvest-print-root">
        <Sheet rows={list} generatedFor={generatedFor} />
      </div>
    </>,
    document.body,
  );
}
