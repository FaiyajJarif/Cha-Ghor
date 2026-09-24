import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  LuChevronLeft,
  LuChevronRight,
  LuSettings,
  LuLogOut,
} from "react-icons/lu";
import { SUPERVISOR_NAV } from "../../lib/supervisorNav";
import { useAuth } from "../../context/AuthContext";

// The supervisor console's mobile navigation.
//
// ============================================================================
// SupervisorSidebar IS `hidden md:flex`
// ============================================================================
// Below md it does not render and nothing replaced it, so a supervisor on a
// phone had NO navigation whatsoever -- they could reach the dashboard and
// then nothing else. That is the whole reason this file exists, and it is the
// same hole the admin console had.
//
// Deliberately the same component as AdminBottomNav rather than a new idea:
// SupervisorSidebar's own comment says the two consoles should feel like one
// product, and a supervisor who has seen the admin console on a phone should
// not have to learn a second navigation.
//
// Every screen is in the bar and the bar scrolls. Arrows appear ONLY when
// there is more in that direction, so their presence is information -- no
// arrow means you have seen everything.
export default function SupervisorBottomNav() {
  const ref = useRef(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const { pathname } = useLocation();
  const { logout } = useAuth();
  const navigate = useNavigate();

  const signOut = () => {
    logout();
    navigate("/login");
  };

  // Measured, not assumed: whether the row overflows depends on the labels and
  // the screen width, neither of which is knowable up front.
  const measure = () => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    // 4px of slack -- sub-pixel layout means scrollLeft rarely reaches the
    // maximum exactly, which would leave the right arrow showing forever.
    setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft < max - 4 });
  };

  useEffect(() => {
    measure();
    const el = ref.current;
    if (!el) return undefined;
    el.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      el.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, []);

  // Bring the active tab into view on navigation. Open Broadcast from a link
  // and its tab is off screen to the right, so the bar shows nothing selected
  // and looks broken.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const active = el.querySelector("[data-active='true']");
    if (active) {
      active.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }
    // Re-measure after the smooth scroll settles, or the arrows lag a frame
    // behind the position they describe.
    const t = setTimeout(measure, 400);
    return () => clearTimeout(t);
  }, [pathname]);

  const nudge = (dir) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.6, behavior: "smooth" });
  };

  const arrow =
    "absolute top-1/2 z-10 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-cg-ink shadow-md ring-1 ring-cg-dark/10 active:scale-90 transition";

  const tab =
    "flex w-[76px] shrink-0 flex-col items-center justify-center gap-1 py-2 text-[10px] font-semibold";

  const pill = (isActive) =>
    `grid place-items-center rounded-full transition-all duration-300 ease-out ${
      isActive
        ? "h-9 w-14 -translate-y-0.5 bg-cg-dark text-white shadow-md"
        : "h-8 w-12 bg-transparent text-cg-ink/70 active:scale-90"
    }`;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-cg-dark/10 bg-[#95c260] md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="relative">
        {edges.left && (
          <>
            <div className="pointer-events-none absolute inset-y-0 left-0 z-[5] w-12 bg-gradient-to-r from-[#95c260] to-transparent" />
            <button
              type="button"
              onClick={() => nudge(-1)}
              aria-label="Scroll navigation left"
              className={`${arrow} left-1`}
            >
              <LuChevronLeft size={17} />
            </button>
          </>
        )}

        <div
          ref={ref}
          className="scrollbar-none flex overflow-x-auto scroll-smooth px-1"
        >
          {SUPERVISOR_NAV.map(({ key, label, path, icon: Icon, ready }) =>
            // A screen without a backend is dimmed rather than hidden, the same
            // choice the sidebar makes -- hiding it makes the console look
            // smaller than it is, letting it look live sends someone nowhere.
            ready ? (
              <NavLink key={key} to={path} end={path === "/supervisor"} className={tab}>
                {({ isActive }) => (
                  <span
                    data-active={isActive ? "true" : "false"}
                    className="flex flex-col items-center gap-1"
                  >
                    {/* The pill grows and lifts on the active tab, and every tab
                        dips when pressed. Movement is what tells you a tap
                        registered on a touch screen, where there is no hover. */}
                    <span className={pill(isActive)}>
                      <Icon size={17} />
                    </span>
                    <span
                      className={`max-w-[72px] truncate transition-colors ${
                        isActive ? "text-cg-dark" : "text-cg-ink/70"
                      }`}
                    >
                      {label}
                    </span>
                  </span>
                )}
              </NavLink>
            ) : (
              <span
                key={key}
                title="Screen not built yet"
                className={`${tab} cursor-not-allowed text-cg-ink/35`}
              >
                <span className="grid h-8 w-12 place-items-center rounded-full">
                  <Icon size={17} />
                </span>
                <span className="max-w-[72px] truncate">{label}</span>
              </span>
            ),
          )}

          {/* Settings and Log out ride at the end of the same row rather than
              in a separate sheet -- one scroll reaches everything. */}
          <NavLink to="/supervisor/settings" end className={tab}>
            {({ isActive }) => (
              <span
                data-active={isActive ? "true" : "false"}
                className="flex flex-col items-center gap-1"
              >
                <span className={pill(isActive)}>
                  <LuSettings size={17} />
                </span>
                <span className={isActive ? "text-cg-dark" : "text-cg-ink/70"}>
                  Settings
                </span>
              </span>
            )}
          </NavLink>

          <button
            type="button"
            onClick={signOut}
            className={`${tab} text-red-800`}
          >
            <span className="grid h-8 w-12 place-items-center rounded-full transition active:scale-90">
              <LuLogOut size={17} />
            </span>
            Log out
          </button>
        </div>

        {edges.right && (
          <>
            <div className="pointer-events-none absolute inset-y-0 right-0 z-[5] w-12 bg-gradient-to-l from-[#95c260] to-transparent" />
            <button
              type="button"
              onClick={() => nudge(1)}
              aria-label="Scroll navigation right"
              className={`${arrow} right-1`}
            >
              <LuChevronRight size={17} />
            </button>
          </>
        )}
      </div>
    </nav>
  );
}
