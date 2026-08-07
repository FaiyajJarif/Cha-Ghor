import {
  LuLayoutDashboard,
  LuUserCheck,
  LuLeaf,
  LuMap,
  LuSun,
  LuMessageSquare,
} from "react-icons/lu";

// Supervisor console navigation — six entries, matching the agreed feature set:
// attendance, leaf weigh-in, field management and weather monitoring, plus the
// dashboard and broadcast screens.
//
// Workforce and Reports & Compliance were deliberately removed: workforce
// records are an admin responsibility, and reporting lives on the admin side
// too. A supervisor raises cases from the field rather than managing them.
//
// `ready` marks which screens actually have a backend behind them today, so the
// sidebar can label the rest honestly instead of leading somewhere empty.
export const SUPERVISOR_NAV = [
  {
    key: "dashboard",
    label: "Dashboard",
    path: "/supervisor",
    icon: LuLayoutDashboard,
    ready: true,
  },
  {
    key: "attendance",
    label: "Attendance",
    path: "/supervisor/attendance",
    icon: LuUserCheck,
    ready: true,
  },
  {
    key: "leaf",
    label: "Leaf Collection",
    path: "/supervisor/leaf",
    icon: LuLeaf,
    ready: true,
  },
  {
    key: "fields",
    label: "Fields",
    path: "/supervisor/fields",
    icon: LuMap,
    ready: true,
  },
  {
    key: "weather",
    label: "Weather Monitor",
    path: "/supervisor/weather",
    icon: LuSun,
    ready: true,
  },
  {
    key: "broadcast",
    label: "Broadcast Message",
    path: "/supervisor/broadcast",
    icon: LuMessageSquare,
    ready: true,
  },
];
