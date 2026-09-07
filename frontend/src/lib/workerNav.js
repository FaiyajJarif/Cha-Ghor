import { LuUser, LuBell, LuWallet, LuMegaphone } from "react-icons/lu";

// Worker console navigation — four entries: their own record, estate notices,
// their own pay and borrowing, and a way to raise a problem.
//
// Settings is deliberately NOT one of them; it lives in the sidebar footer
// beside logout. Keep this count honest — it read "three" for a while after a
// fourth was added, and a stale comment gets believed instead of the code.
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
    key: "notices",
    label: "খবর ও নোটিশ",
    path: "/worker/notices",
    icon: LuBell,
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
    ready: true,
  },
]

// Settings is NOT in this list on purpose. The sidebar already had a slot for
// it under the logout button -- a dead "সেটিংস পরে যুক্ত হবে" placeholder --
// and putting it in the nav as well would have been the same destination twice.
// WorkerSidebar renders it there; see SETTINGS_PATH below.
export const WORKER_SETTINGS = {
  label: "সেটিংস",
  path: "/worker/settings",
};
