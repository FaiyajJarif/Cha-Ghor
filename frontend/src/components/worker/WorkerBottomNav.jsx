import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  LuChevronLeft,
  LuChevronRight,
  LuSettings,
  LuLogOut,
} from "react-icons/lu";
import { WORKER_NAV, WORKER_SETTINGS } from "../../lib/workerNav";
import { useAuth } from "../../context/AuthContext";

// The worker console's mobile navigation.
//
// ============================================================================
// THE OLD ONE USED <a href>, WHICH IS A FULL PAGE RELOAD
// ============================================================================
//
// The previous mobile nav lived inside the header as five raw anchors:
//
//     <a href="/worker/wages">বেতন</a>
//
// In a single-page app that is not navigation, it is a browser reload. Every
// tap threw away the React tree, re-ran every fetch on the new screen, and --
// the part that matters here -- reloaded the app from the network. This is the
// console for pluckers standing in a field on an intermittent connection, with
// an offline outbox built precisely because that connection drops. A reload on
// a dead connection is a blank page holding a queue of unsent work.
//
// NavLink keeps it in-app, and gives an active state the anchors never had:
// the old row highlighted nothing, so the current screen was unmarked.
//
// ============================================================================
// WorkerSidebar IS `hidden md:flex`
// ============================================================================
// Below md it does not render, so this is the only navigation a phone has --
// and this console is the one most likely to only ever be used on a phone.
//
// Settings is included even though WORKER_NAV deliberately excludes it: the
// sidebar renders it in a footer slot that does not exist on a phone, so
// without it here the screen is unreachable below md. Same reasoning the old
// header row used, kept.
export default function WorkerBottomNav() {
  const ref = useRef(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const { pathname } = useLocation();
  const { logout } = useAuth();
  const navigate = useNavigate();

  const signOut = () => {
    logout();
    navigate("/login");
  };

  // Measured, not assumed: whether the row overflows depends on the Bangla
  // labels and the screen width, neither of which is knowable up front.
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

  // Bring the active tab into view on navigation, or opening a screen from a
  // link leaves its tab off-screen and the bar looks like nothing is selected.
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
    const t = setTimeout(measure, 400);
    return () => clearTimeout(t);
  }, [pathname]);

  const nudge = (dir) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.6, behavior: "smooth" });
  };

  const arrow =
    "absolute top-1/2 z-10 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-cg-ink shadow-md ring-1 ring-cg-dark/10 active:scale-90 transition";

  // Wider than the other two consoles' 76px. Bangla labels like
  // "প্রশাসককে রিপোর্ট" are long, and truncating a worker's only navigation
  // into "প্রশাসক…" helps nobody.
  const tab =
    "flex w-[88px] shrink-0 flex-col items-center justify-center gap-1 py-2 text-[10px] font-semibold";

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
              aria-label="বাঁ দিকে"
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
          {WORKER_NAV.map(({ key, label, path, icon: Icon, ready }) =>
            ready ? (
              <NavLink key={key} to={path} end={path === "/worker"} className={tab}>
                {({ isActive }) => (
                  <span
                    data-active={isActive ? "true" : "false"}
                    className="flex flex-col items-center gap-1"
                  >
                    <span className={pill(isActive)}>
                      <Icon size={17} />
                    </span>
                    <span
                      className={`max-w-[84px] truncate transition-colors ${
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
                title="এই পাতা এখনো তৈরি হয়নি"
                className={`${tab} cursor-not-allowed text-cg-ink/35`}
              >
                <span className="grid h-8 w-12 place-items-center rounded-full">
                  <Icon size={17} />
                </span>
                <span className="max-w-[84px] truncate">{label}</span>
              </span>
            ),
          )}

          {/* Settings and log out ride at the end of the same row. */}
          <NavLink to={WORKER_SETTINGS.path} end className={tab}>
            {({ isActive }) => (
              <span
                data-active={isActive ? "true" : "false"}
                className="flex flex-col items-center gap-1"
              >
                <span className={pill(isActive)}>
                  <LuSettings size={17} />
                </span>
                <span className={isActive ? "text-cg-dark" : "text-cg-ink/70"}>
                  {WORKER_SETTINGS.label}
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
            লগ আউট
          </button>
        </div>

        {edges.right && (
          <>
            <div className="pointer-events-none absolute inset-y-0 right-0 z-[5] w-12 bg-gradient-to-l from-[#95c260] to-transparent" />
            <button
              type="button"
              onClick={() => nudge(1)}
              aria-label="ডান দিকে"
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
