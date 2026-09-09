import { useEffect, useRef, useState } from "react";
import { LuChevronLeft, LuChevronRight } from "react-icons/lu";

// One row of pill tabs that scrolls sideways when it does not fit.
//
// ============================================================================
// WHY EVERY FILTER STRIP LOOKED CRAMMED
// ============================================================================
//
// Each page built its own with `flex flex-wrap gap-2`. On a phone that wraps
// into three or four ragged lines of half-width buttons, and the eye cannot
// tell which one is selected because the active state is a slightly different
// green on a shape that keeps changing size.
//
// A single scrolling ROW fixes both: the tabs keep one consistent height and
// order, and the selected one is unmistakable. Anything that does not fit is
// reached by swiping, which is the gesture people already expect from a tab
// strip on a phone.
//
// The arrows are not decoration. A row that silently cuts off at the screen
// edge reads as "these are all the filters" -- so they appear ONLY when there
// is genuinely more in that direction, which makes their presence information
// rather than furniture.
export default function FilterTabs({ tabs, value, onChange, className = "" }) {
  const ref = useRef(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  // Measured, never assumed. Whether the row overflows depends on the label
  // text, the font and the screen, none of which can be known up front.
  const measure = () => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setEdges({
      left: el.scrollLeft > 4,
      // 4px of slack: sub-pixel layout means scrollLeft rarely lands exactly
      // on the maximum, which would leave the right arrow showing forever.
      right: el.scrollLeft < max - 4,
    });
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
    // Re-measure when the tab set changes -- a status filter can add or remove
    // counts, which changes the width of every label.
  }, [tabs]);

  const nudge = (dir) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.7, behavior: "smooth" });
  };

  const arrow =
    "absolute top-1/2 z-10 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full bg-white text-cg-ink shadow ring-1 ring-cg-green/20";

  return (
    <div className={`relative ${className}`}>
      {edges.left && (
        <>
          {/* The fade tells you content continues; the button gives you a way
              to move it without a precise swipe. */}
          <div className="pointer-events-none absolute inset-y-0 left-0 z-[5] w-10 bg-gradient-to-r from-white to-transparent" />
          <button
            type="button"
            onClick={() => nudge(-1)}
            aria-label="Scroll filters left"
            className={`${arrow} left-0`}
          >
            <LuChevronLeft size={16} />
          </button>
        </>
      )}

      <div
        ref={ref}
        // scrollbar-none keeps the row the same height on desktop, where a
        // visible scrollbar would push the pills up by ~15px.
        className="scrollbar-none flex gap-2 overflow-x-auto scroll-smooth py-1"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {tabs.map((t) => {
          const active = t.key === value;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => onChange(t.key)}
              // shrink-0 is what makes this a scrolling row rather than a
              // squashed one: without it flex compresses every pill until the
              // labels are unreadable instead of overflowing.
              className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition ${
                active
                  ? "bg-cg-dark text-white shadow"
                  : "bg-white text-cg-ink/70 ring-1 ring-cg-green/15 hover:bg-cg-lime/40"
              }`}
              aria-pressed={active}
            >
              {t.label}
              {t.count != null && (
                <span
                  className={`ml-2 rounded-full px-1.5 py-0.5 text-[11px] ${
                    active ? "bg-white/20" : "bg-cg-lime/60 text-cg-green"
                  }`}
                >
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {edges.right && (
        <>
          <div className="pointer-events-none absolute inset-y-0 right-0 z-[5] w-10 bg-gradient-to-l from-white to-transparent" />
          <button
            type="button"
            onClick={() => nudge(1)}
            aria-label="Scroll filters right"
            className={`${arrow} right-0`}
          >
            <LuChevronRight size={16} />
          </button>
        </>
      )}
    </div>
  );
}
