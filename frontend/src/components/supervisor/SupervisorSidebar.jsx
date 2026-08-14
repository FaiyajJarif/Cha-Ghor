import { NavLink, useNavigate } from "react-router-dom";
import { LuLeaf, LuLogOut, LuSettings } from "react-icons/lu";
import { SUPERVISOR_NAV } from "../../lib/supervisorNav";
import { useAuth } from "../../context/AuthContext";
import { BTN_DARK } from "../../lib/ui";

// Fixed left navigation for the supervisor console, same chrome as the admin
// sidebar so the two consoles feel like one product.
//
// Screens without a backend yet are dimmed and marked "soon" rather than hidden:
// hiding them makes the console look smaller than the plan, but letting them
// look live would send a supervisor to an empty page.
export default function SupervisorSidebar() {
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
          <p className="text-[11px] uppercase tracking-wide text-cg-ink/60">
            Tea Garden Management
          </p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {SUPERVISOR_NAV.map(({ key, label, path, icon: Icon, ready }) =>
          ready ? (
            <NavLink
              key={key}
              to={path}
              end={path === "/supervisor"}
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
          ) : (
            <span
              key={key}
              title="Screen not built yet"
              className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold text-cg-ink/35"
            >
              <Icon size={18} />
              {label}
              <span className="ml-auto rounded-full bg-white/40 px-1.5 py-0.5 text-[9px] font-bold uppercase">
                soon
              </span>
            </span>
          ),
        )}
      </nav>

      <div className="space-y-2 border-t border-cg-dark/15 px-3 py-4">
        {/* Settings sits beside logout, not in the nav above — this slot was
            already reserved by a dead "Settings coming with the supervisor
            screens" label. Same placement as the worker console. */}
        <NavLink
          to="/supervisor/settings"
          end
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition ${
              isActive ? "bg-cg-dark text-white" : "text-cg-ink/80 hover:bg-white/40"
            }`
          }
        >
          <LuSettings size={18} /> Settings
        </NavLink>
        <button onClick={signOut} className={BTN_DARK + " w-full"}>
          <LuLogOut size={16} /> Log Out
        </button>
      </div>
    </aside>
  );
}
