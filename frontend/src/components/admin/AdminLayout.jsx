import { Outlet, useLocation } from "react-router-dom";
import AdminSidebar from "./AdminSidebar";
import AdminTopbar from "./AdminTopbar";
import AdminBottomNav from "./AdminBottomNav";
import ChaBot from "./ChaBot";
import OfflineBanner from "../OfflineBanner";

// The admin shell. Cha Bot floats on every admin screen; its suggested
// questions adapt to the current module (payroll, finance, loans, workforce)
// so each page offers relevant prompts.
const SUGGESTIONS = {
  payroll: [
    "Total wages paid last month",
    "Total payroll spend this month",
    "Monthly payroll spend (last 6 months)",
    "Average daily wage by job role",
  ],
  finance: [
    "Total expenses by category this month",
    "Revenue vs expenses this month",
    "Which expenses are still pending?",
    "Monthly revenue for the last 6 months",
  ],
  loans: [
    "Total outstanding across active loans",
    "How many loans are overdue?",
    "Outstanding by zone",
    "List the 5 largest active loans",
  ],
  workforce: [
    "How many active workers are there?",
    "List workers in each zone",
    "Who was absent today?",
    "Average daily wage by job role",
  ],
  // bKash Payout reads the same ledger as Finance -- there is no bkash view, so
  // every chip here is phrased against finance/payroll data the bot can reach.
  bkash: [
    "Total paid out to workers this month",
    "Which withdrawals are still pending?",
    "Cash movements this week",
    "Total wages paid last month",
  ],
  reports: [
    "Revenue vs expenses this month",
    "Monthly payroll spend (last 6 months)",
    "Total expenses by category this month",
    "How many active workers are there?",
  ],
  default: [
    "How many active workers are there?",
    "Total wages paid last month",
    "Total expenses by category this month",
    "Outstanding across active loans",
  ],
};

// ===========================================================================
// EVERY CHIP MUST BE ANSWERABLE. THAT IS THE WHOLE CONSTRAINT.
// ===========================================================================
// Cha Bot turns a question into SQL and runs it against FIVE curated views and
// nothing else: view_worker, view_attendance, view_payroll, view_loan,
// view_finance (guard_sql in ai_service/db.py).
//
// So there is no chip for Complaints or Settings, and they fall through to
// `default` on purpose. There is no view for field cases, and there is no LEAF
// view either -- "how many kg did she pluck?" cannot be answered today, however
// natural a question it is on a tea estate. Offering a chip the bot must fail
// is worse than offering none: the user reads the failure as the bot being
// broken rather than the question being out of range.
//
// If you add a chip, check the data behind it exists in one of those five.

function suggestionsFor(pathname) {
  if (pathname.includes("/payroll")) return SUGGESTIONS.payroll;
  if (pathname.includes("/finance")) return SUGGESTIONS.finance;
  if (pathname.includes("/loans")) return SUGGESTIONS.loans;
  if (pathname.includes("/workforce")) return SUGGESTIONS.workforce;
  if (pathname.includes("/bkash")) return SUGGESTIONS.bkash;
  if (pathname.includes("/reports")) return SUGGESTIONS.reports;
  // Complaints and Settings land here deliberately -- see the note above.
  return SUGGESTIONS.default;
}

export default function AdminLayout() {
  const { pathname } = useLocation();
  return (
    <div className="min-h-screen bg-[#e1ffc6]">
      <AdminSidebar />
      <div className="flex min-h-screen flex-col md:ml-60">
        <AdminTopbar />
        {/* Tighter padding on a phone -- p-6 on a 360px screen spends 13% of
            the width on margins. pb-24 keeps the last card clear of the fixed
            bottom bar, which would otherwise cover it with no way to scroll
            further. */}
        {/* overflow-x-hidden is a GUARD, not the fix. The real fix is min-w-0
            on the KPI cards. But one un-shrinkable element anywhere on a page
            widens the whole document, and then EVERY card below it renders
            against a page wider than the phone and appears to run off the
            right edge -- which is what this kept being reported as. Clipping
            one element inside the page is a much smaller failure than shifting
            the entire console sideways.

            Safe here: the topbar is sticky but is a SIBLING of main, not a
            descendant, so this scroll container does not break it, and every
            modal portals to document.body. */}
        <main className="flex-1 overflow-x-hidden p-4 pb-24 sm:p-6 md:pb-6">
          <Outlet />
        </main>
      </div>
      <AdminBottomNav />
      <ChaBot suggestions={suggestionsFor(pathname)} />
      <OfflineBanner />
    </div>
  );
}
