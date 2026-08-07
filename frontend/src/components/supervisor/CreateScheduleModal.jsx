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

// Create Schedule — planning a harvest or a maintenance task on a field.
//
// FRONTEND ONLY FOR NOW. The harvest_schedule table has existed since V1 with
// exactly the right shape (zone_id, sched_date, task, supervisor_id, status)
// but has no Java behind it, so there is nothing to POST to yet. Schedules
// created here live in the page's state and are lost on reload — the banner
// says so plainly rather than letting a supervisor believe a plan was saved.
//
// The attachment upload IS real: it posts to the same endpoint the complaint
// evidence uses, which already validates type and magic bytes.

const HEADER = "bg-[#14493B]";
const FIELD =
  "w-full rounded-xl border border-[#13483B]/30 bg-white px-4 py-2.5 text-sm text-[#14493B] placeholder-[#14493B]/35 outline-none transition focus:border-[#14493B] focus:ring-2 focus:ring-[#14493B]/15";
const LABEL = "mb-1.5 block text-sm font-bold text-[#14493B]";

const TYPES = ["Daily", "Weekly", "One-off", "Maintenance"];

export default function CreateScheduleModal({ open, fields, workers, onCreate, onClose }) {
  const [tab, setTab] = useState("new");
  const [type, setType] = useState("Daily");
  const [expected, setExpected] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [worker, setWorker] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [attachment, setAttachment] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const reset = () => {
    setType("Daily");
    setExpected("");
    setZoneId("");
    setWorker("");
    setTitle("");
    setDescription("");
    setAttachment(null);
    setError("");
    setDone(false);
  };

  useEffect(() => {
    if (open) reset();
  }, [open]);

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

  const submit = (asDraft) => {
    if (!zoneId) {
      setError("Pick the field this schedule is for.");
      return;
    }
    if (!title.trim()) {
      setError("Give the schedule a short title.");
      return;
    }
    const field = fields.find((f) => String(f.id) === zoneId);
    onCreate?.({
      id: `local-${Date.now()}`,
      type,
      zoneId: Number(zoneId),
      zoneName: field?.name || "",
      expectedKg: expected ? Number(expected) : null,
      worker: worker.trim() || null,
      title: title.trim(),
      description: description.trim(),
      attachment,
      status: asDraft ? "draft" : "planned",
      createdAt: new Date().toISOString(),
    });
    setDone(true);
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
                Schedule Added
              </h4>
              <p className="mt-2 max-w-sm text-sm text-[#14493B]/60">
                It is showing on the board, but it is not saved to the server —
                the harvest schedule backend is the next piece of work.
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

                  {tab === "update" ? (
                    <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
                      Updating an existing schedule needs the harvest schedule
                      backend, which has not been built yet. Create a new one for
                      now.
                    </p>
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
                                <option key={t} value={t}>
                                  {t}
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
                          <label className={LABEL} htmlFor="cs-worker">
                            Assign Worker
                          </label>
                          <input
                            id="cs-worker"
                            list="cs-worker-list"
                            value={worker}
                            onChange={(e) => setWorker(e.target.value)}
                            placeholder="Worker ID or Name"
                            className={FIELD}
                          />
                          <datalist id="cs-worker-list">
                            {workers.map((w) => (
                              <option key={w.id} value={w.fullName} />
                            ))}
                          </datalist>
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

              {tab === "new" && (
                <div className="flex items-center justify-end gap-3 border-t border-[#13483B]/10 px-6 py-4">
                  <button
                    type="button"
                    onClick={() => submit(true)}
                    className="rounded-xl px-5 py-2.5 text-sm font-semibold text-[#14493B]/70 transition hover:bg-[#CFE8DB]/50"
                  >
                    Save Draft
                  </button>
                  <button
                    type="button"
                    onClick={() => submit(false)}
                    className={`rounded-xl ${HEADER} px-6 py-2.5 text-sm font-semibold text-white transition hover:brightness-110`}
                  >
                    Create Schedule
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
