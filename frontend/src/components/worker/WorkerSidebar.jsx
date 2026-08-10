import { NavLink, useNavigate } from "react-router-dom";
import { LuLeaf, LuLogOut, LuSettings } from "react-icons/lu";
import { WORKER_NAV, WORKER_SETTINGS } from "../../lib/workerNav";
import { useAuth } from "../../context/AuthContext";
import { BTN_DARK } from "../../lib/ui";

// Fixed left navigation for the worker console.
//
// Deliberately the SAME chrome as the admin and supervisor sidebars — same
// width, same colour, same active state, same dimmed "soon" treatment for
// screens without a backend. The first version of this shell invented its own
// layout and the three consoles stopped looking like one product.
//
// Only the labels differ: they are Bangla here, because the people using this
// console read Bangla and the other two are used by the office.
export default function WorkerSidebar() {
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
        {WORKER_NAV.map(({ key, label, path, icon: Icon, ready }) =>
          ready ? (
            <NavLink
              key={key}
              to={path}
              end={path === "/worker"}
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
              title="এই পাতাটি এখনো তৈরি হয়নি"
              className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold text-cg-ink/35"
            >
              <Icon size={18} />
              {label}
              <span className="ml-auto rounded-full bg-white/40 px-1.5 py-0.5 text-[9px] font-bold uppercase">
                শীঘ্রই
              </span>
            </span>
          ),
        )}
      </nav>

      <div className="space-y-2 border-t border-cg-dark/15 px-3 py-4">
        {/* Settings sits here rather than in the nav above. This slot already
            existed as a dead "সেটিংস পরে যুক্ত হবে" label; it is now the real
            link, so the destination exists in exactly one place. */}
        <NavLink
          to={WORKER_SETTINGS.path}
          end
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition ${
              isActive
                ? "bg-cg-dark text-white"
                : "text-cg-ink/80 hover:bg-white/40"
            }`
          }
        >
          <LuSettings size={18} /> {WORKER_SETTINGS.label}
        </NavLink>
        <button onClick={signOut} className={BTN_DARK + " w-full"}>
          <LuLogOut size={16} /> লগ আউট
        </button>
      </div>
    </aside>
  );
}
