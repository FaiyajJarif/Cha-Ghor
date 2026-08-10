import { LuUser, LuWallet, LuMegaphone } from "react-icons/lu";

// Worker console navigation — three entries, matching the agreed scope:
// their own record, their own pay, and a way to raise a problem.
//
// Same shape as SUPERVISOR_NAV on purpose, including `ready`, so both sidebars
// render from one pattern and an unbuilt screen is labelled rather than leading
// somewhere empty.
//
// LABELS ARE BANGLA, unlike the other two consoles. These screens are for
// pluckers on a Sylhet estate; the office and the supervisors work in English
// and their consoles stay that way.
export const WORKER_NAV = [
  {
    key: "profile",
    label: "আমার প্রোফাইল",
    path: "/worker",
    icon: LuUser,
    ready: true,
  },
  {
    key: "wages",
    label: "বেতন ও ঋণ",
    path: "/worker/wages",
    icon: LuWallet,
    ready: true,
  },
  {
    key: "report",
    label: "প্রশাসককে রিপোর্ট",
    path: "/worker/report",
    icon: LuMegaphone,
    ready: false,
  },
];
