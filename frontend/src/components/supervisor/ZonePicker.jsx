import { useEffect, useRef, useState } from "react";
import { LuChevronDown, LuMapPin, LuCheck, LuHouse } from "react-icons/lu";

// Zone selector, replacing the bare <select> that looked out of place.
//
// A native select is fine for a long list of strings, but a field assignment is
// a short list of named places the supervisor knows by sight — so this shows
// them as a proper menu with the home zone called out, a tick on the current
// choice, and the estate's own colour language instead of the browser's.
//
// Closes on outside click and on Escape, and is keyboard reachable.
export default function ZonePicker({
  value, // zoneId | null  (null = home zone)
  zones,
  homeZoneName,
  onChange,
  size = "sm",
  placeholder = "Select a zone",
  allowHome = true,
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selected = zones.find((z) => z.id === value);
  const label = selected
    ? selected.label
    : allowHome
      ? homeZoneName
        ? `${homeZoneName}`
        : placeholder
      : placeholder;

  const pad = size === "lg" ? "px-4 py-2.5 text-sm" : "px-3 py-1.5 text-xs";

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex w-full items-center gap-2 rounded-xl border bg-white font-semibold text-cg-ink transition ${pad} ${
          open
            ? "border-cg-green ring-2 ring-cg-green/20"
            : "border-[#13483B59] hover:border-cg-green"
        }`}
      >
        <span
          className={`grid shrink-0 place-items-center rounded-lg bg-cg-lime text-cg-green ${
            size === "lg" ? "h-6 w-6" : "h-5 w-5"
          }`}
        >
          <LuMapPin size={size === "lg" ? 14 : 12} />
        </span>
        <span className="truncate">{label}</span>
        {!selected && allowHome && homeZoneName ? (
          <span className="shrink-0 rounded-full bg-cg-lime/70 px-1.5 py-0.5 text-[9px] font-bold uppercase text-cg-green">
            home
          </span>
        ) : null}
        <LuChevronDown
          size={14}
          className={`ml-auto shrink-0 text-cg-ink/40 transition ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute z-30 mt-1 max-h-60 w-full min-w-[11rem] overflow-y-auto rounded-xl border border-[#13483B59] bg-white py-1 shadow-xl"
        >
          {allowHome && (
            <li>
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-cg-ink hover:bg-cg-lime/40"
              >
                <LuHouse size={13} className="text-cg-green" />
                <span className="truncate">
                  {homeZoneName ? `${homeZoneName} · home` : "Home zone"}
                </span>
                {value == null && (
                  <LuCheck size={14} className="ml-auto text-cg-green" />
                )}
              </button>
            </li>
          )}
          {zones.map((z) => (
            <li key={z.id}>
              <button
                type="button"
                onClick={() => {
                  onChange(z.id);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-cg-ink hover:bg-cg-lime/40"
              >
                <LuMapPin size={13} className="text-cg-ink/40" />
                <span className="truncate">{z.label}</span>
                {value === z.id && (
                  <LuCheck size={14} className="ml-auto text-cg-green" />
                )}
              </button>
            </li>
          ))}
          {zones.length === 0 && (
            <li className="px-3 py-2 text-xs text-cg-ink/40">
              No zones configured
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
