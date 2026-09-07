import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  LuX,
  LuCalendarPlus,
  LuWrench,
  LuFileUp,
  LuCircleCheck,
  LuChevronDown,
} from "react-icons/lu";
import api from "../../api/client";
import { apiError } from "../../lib/apiError";
import { queueOrSend } from "../../lib/outbox";
import { newUuid } from "../../lib/uuid";
import { todayISO } from "../../lib/localDate";

// Create Schedule — planning a harvest or a maintenance task on a field.
//
// THIS NOW SAVES. Until V28 there was no backend: harvest_schedule had sat in
// the schema since V1 with no Java behind it, so this form built objects with
// ids like `local-1733…` in the page's state and lost them on reload.
//
// Three things had to change before a row could exist at all:
//
//   1. A DATE. The form collected none, while sched_date is NOT NULL — so
//      nothing it produced could ever have been stored. A section titled
//      "Upcoming Harvest Schedule" could not schedule anything for a future
//      day. The date input below is the fix, and it is required.
//   2. A WORKER ID, not a typed name. This used to be an <input list> that
//      accepted any string: a misspelling produced a schedule assigned to
//      nobody and nothing downstream could tell. Same shape as the
//      loan.worker_name mistake. It is a real select now.
//   3. LOWERCASE type values. The column has a CHECK constraint, and every
//      value that crosses this boundary in this schema is lowercase — sending
//      "Daily" is how the `invalid input value for enum` class of bug starts.
//      The label stays capitalised; only the wire value changed.
//
// The attachment upload was always real: it posts to the same endpoint the
// complaint evidence uses, which already validates type and magic bytes.

const HEADER = "bg-[#14493B]";
const FIELD =
  "w-full rounded-xl border border-[#13483B]/30 bg-white px-4 py-2.5 text-sm text-[#14493B] placeholder-[#14493B]/35 outline-none transition focus:border-[#14493B] focus:ring-2 focus:ring-[#14493B]/15";
const LABEL = "mb-1.5 block text-sm font-bold text-[#14493B]";

// value = what the column stores, label = what the supervisor reads.
const TYPES = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "one-off", label: "One-off" },
  { value: "maintenance", label: "Maintenance" },
];

const today = todayISO;

export default function CreateScheduleModal({
  open,
  fields,
  workers,
  schedules,
  prefill,
  onSaved,
  onClose,
}) {
  const [tab, setTab] = useState("new");
  const [type, setType] = useState("daily");
  const [expected, setExpected] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [date, setDate] = useState(today());
  const [workerId, setWorkerId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [attachment, setAttachment] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [queued, setQueued] = useState(false);
  // Which existing schedule the Update tab is editing. Null = creating.
  const [editingId, setEditingId] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const reset = () => {
    setType("daily");
    setExpected("");
    setZoneId("");
    setDate(today());
    setWorkerId("");
    setTitle("");
    setDescription("");
    setAttachment(null);
    setError("");
    setDone(false);
    setEditingId(null);
  };

  // Load an existing schedule into the same form. The Update tab used to be a
  // dead end that said the backend did not exist; it does now, so it edits.
  const loadForEdit = (s) => {
    setEditingId(s.id);
    setType(s.type || "one-off");
    setExpected(s.expectedKg == null ? "" : String(s.expectedKg));
    setZoneId(String(s.zoneId ?? ""));
    setDate(s.date || today());
    setWorkerId(s.workerId == null ? "" : String(s.workerId));
    setTitle(s.title || "");
    setDescription(s.description || "");
    setAttachment(s.attachmentUrl ? { name: "Attached file", url: s.attachmentUrl } : null);
    setError("");
    setDone(false);
  };

  useEffect(() => {
    if (!open) return;
    reset();
    // Opened from the pluck advisor with a field already chosen. Only the field
    // and a suggested title are filled -- the DATE is deliberately left on
    // today for the supervisor to set, because when the work happens is the one
    // decision the advisor is not entitled to make for them.
    if (prefill) {
      if (prefill.zoneId != null) setZoneId(String(prefill.zoneId));
      if (prefill.title) setTitle(prefill.title);
      setTab("new");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefill]);

  const upload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError("That file is larger than 5MB.");
      return;
    }
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const { data } = await api.post("/complaints/attachments", form);
      setAttachment({ name: file.name, url: data.url });
    } catch (err) {
      setError(apiError(err, "Could not upload that file."));
    } finally {
      setUploading(false);
    }
  };

  const submit = async (asDraft) => {
    if (!zoneId) {
      setError("Pick the field this schedule is for.");
      return;
    }
    if (!date) {
      setError("Pick the day this work is planned for.");
      return;
    }
    if (!title.trim()) {
      setError("Give the schedule a short title.");
      return;
    }

    // One id per attempt, so a queued create replayed twice is deduped by the
    // server instead of putting the same job on the board again (V29).
    const clientUuid = editingId ? null : newUuid();

    const body = {
      zoneId: Number(zoneId),
      date,
      title: title.trim(),
      description: description.trim() || null,
      type,
      expectedKg: expected === "" ? null : Number(expected),
      // Empty string means "nobody assigned yet", which is a real state — not
      // worker 0. Send null so the column stays NULL.
      workerId: workerId === "" ? null : Number(workerId),
      status: asDraft ? "draft" : "planned",
      attachmentUrl: attachment?.url || null,
      ...(clientUuid ? { clientUuid } : {}),
    };

    setSaving(true);
    setError("");
    try {
      // Try the network, fall back to the IndexedDB outbox. A supervisor
      // planning next week's round while standing in a dead spot can finish
      // and walk away.
      const { queued } = await queueOrSend({
        path: editingId ? `/harvest-schedules/${editingId}` : "/harvest-schedules",
        method: editingId ? "PUT" : "POST",
        body,
        clientUuid,
      });

      if (queued) {
        // Nothing came back from a server we could not reach, so the
        // optimistic row is built here from what we already know. It is marked
        // pending so the board can say it exists only on this device, and given
        // a local id that could never collide with a real one.
        onSaved?.({
          queued: true,
          row: {
            id: editingId ?? `pending-${clientUuid}`,
            pending: true,
            zoneId: body.zoneId,
            zoneName: fields.find((f) => String(f.id) === zoneId)?.name || "",
            date: body.date,
            title: body.title,
            description: body.description,
            type: body.type,
            expectedKg: body.expectedKg,
            workerId: body.workerId,
            workerName:
              workers.find((w) => String(w.id) === workerId)?.fullName || null,
            status: body.status,
            attachmentUrl: body.attachmentUrl,
            createdAt: new Date().toISOString(),
            overdue: false,
          },
        });
      } else {
        // Online. The server owns the id, the owning supervisor and created_at,
        // so the parent refetches rather than trusting a copy assembled here.
        onSaved?.({ queued: false });
      }
      setQueued(queued);
      setDone(true);
    } catch (err) {
      setError(apiError(err, "Could not save that schedule."));
    } finally {
      setSaving(false);
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
          aria-label="Create schedule"
        >
          <div className={`flex items-center justify-between ${HEADER} px-6 py-5`}>
            <h3 className="text-xl font-extrabold text-white">Create Schedule</h3>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid h-9 w-9 place-items-center rounded-full bg-white/20 text-white transition hover:bg-white/30"
            >
              <LuX size={17} />
            </button>
          </div>

          {done ? (
            <div className="flex flex-col items-center px-8 py-12 text-center">
              <LuCircleCheck size={60} strokeWidth={1.5} className="text-[#14493B]" />
              <h4 className="mt-5 text-xl font-extrabold text-[#14493B]">
                {queued
                  ? "Saved on this device"
                  : editingId
                    ? "Schedule Updated"
                    : "Schedule Added"}
              </h4>
              <p className="mt-2 max-w-sm text-sm text-[#14493B]/60">
                {queued
                  ? "No network. This is stored on this phone and will sync by itself when you are back in signal — you can close the app."
                  : "Saved. It is on the board for everyone and will still be there after a reload."}
              </p>
              <div className="mt-7 flex w-full max-w-xs flex-col gap-2">
                <button
                  type="button"
                  onClick={reset}
                  className={`w-full rounded-2xl ${HEADER} px-6 py-3 text-sm font-semibold text-white transition hover:brightness-110`}
                >
                  Add another
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full rounded-2xl px-6 py-2 text-sm font-semibold text-[#14493B]/60 hover:bg-[#CFE8DB]/50"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Tabs */}
              <div className="flex gap-3 px-6 pt-5">
                {[
                  ["new", "New Schedule", LuCalendarPlus],
                  ["update", "Update Schedule", LuWrench],
                ].map(([k, label, Icon]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setTab(k)}
                    className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-bold transition ${
                      tab === k
                        ? "border-[#14493B] bg-white text-[#14493B] shadow-sm"
                        : "border-[#13483B]/20 bg-white/60 text-[#14493B]/50 hover:border-[#14493B]/40"
                    }`}
                  >
                    <Icon size={15} /> {label}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-5">
                <div className="rounded-2xl border border-[#13483B]/40 p-5">
                  <h4 className="mb-4 text-lg font-extrabold text-[#14493B]">
                    {tab === "new" ? "Create New Schedule" : "Update a Schedule"}
                  </h4>

                  {tab === "update" && !editingId ? (
                    // Pick which one to edit. This tab used to be an amber
                    // "backend not built yet" notice; V28 and the harvest module
                    // made it real, so it now does what its label promises.
                    (schedules?.length ?? 0) === 0 ? (
                      <p className="rounded-xl bg-[#F4FFE9] px-4 py-3 text-sm text-[#14493B]/70 ring-1 ring-[#13483B]/10">
                        Nothing is scheduled yet. Create one first, then it can
                        be edited here.
                      </p>
                    ) : (
                      <ul className="max-h-72 space-y-2 overflow-y-auto">
                        {schedules.map((s) => (
                          <li key={s.id}>
                            <button
                              type="button"
                              onClick={() => loadForEdit(s)}
                              className="flex w-full items-center justify-between gap-3 rounded-xl border border-[#13483B]/20 px-4 py-3 text-left transition hover:bg-[#F4FFE9]"
                            >
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-bold text-[#14493B]">
                                  {s.title || "Planned work"}
                                </span>
                                <span className="block text-xs text-[#14493B]/55">
                                  {s.zoneName} · {s.date}
                                </span>
                              </span>
                              <span className="shrink-0 rounded-full bg-[#D3FFAC] px-2.5 py-1 text-[10px] font-bold uppercase text-[#14493B]">
                                {s.status}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )
                  ) : (
                    <>
                      {error && (
                        <p className="mb-4 rounded-xl bg-rose-50 px-4 py-2.5 text-sm text-rose-700">
                          {error}
                        </p>
                      )}

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <label className={LABEL} htmlFor="cs-type">
                            Schedule Type*
                          </label>
                          <div className="relative">
                            <select
                              id="cs-type"
                              value={type}
                              onChange={(e) => setType(e.target.value)}
                              className={`${FIELD} appearance-none pr-10`}
                            >
                              {TYPES.map((t) => (
                                <option key={t.value} value={t.value}>
                                  {t.label}
                                </option>
                              ))}
                            </select>
                            <LuChevronDown
                              size={15}
                              className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[#14493B]/50"
                            />
                          </div>
                        </div>

                        <div>
                          <label className={LABEL} htmlFor="cs-expected">
                            Expected Harvest
                          </label>
                          <input
                            id="cs-expected"
                            type="number"
                            min="0"
                            step="1"
                            value={expected}
                            onChange={(e) => setExpected(e.target.value)}
                            placeholder="e.g. 450"
                            className={FIELD}
                          />
                        </div>

                        <div>
                          <label className={LABEL} htmlFor="cs-zone">
                            Field / Zone*
                          </label>
                          <div className="relative">
                            <select
                              id="cs-zone"
                              value={zoneId}
                              onChange={(e) => {
                                setZoneId(e.target.value);
                                setError("");
                              }}
                              className={`${FIELD} appearance-none pr-10`}
                            >
                              <option value="">Select a field</option>
                              {fields.map((f) => (
                                <option key={f.id} value={f.id}>
                                  {f.name}
                                  {f.code ? ` (${f.code})` : ""}
                                </option>
                              ))}
                            </select>
                            <LuChevronDown
                              size={15}
                              className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[#14493B]/50"
                            />
                          </div>
                        </div>

                        <div>
                          <label className={LABEL} htmlFor="cs-date">
                            Scheduled for*
                          </label>
                          <input
                            id="cs-date"
                            type="date"
                            value={date}
                            onChange={(e) => {
                              setDate(e.target.value);
                              setError("");
                            }}
                            className={FIELD}
                          />
                          {/* The one field this form never had. Without it
                              nothing could be stored, and "upcoming" work had
                              no day to be upcoming on. */}
                          <p className="mt-1 text-[11px] text-[#14493B]/50">
                            The day the work should happen — not today's date.
                          </p>
                        </div>

                        <div>
                          <label className={LABEL} htmlFor="cs-worker">
                            Assign Worker
                          </label>
                          <div className="relative">
                            {/* A select, not a free-text datalist. A typed name
                                that matched nobody used to save silently. */}
                            <select
                              id="cs-worker"
                              value={workerId}
                              onChange={(e) => setWorkerId(e.target.value)}
                              className={`${FIELD} appearance-none pr-10`}
                            >
                              <option value="">Nobody assigned yet</option>
                              {workers.map((w) => (
                                <option key={w.id} value={w.id}>
                                  {w.fullName}
                                </option>
                              ))}
                            </select>
                            <LuChevronDown
                              size={15}
                              className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[#14493B]/50"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="mt-4">
                        <label className={LABEL} htmlFor="cs-title">
                          Title*
                        </label>
                        <input
                          id="cs-title"
                          value={title}
                          onChange={(e) => {
                            setTitle(e.target.value);
                            setError("");
                          }}
                          placeholder="Short summary of the task"
                          className={FIELD}
                        />
                      </div>

                      <div className="mt-4">
                        <label className={LABEL} htmlFor="cs-desc">
                          Description
                        </label>
                        <textarea
                          id="cs-desc"
                          rows={4}
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          placeholder="Detailed explanation of the work…"
                          className={`${FIELD} resize-y`}
                        />
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <input
                          ref={fileRef}
                          type="file"
                          accept="image/png,image/jpeg,image/webp,application/pdf"
                          onChange={upload}
                          className="hidden"
                        />
                        <button
                          type="button"
                          onClick={() => fileRef.current?.click()}
                          disabled={uploading}
                          className="inline-flex items-center gap-2 rounded-xl border border-dashed border-[#14493B]/50 px-4 py-2.5 text-sm font-bold text-[#14493B] transition hover:bg-[#CFE8DB]/40 disabled:opacity-50"
                        >
                          <LuFileUp size={16} />
                          {uploading ? "Uploading…" : "Upload Image/Doc"}
                        </button>
                        <span className="text-xs italic text-[#14493B]/50">
                          {attachment
                            ? `Attached: ${attachment.name}`
                            : "Supported: JPG, PNG, WEBP, PDF (max 5MB)"}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {(tab === "new" || editingId) && (
                <div className="flex items-center justify-end gap-3 border-t border-[#13483B]/10 px-6 py-4">
                  {editingId && (
                    <button
                      type="button"
                      onClick={reset}
                      className="mr-auto rounded-xl px-4 py-2.5 text-sm font-semibold text-[#14493B]/60 transition hover:bg-[#CFE8DB]/50"
                    >
                      Pick a different one
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => submit(true)}
                    disabled={saving}
                    className="rounded-xl px-5 py-2.5 text-sm font-semibold text-[#14493B]/70 transition hover:bg-[#CFE8DB]/50 disabled:opacity-50"
                  >
                    Save Draft
                  </button>
                  <button
                    type="button"
                    onClick={() => submit(false)}
                    disabled={saving}
                    className={`rounded-xl ${HEADER} px-6 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50`}
                  >
                    {saving
                      ? "Saving…"
                      : editingId
                        ? "Save changes"
                        : "Create Schedule"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}
