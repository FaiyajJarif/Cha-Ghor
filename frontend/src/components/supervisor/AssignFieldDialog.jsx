import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { LuX, LuMapPin, LuChevronDown, LuCircleCheck } from "react-icons/lu";
import api from "../../api/client";
import { apiError } from "../../lib/apiError";

// "Which field is this?" — opens after a marker is dropped on the map.
//
// The order matters: a supervisor standing at a boundary drops the pin where
// they are, THEN says which field it is. Making them pick the field first means
// remembering which one they were about to place while hunting for it on a
// list, which is the wrong way round in the field.
//
// Fields already on the map are still selectable — choosing one moves it, which
// is the natural way to correct a pin that was dropped in the wrong place.

const HEADER = "bg-[#14493B]";
const FIELD =
  "w-full rounded-xl border border-[#13483B]/30 bg-white px-4 py-2.5 text-sm text-[#14493B] outline-none transition focus:border-[#14493B] focus:ring-2 focus:ring-[#14493B]/15";

export default function AssignFieldDialog({
  open,
  position, // [lat, lng] where the pin was dropped
  fields,
  onSaved,
  onClose,
}) {
  const [zoneId, setZoneId] = useState("");
  const [diameter, setDiameter] = useState(500);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (open) {
      setZoneId("");
      setDiameter(500);
      setError("");
      setDone(null);
    }
  }, [open, position]);

  const save = async () => {
    if (!zoneId) {
      setError("Choose which field this marker is.");
      return;
    }
    if (!position) {
      setError("No position was captured. Click the map again.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      // The UI works in diameter because that is what someone pacing a field
      // thinks in; the API stores a radius.
      await api.put(`/zones/${zoneId}/geometry`, {
        lat: position[0],
        lng: position[1],
        radiusM: Math.round(diameter / 2),
      });
      const f = fields.find((x) => String(x.id) === zoneId);
      setDone(f?.name || "Field");
      onSaved?.();
    } catch (err) {
      setError(apiError(err, "Could not save that field's position."));
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  const unplaced = fields.filter((f) => !f.placed);
  const placed = fields.filter((f) => f.placed);

  return createPortal(
    <>
      <div className="fixed inset-0 z-[1200] bg-black/40" onClick={onClose} aria-hidden />
      <div className="fixed inset-0 z-[1210] flex items-center justify-center p-4">
        <div
          className="w-full max-w-sm overflow-hidden rounded-3xl bg-white shadow-2xl"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-label="Assign field to marker"
        >
          {done ? (
            <div className="flex flex-col items-center px-8 py-9 text-center">
              <LuCircleCheck size={54} strokeWidth={1.5} className="text-[#14493B]" />
              <h3 className="mt-5 text-xl font-extrabold text-[#14493B]">
                {done} placed
              </h3>
              <p className="mt-2 text-sm text-[#14493B]/60">
                It is now drawn on the map at that position.
              </p>
              <button
                type="button"
                onClick={onClose}
                className={`mt-7 w-full rounded-2xl ${HEADER} px-6 py-3 text-sm font-semibold text-white transition hover:brightness-110`}
              >
                Done
              </button>
            </div>
          ) : (
            <>
              <div className={`flex items-center justify-between ${HEADER} px-6 py-4`}>
                <div className="flex items-center gap-2">
                  <LuMapPin size={18} className="text-white" />
                  <h3 className="text-lg font-extrabold text-white">
                    Assign this marker
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="grid h-8 w-8 place-items-center rounded-full bg-white/20 text-white transition hover:bg-white/30"
                >
                  <LuX size={16} />
                </button>
              </div>

              <div className="space-y-4 px-6 py-5">
                {position ? (
                  <p className="rounded-xl bg-[#D3FFAC] px-4 py-2 text-xs font-semibold text-[#14493B]">
                    Dropped at {position[0].toFixed(5)}, {position[1].toFixed(5)}
                  </p>
                ) : null}

                {error && (
                  <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-sm text-rose-700">
                    {error}
                  </p>
                )}

                <div>
                  <label className="mb-1.5 block text-sm font-bold text-[#14493B]" htmlFor="af-zone">
                    Field name
                  </label>
                  <div className="relative">
                    <select
                      id="af-zone"
                      autoFocus
                      value={zoneId}
                      onChange={(e) => {
                        setZoneId(e.target.value);
                        setError("");
                      }}
                      className={`${FIELD} appearance-none pr-10`}
                    >
                      <option value="">Select a field…</option>
                      {unplaced.length > 0 && (
                        <optgroup label="Not placed yet">
                          {unplaced.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.name}
                              {f.code ? ` (${f.code})` : ""}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {placed.length > 0 && (
                        <optgroup label="Already placed — choosing one moves it">
                          {placed.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.name}
                              {f.code ? ` (${f.code})` : ""}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                    <LuChevronDown
                      size={15}
                      className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[#14493B]/50"
                    />
                  </div>
                  {unplaced.length === 0 && (
                    <p className="mt-1.5 text-xs text-[#14493B]/50">
                      Every field is already on the map — pick one to move it here.
                    </p>
                  )}
                </div>

                <div>
                  <label className="mb-1 block text-sm font-bold text-[#14493B]">
                    Diameter: {diameter} m
                  </label>
                  <input
                    type="range"
                    min={20}
                    max={4000}
                    step={20}
                    value={diameter}
                    onChange={(e) => setDiameter(Number(e.target.value))}
                    className="w-full accent-[#14493B]"
                  />
                  <p className="mt-1 text-xs text-[#14493B]/50">
                    Roughly how wide the field is across.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-[#13483B]/10 px-6 py-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl px-4 py-2.5 text-sm font-semibold text-[#14493B]/60 transition hover:bg-[#D3FFAC]/50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={save}
                  disabled={busy}
                  className={`rounded-xl ${HEADER} px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50`}
                >
                  {busy ? "Saving…" : "Save position"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}
