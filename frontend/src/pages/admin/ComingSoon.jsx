import { useLocation, Link } from "react-router-dom";
import { LuClock, LuArrowLeft } from "react-icons/lu";
import { ADMIN_NAV } from "../../lib/adminNav";

// Stands in for an admin module that is deliberately OUT OF SCOPE.
//
// ===========================================================================
// WHY A PAGE, AND NOT JUST A MISSING ROUTE
// ===========================================================================
// Removing the two <Route> entries would have been fewer lines. But a bookmark,
// a browser back button, or a typed URL would then fall through to whatever
// catch-all exists and render a blank frame with no explanation -- which reads
// as a crash, not as a decision. Someone demoing this would have to explain a
// broken-looking page live.
//
// Routing the paths here instead means every way in lands somewhere that says,
// in one sentence, that the module is not part of this build.
//
// The real Inventory.jsx and Supply.jsx are UNTOUCHED and still compile. This
// is a routing decision, not a deletion, and reversing it is two lines in
// App.jsx plus dropping `soon: true` from lib/adminNav.js.
export default function ComingSoon() {
  const { pathname } = useLocation();

  // Read the title from the nav rather than hard-coding it, so a renamed module
  // cannot end up with one label in the sidebar and another on this page.
  const entry =
    [...ADMIN_NAV]
      .sort((a, b) => b.path.length - a.path.length)
      .find((n) => pathname === n.path || pathname.startsWith(n.path + "/")) ||
    null;

  const title = entry?.label || "This module";
  const Icon = entry?.icon || LuClock;

  return (
    <div className="grid place-items-center px-4 py-16">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 text-center shadow ring-1 ring-cg-green/10">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-cg-lime/50">
          <Icon size={26} className="text-cg-green" />
        </div>

        <h1 className="mt-4 text-lg font-bold text-cg-ink">{title}</h1>

        <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-cg-lime/60 px-3 py-1 text-xs font-semibold text-cg-ink/70">
          <LuClock size={13} /> Coming soon
        </span>

        {/* Said plainly. "Under construction" would imply someone is working on
            it this week; that is not what is true here. */}
        <p className="mt-4 text-sm leading-relaxed text-cg-ink/65">
          {title} is not part of the current build. The estate modules in scope
          are Workforce, Payroll, Loans, Finance and Reports &amp; Analytics.
        </p>

        <Link
          to="/admin"
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-cg-dark px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
        >
          <LuArrowLeft size={16} /> Back to Overview
        </Link>
      </div>
    </div>
  );
}
