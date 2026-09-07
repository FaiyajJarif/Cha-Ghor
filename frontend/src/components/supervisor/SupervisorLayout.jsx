import { Outlet } from "react-router-dom";
import { LuSearch } from "react-icons/lu";
import SupervisorSidebar from "./SupervisorSidebar";
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
        <header className="flex flex-wrap items-center justify-between gap-3 bg-[#C0F28B] px-6 py-3">
          {/* Search is presentational for now — there is no cross-module search
              endpoint. Cha Bot answers this kind of question already, so the
              box is disabled rather than pretending to work. */}
          <label className="relative hidden max-w-md flex-1 items-center sm:flex">
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
          <div className="ml-auto flex items-center gap-4">
            {/* The real bell, same component the admin console uses. It opens
                /ws/notifications and now receives case events too, so a report
                raised by another supervisor lights this up without a reload. */}
            <NotificationBell />
            <div className="text-right">
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
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
      <ChaBot suggestions={SUGGESTIONS} />
      <OfflineBanner />
    </div>
  );
}
