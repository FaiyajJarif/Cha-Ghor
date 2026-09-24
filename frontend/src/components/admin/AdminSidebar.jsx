import { NavLink, useNavigate } from "react-router-dom";
import { LuLeaf, LuLogOut, LuSettings } from "react-icons/lu";
import { ADMIN_NAV } from "../../lib/adminNav";
import { useAuth } from "../../context/AuthContext";
import { BTN_DARK } from "../../lib/ui";

// Persistent, FIXED left navigation. It stays pinned to the viewport while the
// main content scrolls, so the Settings + Logout buttons at the bottom never
// drift down the page. The admin profile now lives in the header (top right).
export default function AdminSidebar() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const signOut = () => {
    logout();
    navigate("/login");
  };

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col bg-[#95c260] text-cg-ink md:flex">
      <div className="flex items-center gap-2 px-5 py-5">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-cg-dark text-white">
          <LuLeaf size={20} />
        </span>
        <div>
          <p className="font-extrabold leading-none">Cha Ghor</p>
          <p className="text-[11px] text-cg-ink/60">Estate Admin</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {ADMIN_NAV.map(({ key, label, path, icon: Icon, soon }) =>
          // OUT OF SCOPE: rendered as a plain div, NOT a disabled NavLink.
          // A NavLink with pointer-events-none still sits in the tab order and
          // still navigates on Enter, so the module would stay reachable by
          // keyboard while looking unavailable to everyone else.
          soon ? (
            <div
              key={key}
              aria-disabled="true"
              title={`${label} is not part of the current build`}
              className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold text-cg-ink/35"
            >
              <Icon size={18} />
              <span className="min-w-0 flex-1 truncate">{label}</span>
              <span className="shrink-0 rounded-full bg-cg-ink/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                Soon
              </span>
            </div>
          ) : (
            <NavLink
              key={key}
              to={path}
              end={path === "/admin"}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                  isActive
                    ? "bg-cg-dark text-white shadow"
                    : "text-cg-ink/80 hover:bg-white/30 hover:text-cg-ink"
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ),
        )}
      </nav>

      <div className="space-y-2 border-t border-cg-dark/15 px-3 py-4">
        <NavLink to="/admin/settings" className={BTN_DARK + " w-full"}>
          <LuSettings size={16} /> Settings
        </NavLink>
        <button onClick={signOut} className={BTN_DARK + " w-full"}>
          <LuLogOut size={16} /> Logout
        </button>
      </div>
    </aside>
  );
}
