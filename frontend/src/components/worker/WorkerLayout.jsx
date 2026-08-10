import { Outlet } from "react-router-dom";
import WorkerSidebar from "./WorkerSidebar";
import NotificationBell from "../admin/NotificationBell";
import OfflineBanner from "../OfflineBanner";
import { useAuth } from "../../context/AuthContext";
import { useCallback, useEffect, useState } from "react";
import api from "../../api/client";
import WorkerAvatar from "./WorkerAvatar";

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
  // The worker row, for the header photo and Bangla name. The header showed
  // only `user.displayName` and no picture at all, while `workers.photo_url`
  // sat unused since V1.
  const [me, setMe] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/me/worker");
      setMe(data);
    } catch {
      // Admins and supervisors may open this console without a worker row.
      // The header falls back to the account name; nothing to report.
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  return (
    <div className="min-h-screen bg-[#e1ffc6]">
      <WorkerSidebar />
      <div className="flex min-h-screen flex-col md:ml-60">
        {/* STICKY, not static. The worker screens are long — the day ledger,
            the wage breakdown, the case list — and the bell, the offline state
            and the mobile nav were all scrolling away, so on a phone the only
            way back to another screen was to scroll to the top first.
            The sidebar is already `fixed`; this makes the header behave the
            same way instead of half the chrome staying put and half leaving. */}
        <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 bg-[#C0F28B] px-6 py-3">
          {/* Mobile nav. The sidebar is md:flex only, and unlike the other two
              consoles this one is genuinely phone-first — losing the sidebar
              must not mean losing the navigation.

              FIVE entries here against four in WORKER_NAV, and that is correct:
              settings lives in the sidebar footer, which does not exist on a
              phone, so it has to appear here or it is unreachable. */}
          <nav className="flex gap-1 overflow-x-auto md:hidden">
            {[
              ["/worker", "প্রোফাইল"],
              ["/worker/notices", "খবর"],
              ["/worker/wages", "বেতন"],
              ["/worker/report", "রিপোর্ট"],
              ["/worker/settings", "সেটিংস"],
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
                {me?.nameBn || me?.fullName || user?.displayName || user?.username || "কর্মী"}
              </p>
              <p className="text-xs leading-tight text-cg-ink/60">
                {me?.code || "কর্মী"}
              </p>
            </div>
            {/* Blob-fetched, not a bare src — the attachment endpoint is
                authenticated. See WorkerAvatar. */}
            <WorkerAvatar
              src={me?.photoUrl}
              name={me?.nameBn || me?.fullName || user?.displayName}
              size={38}
              className="ring-2 ring-white/60"
            />
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
