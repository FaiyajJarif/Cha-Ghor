import { useLocation } from "react-router-dom";
import { ADMIN_NAV } from "../../lib/adminNav";
import { useAuth } from "../../context/AuthContext";
import Avatar from "./Avatar";
import NotificationBell from "./NotificationBell";

// Sticky top bar. Left: current module title + date. Right: live notification
// bell + the signed-in admin's avatar, name and role. It stays fixed at the top
// of the viewport (sticky) while the module content scrolls beneath it.
export default function AdminTopbar() {
  const { pathname } = useLocation();
  const { user } = useAuth();

  const current =
    [...ADMIN_NAV]
      .sort((a, b) => b.path.length - a.path.length)
      .find((n) => pathname === n.path || pathname.startsWith(n.path + "/")) ||
    ADMIN_NAV[0];

  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-cg-dark/10 bg-[#c0f28b] px-6 py-3">
      <div>
        <h1 className="text-lg font-extrabold text-cg-ink">{current.label}</h1>
        <p className="hidden text-sm text-cg-ink/60 sm:block">{today}</p>
      </div>

      <div className="flex items-center gap-3">
        <NotificationBell />
        <div className="flex items-center gap-3 rounded-full bg-white/50 py-1 pl-1 pr-3">
          <Avatar
            name={user?.displayName || user?.username}
            src={user?.avatarUrl}
            size={36}
          />
          <div className="hidden leading-tight sm:block">
            <p className="text-sm font-bold text-cg-ink">
              {user?.displayName || user?.username || "Admin"}
            </p>
            <p className="text-[11px] uppercase tracking-wide text-cg-ink/60">
              {user?.role || "admin"}
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}
