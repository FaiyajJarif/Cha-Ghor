import {
  LuLayoutDashboard,
  LuUsers,
  LuWallet,
  LuLandmark,
  LuBoxes,
  LuHandCoins,
  LuFileText,
  LuReceipt,
  LuTruck,
  LuSmartphone,
} from "react-icons/lu";

// The admin console navigation. Each entry is one estate module from our
// planned 7-feature Admin MVP, plus the Overview. `ai` names the AI feature
// we will embed in that module (the Figma has none of these — we add them).
//
// ===========================================================================
// `soon: true` MEANS OUT OF SCOPE, NOT UNFINISHED.
// ===========================================================================
// Inventory and Supply Chain are not in the current plan. Their page files
// still exist and still compile -- nothing was deleted -- but the router sends
// both paths to ComingSoon, and the nav renders them greyed and unclickable.
//
// This flag is the SINGLE source of truth. The sidebar, the mobile bottom bar
// and App.jsx all read it, so a module cannot end up disabled in one place and
// reachable in another. If these come back into scope, delete the flag here and
// restore the two routes in App.jsx -- nothing else needs to change.
export const ADMIN_NAV = [
  {
    key: "overview",
    label: "Overview",
    path: "/admin",
    icon: LuLayoutDashboard,
    ai: "Cha Bot assistant + anomaly flags",
  },
  {
    key: "workforce",
    label: "Workforce",
    path: "/admin/workforce",
    icon: LuUsers,
    ai: "—",
  },
  {
    key: "payroll",
    label: "Payroll & Wage",
    path: "/admin/payroll",
    icon: LuWallet,
    ai: "Payroll anomaly detection",
  },
  {
    key: "finance",
    label: "Finance / Ledger",
    path: "/admin/finance",
    icon: LuLandmark,
    ai: "Fraud / anomaly flags",
  },
  {
    key: "inventory",
    label: "Inventory",
    path: "/admin/inventory",
    icon: LuBoxes,
    ai: "Predictive reorder",
    soon: true,
  },
  {
    key: "loans",
    label: "Loans & Advances",
    path: "/admin/loans",
    icon: LuHandCoins,
    ai: "Loan credibility score",
  },
  {
    // Sits next to Loans because both are money LEAVING the estate to a
    // worker, and the two screens are used in the same sitting.
    key: "bkash",
    label: "bKash Payout",
    path: "/admin/bkash",
    icon: LuSmartphone,
    ai: null,
  },
  {
    key: "reports",
    label: "Reports & Analytics",
    path: "/admin/reports",
    icon: LuFileText,
    ai: "Smart auto-reports",
  },
  {
    key: "complaints",
    label: "Reports & Complaints",
    path: "/admin/complaints",
    icon: LuReceipt,
    ai: "AI report validation (planned)",
  },
  {
    key: "supply",
    label: "Supply Chain",
    path: "/admin/supply",
    icon: LuTruck,
    ai: "—",
    soon: true,
  },
];
