import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LuInfo } from "react-icons/lu";

// A small "i" button that reveals a short explanation of a chart/section.
// Opens on hover and on click (click helps on touch devices).
//
// The bubble is rendered in a portal with FIXED positioning so it can never be
// clipped by the sticky navbar or a card's overflow. It anchors to the button,
// flips above when there isn't enough room below, and is clamped to stay inside
// the viewport horizontally — i.e. it always opens where there's space.
const TIP_WIDTH = 224; // 14rem

export default function InfoTip({ text }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const place = () => {
      if (!btnRef.current) return;
      const r = btnRef.current.getBoundingClientRect();
      const margin = 8;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const spaceBelow = vh - r.bottom;
      // Flip above the button when the space below is tight and there's more
      // room above (e.g. tooltips near the bottom of the viewport).
      const openUp = spaceBelow < 132 && r.top > spaceBelow;
      let left = r.right - TIP_WIDTH;
      if (left < margin) left = margin;
      if (left + TIP_WIDTH > vw - margin) left = vw - margin - TIP_WIDTH;
      setPos({
        left,
        top: openUp ? undefined : r.bottom + 6,
        bottom: openUp ? vh - r.top + 6 : undefined,
      });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  return (
    <span className="relative inline-flex">
      <button
        ref={btnRef}
        type="button"
        aria-label="What is this?"
        onClick={() => setOpen((o) => !o)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="grid h-5 w-5 place-items-center rounded-full bg-cg-lime text-cg-green transition hover:bg-cg-green hover:text-white"
      >
        <LuInfo size={13} />
      </button>
      {open && pos
        ? createPortal(
            <span
              style={{
                position: "fixed",
                left: pos.left,
                top: pos.top,
                bottom: pos.bottom,
                width: TIP_WIDTH,
                zIndex: 9999,
              }}
              className="rounded-lg bg-cg-dark px-3 py-2 text-left text-xs font-medium leading-snug text-white shadow-lg"
            >
              {text}
            </span>,
            document.body,
          )
        : null}
    </span>
  );
}
