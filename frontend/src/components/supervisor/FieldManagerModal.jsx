import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  LuX,
  LuPlus,
  LuPencil,
  LuArchive,
  LuArchiveRestore,
  LuMapPin,
  LuTriangleAlert,
} from "react-icons/lu";
import api from "../../api/client";
import { apiError } from "../../lib/apiError";
import { queueOrSend } from "../../lib/outbox";

// Add, rename and retire fields.
//
// "Delete" is deliberately absent. Removing a zone row would NULL
// attendance.zone_id and leaf_collection.zone_id, so every past record of who
// worked that field and how much leaf came off it would lose its attribution —
// permanently, silently, and after the fact. Retiring hides the field from
// every picker and map while leaving all of that intact, and it is reversible.
//
// Admin only: adding or retiring a field changes what every supervisor sees.

const HEADER = "bg-[#14493B]";
const FIELD =
  "w-full rounded-xl border border-[#13483B]/30 bg-white px-3 py-2 text-sm text-[#14493B] outline-none transition focus:border-[#14493B] focus:ring-2 focus:ring-[#14493B]/15";

const EMPTY = { id: null, name: "", code: "", areaHectare: "", targetKgPerDay: "" };

// canSetTarget defaults to false so a caller that forgets to pass it shows the
// SAFER thing (a read-only target) rather than an input that 403s on save.
export default function FieldManagerModal({
  open,
  onClose,
  onChanged,
  canSetTarget = false,
}) {
  const [live, setLive] = useState([]);
  const [retired, setRetired] = useState([]);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmArchive, setConfirmArchive] = useState(null);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([
      api.get("/zones"),
      api.get("/zones/archived").catch(() => ({ data: [] })),
    ]);
    setLive(a.data || []);
    setRetired(b.data || []);
  }, []);

  useEffect(() => {
    if (!open) return;
    setForm(null);
    setError("");
    setNotice("");
    load().catch((err) => setError(apiError(err, "Could not load the fields.")));
  }, [open, load]);

  const save = async () => {
    if (!form?.name?.trim()) {
      setError("Give the field a name.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const body = {
        name: form.name.trim(),
        code: form.code?.trim() || null,
        areaHectare: form.areaHectare === "" ? null : Number(form.areaHectare),
        targetKgPerDay: form.targetKgPerDay === "" ? null : Number(form.targetKgPerDay),
      };
      if (form.id) {
        // Renaming a field is idempotent — replaying it lands on the same
        // name — so it can safely go through the offline outbox.
        const { queued } = await queueOrSend({
          path: `/zones/${form.id}`,
          method: "PUT",
          body,
        });
        setNotice(
          queued
            ? `${body.name} saved on this device. It will sync when you are back in signal.`
            : `${body.name} updated.`,
        );
        if (queued) {
          setForm(null);
          return;
        }
      } else {
        // CREATING a field stays online-only, and that is deliberate.
        //
        // Every other write here is "last write wins" and can be replayed
        // safely. A create cannot: without a client_uuid guard on `zones` a
        // replay makes a SECOND field, and a duplicate field silently splits
        // one block's attendance and yield across two rows, which nothing
        // downstream would flag. Adding a new block is also a rare, deliberate
        // act — unlike a weigh-in, it is not something you are forced to do
        // standing in a dead spot.
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          setError(
            "Adding a new field needs a connection. Everything else here — renaming, retiring, restoring — works offline and syncs later.",
          );
          return;
        }
        await api.post("/zones", body);
        setNotice(`${body.name} added. Place it on the map when you are ready.`);
      }
      setForm(null);
      await load();
      onChanged?.();
    } catch (err) {
      setError(apiError(err, "Could not save that field."));
    } finally {
      setBusy(false);
    }
  };

  const archive = async (z) => {
    setBusy(true);
    setError("");
    try {
      // Retiring sets archived_at. Idempotent — retiring an already-retired
      // field changes nothing — so it queues safely.
      const { queued } = await queueOrSend({
        path: `/zones/${z.id}`,
        method: "DELETE",
      });
      setNotice(
        queued
          ? `${z.name} retired on this device. It will sync when you are back in signal.`
          : `${z.name} retired. Its history is kept and it can be restored.`,
      );
      if (!queued) await load();
      onChanged?.();
    } catch (err) {
      setError(apiError(err, "Could not retire that field."));
    } finally {
      setBusy(false);
      setConfirmArchive(null);
    }
  };

  const restore = async (z) => {
    setBusy(true);
    setError("");
    try {
      // A POST, but idempotent by design: ZoneService.restore returns early if
      // the field is already live. Safe to replay.
      const { queued } = await queueOrSend({
        path: `/zones/${z.id}/restore`,
        method: "POST",
        body: {},
      });
      setNotice(
        queued
          ? `${z.name} restored on this device. It will sync when you are back in signal.`
          : `${z.name} is back in use.`,
      );
      if (!queued) await load();
      onChanged?.();
    } catch (err) {
      setError(apiError(err, "Could not restore that field."));
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[1200] bg-black/40" onClick={onClose} aria-hidden />
      <div className="fixed inset-0 z-[1210] flex items-center justify-center p-4">
        <div
          className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-label="Manage fields"
        >
          <div className={`flex items-center justify-between ${HEADER} px-6 py-5`}>
            <div>
              <h3 className="text-xl font-extrabold text-white">Manage fields</h3>
              <p className="text-xs text-white/60">
                Add, rename or retire the estate&rsquo;s fields
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid h-9 w-9 place-items-center rounded-full bg-white/20 text-white transition hover:bg-white/30"
            >
              <LuX size={17} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto bg-[#F4FFE9] px-6 py-5">
            {error && (
              <p className="mb-3 rounded-xl bg-rose-50 px-4 py-2.5 text-sm text-rose-700">
                {error}
              </p>
            )}
            {notice && (
              <p className="mb-3 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
                {notice}
              </p>
            )}

            {form ? (
              <div className="rounded-2xl bg-white p-4 ring-1 ring-[#13483B59]">
                <p className="mb-3 text-sm font-extrabold text-[#14493B]">
                  {form.id ? "Rename field" : "New field"}
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-bold text-[#14493B]">
                    Name
                    <input
                      autoFocus
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="Zone D-1"
                      className={`mt-1 ${FIELD}`}
                    />
                  </label>
                  <label className="text-xs font-bold text-[#14493B]">
                    Code
                    <input
                      value={form.code}
                      onChange={(e) => setForm({ ...form, code: e.target.value })}
                      placeholder="D1"
                      className={`mt-1 ${FIELD}`}
                    />
                  </label>
                  <label className="text-xs font-bold text-[#14493B]">
                    Area (hectares)
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={form.areaHectare}
                      onChange={(e) => setForm({ ...form, areaHectare: e.target.value })}
                      className={`mt-1 ${FIELD}`}
                    />
                  </label>
                  {/* The target is the number this field's own performance is
                      judged against on the leaderboard, so it is the one thing
                      here a supervisor cannot set. The VALUE stays in form
                      state and is sent back unchanged, which is what lets the
                      server's guard see "nothing moved" rather than "they tried
                      to clear it". */}
                  {canSetTarget ? (
                    <label className="text-xs font-bold text-[#14493B]">
                      Daily target (kg)
                      <input
                        type="number"
                        min={0}
                        value={form.targetKgPerDay}
                        onChange={(e) =>
                          setForm({ ...form, targetKgPerDay: e.target.value })
                        }
                        className={`mt-1 ${FIELD}`}
                      />
                    </label>
                  ) : (
                    <div className="text-xs font-bold text-[#14493B]">
                      Daily target (kg)
                      <p className="mt-1 rounded-xl bg-[#F4FFE9] px-4 py-2.5 text-sm font-normal text-[#14493B]/60 ring-1 ring-[#13483B]/10">
                        {form.targetKgPerDay === "" || form.targetKgPerDay == null
                          ? "Not set"
                          : `${form.targetKgPerDay} kg/day`}
                      </p>
                    </div>
                  )}
                </div>
                <p className="mt-2 text-[11px] text-[#14493B]/50">
                  {canSetTarget
                    ? "Without a daily target the field shows no harvest-progress bar, because there is nothing to measure against."
                    : "Only the office can change the daily target — it is the figure your field's performance is measured against. Everything else here is yours to edit."}
                </p>
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setForm(null)}
                    className="rounded-xl px-4 py-2 text-sm font-semibold text-[#14493B]/60 hover:bg-[#D3FFAC]/50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={save}
                    disabled={busy}
                    className={`rounded-xl ${HEADER} px-5 py-2 text-sm font-semibold text-white disabled:opacity-50`}
                  >
                    {busy ? "Saving…" : form.id ? "Save changes" : "Add field"}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setForm({ ...EMPTY })}
                className={`inline-flex items-center gap-2 rounded-xl ${HEADER} px-4 py-2 text-sm font-semibold text-white`}
              >
                <LuPlus size={16} /> Add a field
              </button>
            )}

            {/* Live fields */}
            <p className="mb-2 mt-5 text-xs font-bold uppercase tracking-wide text-[#14493B]/60">
              In use ({live.length})
            </p>
            <ul className="space-y-2">
              {live.length === 0 ? (
                <li className="rounded-xl border border-dashed border-[#13483B59] px-4 py-6 text-center text-sm text-[#14493B]/50">
                  No fields yet.
                </li>
              ) : (
                live.map((z) => (
                  <li
                    key={z.id}
                    className="flex flex-wrap items-center gap-3 rounded-xl bg-white p-3 ring-1 ring-[#13483B59]"
                  >
                    <span className="min-w-[9rem] flex-1">
                      <span className="block text-sm font-bold text-[#14493B]">
                        {z.name}
                        {z.code ? (
                          <span className="ml-2 rounded bg-[#D3FFAC] px-1.5 py-0.5 text-[10px] font-bold">
                            {z.code}
                          </span>
                        ) : null}
                      </span>
                      <span className="block text-[11px] text-[#14493B]/50">
                        {z.areaHectare ? `${z.areaHectare} ha · ` : ""}
                        {z.targetKgPerDay ? `${z.targetKgPerDay} kg/day · ` : "no target · "}
                        {z.placed ? (
                          <span className="text-emerald-700">on the map</span>
                        ) : (
                          <span className="text-amber-700">not placed yet</span>
                        )}
                      </span>
                    </span>
                    {confirmArchive === z.id ? (
                      <span className="flex items-center gap-2">
                        <span className="text-[11px] text-rose-800">Retire it?</span>
                        <button
                          type="button"
                          onClick={() => archive(z)}
                          disabled={busy}
                          className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40"
                        >
                          Retire
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmArchive(null)}
                          className="rounded-lg px-2 py-1.5 text-xs font-bold text-[#14493B]/60"
                        >
                          Keep
                        </button>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <button
                          type="button"
                          title="Rename or edit"
                          onClick={() =>
                            setForm({
                              id: z.id,
                              name: z.name || "",
                              code: z.code || "",
                              areaHectare: z.areaHectare ?? "",
                              targetKgPerDay: z.targetKgPerDay ?? "",
                            })
                          }
                          className="grid h-8 w-8 place-items-center rounded-lg text-[#14493B] hover:bg-[#D3FFAC]"
                        >
                          <LuPencil size={15} />
                        </button>
                        <button
                          type="button"
                          title="Retire this field"
                          onClick={() => setConfirmArchive(z.id)}
                          className="grid h-8 w-8 place-items-center rounded-lg text-rose-600 hover:bg-rose-50"
                        >
                          <LuArchive size={15} />
                        </button>
                      </span>
                    )}
                  </li>
                ))
              )}
            </ul>

            {/* Why there is no delete */}
            <p className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-900 ring-1 ring-amber-200">
              <LuTriangleAlert size={15} className="mt-0.5 shrink-0" />
              <span>
                <span className="font-bold">Retiring is not deleting. </span>
                A retired field disappears from pickers and maps, but every
                attendance mark and leaf weigh-in that ever pointed at it keeps
                its record — so past yield per field still adds up. There is no
                hard delete, because that would strip those records permanently.
              </span>
            </p>

            {/* Retired */}
            {retired.length > 0 && (
              <>
                <p className="mb-2 mt-5 text-xs font-bold uppercase tracking-wide text-[#14493B]/60">
                  Retired ({retired.length})
                </p>
                <ul className="space-y-2">
                  {retired.map((z) => (
                    <li
                      key={z.id}
                      className="flex flex-wrap items-center gap-3 rounded-xl bg-white/60 p-3 ring-1 ring-[#13483B]/15"
                    >
                      <span className="min-w-[9rem] flex-1 text-sm font-bold text-[#14493B]/50 line-through">
                        {z.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => restore(z)}
                        disabled={busy}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#D3FFAC] px-3 py-1.5 text-xs font-bold text-[#14493B] disabled:opacity-40"
                      >
                        <LuArchiveRestore size={14} /> Bring back
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          <div className={`flex items-center justify-between ${HEADER} px-6 py-4`}>
            <span className="flex items-center gap-1.5 text-xs text-white/60">
              <LuMapPin size={13} /> Place new fields on the map from Attendance
              or Fields
            </span>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-white px-5 py-2 text-sm font-bold text-[#14493B]"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
