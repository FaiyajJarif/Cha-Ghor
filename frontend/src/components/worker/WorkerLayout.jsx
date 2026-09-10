import { Outlet } from "react-router-dom";
import { LuLeaf } from "react-icons/lu";
import WorkerSidebar from "./WorkerSidebar";
import WorkerBottomNav from "./WorkerBottomNav";
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
        <header className="sticky top-0 z-30 flex items-center justify-between gap-2 bg-[#C0F28B] px-4 py-3 sm:px-6">
          {/* THE MOBILE NAV THAT WAS HERE HAS MOVED TO WorkerBottomNav.
              It was five raw <a href> anchors, which in a single-page app is a
              full browser reload per tap -- on the one console most likely to
              be used offline, in a field, by someone with queued work in the
              outbox. See WorkerBottomNav for the rest of the reasoning.

              The brand takes its place below md: it only exists in the sidebar,
              and the sidebar is `hidden md:flex`, so the header opened with
              nothing on the left and everything jammed against the right. */}
          <div className="flex min-w-0 items-center gap-2 md:hidden">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-cg-dark text-white">
              <LuLeaf size={17} />
            </span>
            <div className="min-w-0">
              <p className="truncate font-extrabold leading-none text-cg-ink">
                Cha Ghor
              </p>
              <p className="truncate text-[10px] uppercase tracking-wide text-cg-ink/60">
                Tea Garden Management
              </p>
            </div>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-4">
            <NotificationBell />
            {/* The name is the first thing to go on a narrow screen: the brand
                on the left and the photo on the right already say who and where
                you are, and two text blocks in one 360px bar leaves room for
                neither. */}
            <div className="hidden text-right sm:block">
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
        {/* p-6 on a 360px screen spends 13% of the width on margins.
            pb-24 keeps the last card clear of the fixed bottom bar, which
            would otherwise cover it with no way to scroll further.
            overflow-x-hidden is a guard: one un-shrinkable element anywhere
            widens the whole document, and then every card renders against a
            page wider than the phone and looks like it runs off the right
            edge. Safe here -- the header is sticky but is a SIBLING of main,
            not a descendant, and modals portal to document.body. */}
        <main className="flex-1 overflow-x-hidden p-4 pb-24 sm:p-6 md:pb-6">
          <Outlet />
        </main>
      </div>
      <WorkerBottomNav />
      <OfflineBanner />
    </div>
  );
}
