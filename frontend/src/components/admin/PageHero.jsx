// The page header from the Figma mobile frames.
//
// Every admin screen in the mobile design opens the same way: a light-green
// rounded card holding the page title, a "Today, 14 May 2026" pill, a one-line
// subtitle, and any page-level actions stacked full width beneath.
//
// Built once rather than repeated per page, because the three screens being
// converted first are the template for the remaining seven -- and a header
// copied nine times drifts by the third copy.
//
// ON DESKTOP IT STAYS A ROW. The title and the pill sit on one line from sm up,
// which is what the existing pages already do, so this is not a mobile layout
// forced onto a wide screen.
export default function PageHero({ title, subtitle, datePill, actions, children }) {
  return (
    <section className="rounded-3xl bg-[#c0f28b] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {/* min-w-0 so a long title wraps inside the card instead of pushing
              the date pill off the edge. */}
          <h1 className="text-2xl font-extrabold leading-tight text-cg-ink sm:text-3xl">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1 text-sm text-cg-ink/70">{subtitle}</p>
          )}
        </div>
        {datePill && (
          <span className="shrink-0 rounded-xl bg-white/50 px-3 py-2 text-xs font-semibold text-cg-ink">
            {datePill}
          </span>
        )}
      </div>

      {/* Search, filters, anything the page wants between the title and the
          action buttons. */}
      {children && <div className="mt-4">{children}</div>}

      {/* FULL WIDTH AND STACKED ON A PHONE, inline from sm. A row of buttons
          that each shrink to fit is the single most common way a mobile header
          ends up with unreadable 8px labels. */}
      {actions && (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {actions}
        </div>
      )}
    </section>
  );
}
