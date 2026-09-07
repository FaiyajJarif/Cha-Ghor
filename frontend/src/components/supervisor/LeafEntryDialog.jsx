import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { LuX, LuTrash2, LuPencil, LuTriangleAlert } from "react-icons/lu";

// Correct or remove one weigh-in.
//
// Replaces window.prompt / window.confirm. Those were not just off-brand: a
// native prompt gives no room to say WHAT the change does, and this number
// feeds the payroll surplus. Editing 40 kg to 4 kg is a wage change, and the
// dialog now says so before you commit it.
//
// Same header / footer bars as every other modal in the console.

const HEADER = "bg-[#14493B]";
const FIELD =
  "w-full rounded-xl border border-[#13483B]/30 bg-white px-4 py-2.5 text-sm font-semibold text-[#14493B] outline-none transition focus:border-[#14493B] focus:ring-2 focus:ring-[#14493B]/15";

// C pays like B — recorded for quality tracking, no bonus.
const GRADES = [
  { value: "A", hint: "two leaves and a bud" },
  { value: "B", hint: "coarser pluck" },
  { value: "C", hint: "very coarse" },
];

export default function LeafEntryDialog({
  open,
  mode,            // "edit" | "delete"
  entry,           // the leaf row
  quota,           // daily quota kg, so the impact can be described
  busy,
  onSave,          // (kg, grade) => void
  onDelete,        // () => void
  onClose,
}) {
  const [kg, setKg] = useState("");
  const [grade, setGrade] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!open || !entry) return;
    setKg(entry.weightKg == null ? "" : String(entry.weightKg));
    setGrade(entry.grade || "");
    setError("");
  }, [open, entry]);

  if (!open || !entry) return null;

  const before = Number(entry.weightKg || 0);
  const after = Number(kg || 0);
  const delta = after - before;
  const changed = Math.abs(delta) > 0.001 || (grade || "") !== (entry.grade || "");

  const submit = () => {
    const n = Number(kg);
    if (kg === "" || Number.isNaN(n) || n < 0) {
      setError("Enter the corrected weight in kilograms.");
      return;
    }
    if (n > 200) {
      setError("That is over 200 kg — check the scale reading before saving.");
      return;
    }
    onSave?.(n, grade || null);
  };

  return createPortal(
    <>
      <div className="fixed inset-0 z-[1200] bg-black/40" onClick={onClose} aria-hidden />
      <div className="fixed inset-0 z-[1210] flex items-center justify-center p-4">
        <div
          className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-label={mode === "delete" ? "Remove weigh-in" : "Correct weigh-in"}
        >
          {/* Header bar — same as every other modal */}
          <div className={`flex items-center justify-between ${HEADER} px-6 py-5`}>
            <div className="flex items-center gap-2">
              {mode === "delete" ? <LuTrash2 size={18} className="text-white" />
                                 : <LuPencil size={18} className="text-white" />}
              <div>
                <h3 className="text-lg font-extrabold text-white">
                  {mode === "delete" ? "Remove this weigh-in" : "Correct this weigh-in"}
                </h3>
                <p className="text-xs text-white/60">
                  {entry.workerName}
                  {entry.zone ? ` · ${entry.zone}` : ""}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid h-9 w-9 place-items-center rounded-full bg-white/20 text-white transition hover:bg-white/30"
            >
              <LuX size={16} />
            </button>
          </div>

          <div className="space-y-4 bg-[#F4FFE9] px-6 py-5">
            {error && (
              <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-sm text-rose-700">{error}</p>
            )}

            {mode === "delete" ? (
              <>
                <p className="text-sm text-[#14493B]">
                  This removes <span className="font-bold">{before} kg</span>
                  {entry.grade ? ` (grade ${entry.grade})` : ""} recorded for{" "}
                  <span className="font-bold">{entry.workerName}</span>.
                </p>
                {/* Say what it costs. A weigh-in is not a note — it is money. */}
                <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-900 ring-1 ring-amber-200">
                  <LuTriangleAlert size={15} className="mt-0.5 shrink-0" />
                  <span>
                    These kilos count towards this worker&rsquo;s surplus pay.
                    Removing them lowers what they earn for the day. The change
                    is recorded against your name.
                  </span>
                </p>
              </>
            ) : (
              <>
                <div>
                  <label className="mb-1.5 block text-sm font-bold text-[#14493B]" htmlFor="le-kg">
                    Weight (kg)
                  </label>
                  <input
                    id="le-kg"
                    autoFocus
                    type="number"
                    min={0}
                    max={200}
                    step="0.1"
                    inputMode="decimal"
                    value={kg}
                    onChange={(e) => {
                      setKg(e.target.value);
                      setError("");
                    }}
                    className={FIELD}
                  />
                  <p className="mt-1 text-xs text-[#14493B]/50">
                    Was {before} kg
                    {quota > 0 ? ` · daily quota ${quota} kg` : ""}
                  </p>
                </div>

                <div>
                  <span className="mb-1.5 block text-sm font-bold text-[#14493B]">
                    Quality grade
                  </span>
                  <div className="flex gap-2">
                    {GRADES.map((g) => (
                      <button
                        key={g.value}
                        type="button"
                        title={g.hint}
                        onClick={() => setGrade(g.value)}
                        className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-bold transition ${
                          grade === g.value
                            ? "bg-[#14493B] text-white"
                            : "bg-white text-[#14493B] ring-1 ring-[#13483B]/30 hover:bg-[#D3FFAC]"
                        }`}
                      >
                        Grade {g.value}
                        <span className="ml-1 text-[10px] font-normal opacity-70">
                          {g.hint}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* The impact, stated before it happens. */}
                {changed && (
                  <p className="rounded-xl bg-white px-4 py-3 text-xs text-[#14493B] ring-1 ring-[#13483B]/15">
                    {Math.abs(delta) > 0.001 && (
                      <>
                        <span className="font-bold">
                          {delta > 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1)} kg
                        </span>{" "}
                        against this worker&rsquo;s day.{" "}
                      </>
                    )}
                    Surplus pay is recalculated from the new total, and the change
                    is recorded against your name.
                  </p>
                )}
              </>
            )}
          </div>

          {/* Footer bar — mirrors the header */}
          <div className={`flex items-center justify-end gap-2 ${HEADER} px-6 py-4`}>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white/70 transition hover:bg-white/10"
            >
              Cancel
            </button>
            {mode === "delete" ? (
              <button
                type="button"
                onClick={onDelete}
                disabled={busy}
                className="rounded-xl bg-rose-500 px-5 py-2.5 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-50"
              >
                {busy ? "Removing…" : "Remove weigh-in"}
              </button>
            ) : (
              <button
                type="button"
                onClick={submit}
                disabled={busy || !changed}
                className="rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-[#14493B] transition hover:bg-white/90 disabled:opacity-50"
              >
                {busy ? "Saving…" : "Save correction"}
              </button>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
