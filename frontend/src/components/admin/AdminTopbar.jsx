import { Link, useLocation } from "react-router-dom";
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
    <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-cg-dark/10 bg-[#c0f28b] px-4 py-3 sm:px-6">
      {/* min-w-0 so a long module name truncates rather than shoving the bell
          and avatar off the right edge. */}
      <div className="min-w-0">
        <h1 className="truncate text-base font-extrabold text-cg-ink sm:text-lg">
          {current.label}
        </h1>
        <p className="hidden text-sm text-cg-ink/60 sm:block">{today}</p>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <NotificationBell />
        {/* THE PROFILE WAS A PLAIN DIV. It looked like a control on every
            screen and responded to nothing -- there was no onClick, no href,
            no keyboard focus. It now opens Settings, which is where the
            profile, password and notification preferences already live. */}
        <Link
          to="/admin/settings"
          aria-label="Open your profile settings"
          className="flex items-center gap-3 rounded-full bg-white/50 py-1 pl-1 pr-1 transition hover:bg-white/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-cg-dark sm:pr-3"
        >
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
        </Link>
      </div>
    </header>
  );
}
