import { Outlet, useLocation } from "react-router-dom";
import AdminSidebar from "./AdminSidebar";
import AdminTopbar from "./AdminTopbar";
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
  default: [
    "How many active workers are there?",
    "Total wages paid last month",
    "Total expenses by category this month",
    "Outstanding across active loans",
  ],
};

function suggestionsFor(pathname) {
  if (pathname.includes("/payroll")) return SUGGESTIONS.payroll;
  if (pathname.includes("/finance")) return SUGGESTIONS.finance;
  if (pathname.includes("/loans")) return SUGGESTIONS.loans;
  if (pathname.includes("/workforce")) return SUGGESTIONS.workforce;
  return SUGGESTIONS.default;
}

export default function AdminLayout() {
  const { pathname } = useLocation();
  return (
    <div className="min-h-screen bg-[#e1ffc6]">
      <AdminSidebar />
      <div className="flex min-h-screen flex-col md:ml-60">
        <AdminTopbar />
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
      <ChaBot suggestions={suggestionsFor(pathname)} />
      <OfflineBanner />
    </div>
  );
}
