import { Outlet } from "react-router-dom";
import WorkerSidebar from "./WorkerSidebar";
import NotificationBell from "../admin/NotificationBell";
import OfflineBanner from "../OfflineBanner";
import { useAuth } from "../../context/AuthContext";

// The worker shell — same structure as SupervisorLayout so the three consoles
// read as one product: fixed 60-wide sidebar, md:ml-60 content, the same
// #C0F28B header band on #e1ffc6, the same bell, the same offline banner.
//
// TWO DELIBERATE DIFFERENCES FROM THE SUPERVISOR SHELL:
//
//   No search box. The supervisor header carries a disabled "Search across the
//   ledger" input; the worker mockup carried "Search workers…", which is worse
//   than useless — a worker searching other workers is a data leak, and every
//   endpoint under /api/v1/me/worker resolves from the JWT and takes no id, so
//   it could never have worked anyway.
//
//   No Cha Bot. /chatbot/ask runs generated SQL against estate-wide views. It
//   permits admins and supervisors for that reason, and pointing a worker at it
//   would hand them everyone else's payroll through a text box. A worker-scoped
//   assistant would need its own filter and its own guard; that is a feature,
//   not a component import.
//
// OfflineBanner is kept: workers are in the field, on the same intermittent
// connections the outbox exists for.
export default function WorkerLayout() {
  const { user } = useAuth();
  return (
    <div className="min-h-screen bg-[#e1ffc6]">
      <WorkerSidebar />
      <div className="flex min-h-screen flex-col md:ml-60">
        <header className="flex flex-wrap items-center justify-between gap-3 bg-[#C0F28B] px-6 py-3">
          {/* Mobile nav. The sidebar is md:flex only, and unlike the other two
              consoles this one is genuinely phone-first — losing the sidebar
              must not mean losing the navigation. */}
          <nav className="flex gap-1 overflow-x-auto md:hidden">
            {[
              ["/worker", "প্রোফাইল"],
              ["/worker/wages", "বেতন"],
            ].map(([to, label]) => (
              <a
                key={to}
                href={to}
                className="shrink-0 rounded-lg bg-white/60 px-3 py-1.5 text-xs font-bold text-cg-ink"
              >
                {label}
              </a>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-4">
            <NotificationBell />
            <div className="text-right">
              <p className="text-sm font-bold leading-tight text-cg-ink">
                {user?.displayName || user?.username || "কর্মী"}
              </p>
              <p className="text-xs leading-tight text-cg-ink/60">কর্মী</p>
            </div>
          </div>
        </header>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
      <OfflineBanner />
    </div>
  );
}
