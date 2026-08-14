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
} from "react-icons/lu";

// The admin console navigation. Each entry is one estate module from our
// planned 7-feature Admin MVP, plus the Overview. `ai` names the AI feature
// we will embed in that module (the Figma has none of these — we add them).
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
  },
  {
    key: "loans",
    label: "Loans & Advances",
    path: "/admin/loans",
    icon: LuHandCoins,
    ai: "Loan credibility score",
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
  },
];
