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
        {ADMIN_NAV.map(({ key, label, path, icon: Icon }) => (
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
        ))}
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
