// ONE record card, used by every mobile list in the admin console.
//
// ============================================================================
// THE SPACING IS FIXED HERE AND NOWHERE ELSE
// ============================================================================
//
// This existed and was used by the Workforce directory and the Payroll payslip
// list, and then Attendance and Leaf Collection were each given their own
// hand-rolled layout -- one a 4-column grid, one a 2-up tile. Three different
// paddings, three different avatar sizes, three different title weights. Put
// side by side they read as three different products.
//
// So the rhythm lives in these constants and every list gets it by using this
// component. Changing a number here changes all four lists together, which is
// the only way they stay consistent once someone edits one of them next month.
//
//   px-4 py-3   card padding          the same as the desktop table cell
//   gap-3       avatar -> text
//   36px        avatar
//   text-sm     title, bold
//   text-[11px] meta line
//   mt-2 gap-2  footer row
//
// Anything a specific list needs beyond that goes in `footer`, so the top row
// is identical everywhere: who this is on the left, status on the right.
export default function RecordCard({ avatar, title, meta, pills, footer, onClick }) {
  return (
    <li className="border-b border-cg-green/10 last:border-b-0">
      {/* The whole top row is the tap target when a list wants one, so a
          worker's name and their row open the same thing. */}
      <div
        className={`px-4 py-3 ${onClick ? "cursor-pointer active:bg-cg-lime/20" : ""}`}
        onClick={onClick}
      >
        <div className="flex items-start gap-3">
          {avatar && <div className="shrink-0">{avatar}</div>}

          {/* min-w-0 lets a long name truncate instead of pushing the pills out
              of the card -- a flex child will not shrink below its content
              width without it. */}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-cg-ink">{title}</p>
            {meta && (
              <p className="mt-0.5 truncate text-[11px] text-cg-ink/55">{meta}</p>
            )}
          </div>

          {pills && (
            <div className="flex shrink-0 flex-col items-end gap-1">{pills}</div>
          )}
        </div>

        {footer && (
          <div className="mt-2 flex flex-wrap items-center gap-2">{footer}</div>
        )}
      </div>
    </li>
  );
}

// The pill and chip shapes the lists share, exported so a caller never invents
// its own size. A status pill that is 11px on one screen and 10px on the next
// is exactly the inconsistency this file exists to stop.
export const CARD_PILL =
  "rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap";
export const CARD_CHIP =
  "rounded-lg px-2 py-1 text-xs font-bold whitespace-nowrap";
