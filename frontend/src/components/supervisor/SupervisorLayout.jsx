import { Outlet } from "react-router-dom";
import { LuLeaf, LuSearch } from "react-icons/lu";
import SupervisorSidebar from "./SupervisorSidebar";
import SupervisorBottomNav from "./SupervisorBottomNav";
import ChaBot from "../admin/ChaBot";
import NotificationBell from "../admin/NotificationBell";
import UserAvatar from "../UserAvatar";
import OfflineBanner from "../OfflineBanner";
import { useAuth } from "../../context/AuthContext";

// The supervisor shell. Cha Bot is included because /chatbot/ask already
// permits supervisors — they just never had a screen to reach it from.
//
// OfflineBanner matters more here than on the admin side: supervisors work in
// the field where connectivity drops, which is the whole reason outbox.js
// exists.
const SUGGESTIONS = [
  "How many workers were present today?",
  "Total leaf collected today",
  "Which zone collected the most this week?",
  "Who was absent today?",
];

export default function SupervisorLayout() {
  const { user } = useAuth();
  return (
    <div className="min-h-screen bg-[#e1ffc6]">
      <SupervisorSidebar />
      <div className="flex min-h-screen flex-col md:ml-60">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-2 bg-[#C0F28B] px-4 py-3 sm:px-6">
          {/* THE BRAND ONLY EXISTS IN THE SIDEBAR, AND THE SIDEBAR IS
              `hidden md:flex`. So on a phone the header opened with nothing on
              the left and everything jammed against the right edge. Below md
              the brand moves here, which is also what the Figma frame shows. */}
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

          {/* Search is presentational for now — there is no cross-module search
              endpoint. Cha Bot answers this kind of question already, so the
              box is disabled rather than pretending to work. */}
          <label className="relative hidden max-w-md flex-1 items-center md:flex">
            <LuSearch
              size={16}
              className="pointer-events-none absolute left-3 text-cg-ink/40"
            />
            <input
              disabled
              placeholder="Search across the ledger…"
              title="Not wired yet — ask Cha Bot instead"
              className="w-full cursor-not-allowed rounded-full border border-white/60 bg-white/70 py-2 pl-9 pr-4 text-sm text-cg-ink/50 outline-none"
            />
          </label>
          <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-4">
            {/* The real bell, same component the admin console uses. It opens
                /ws/notifications and now receives case events too, so a report
                raised by another supervisor lights this up without a reload. */}
            <NotificationBell />
            {/* The name is the first thing to go on a narrow screen: the brand
                on the left and the avatar already say who and where you are,
                and two text blocks in one 360px bar leaves room for neither. */}
            <div className="hidden text-right sm:block">
              <p className="text-sm font-bold leading-tight text-cg-ink">
                {user?.displayName || user?.username || "Supervisor"}
              </p>
              <p className="text-xs leading-tight text-cg-ink/60">Supervisor</p>
            </div>
            {/* Blob-fetched for uploaded avatars, direct for pasted URLs —
                see UserAvatar. */}
            <UserAvatar
              src={user?.avatarUrl}
              name={user?.displayName || user?.username}
              size={38}
              className="ring-2 ring-white/60"
            />
          </div>
        </header>
        {/* p-6 on a 360px screen spends 13% of the width on margins.
            pb-24 keeps the last card clear of the fixed bottom bar, which
            would otherwise cover it with no way to scroll further.
            overflow-x-hidden is a guard: one un-shrinkable element anywhere
            widens the whole document, and then every card on the page renders
            against a page wider than the phone and looks like it runs off the
            right edge. Safe here -- the header is sticky but is a SIBLING of
            main, not a descendant, and modals portal to document.body. */}
        <main className="flex-1 overflow-x-hidden p-4 pb-24 sm:p-6 md:pb-6">
          <Outlet />
        </main>
      </div>
      <SupervisorBottomNav />
      <ChaBot suggestions={SUGGESTIONS} />
      <OfflineBanner />
    </div>
  );
}
