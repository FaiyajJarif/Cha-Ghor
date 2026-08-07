import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { LuX, LuSend, LuCircleCheck, LuChevronDown, LuTriangleAlert } from "react-icons/lu";
import api from "../../api/client";
import { apiError } from "../../lib/apiError";

// Compose a message that every supervisor and the admin will see.
//
// This posts a real FieldCase to POST /api/v1/complaints, which is
// @PreAuthorize("isAuthenticated()") -- a supervisor may raise one today with
// no permission change. GET /complaints is open to ADMIN and SUPERVISOR, so
// anything sent here is immediately readable by every supervisor on the estate.
// That is the whole point: a field condition entered once is visible to all.
//
// The submitter is taken from the JWT on the server, never from this form, so
// nobody can post as somebody else.
//
// DELIBERATE: the weather screen prefills this dialog rather than sending
// straight from a button. A message that reaches every supervisor should have a
// human read it first, and a mis-tapped button on a phone in a wet field should
// not page the whole estate.

const HEADER = "bg-[#14493B]";
const FIELD =
  "w-full rounded-xl border border-[#13483B]/30 bg-white px-4 py-2.5 text-sm text-[#14493B] outline-none transition focus:border-[#14493B] focus:ring-2 focus:ring-[#14493B]/15";
const LABEL = "mb-1.5 block text-sm font-bold text-[#14493B]";

// Mirrors the CasePriority enum on the server. Sending anything else is a 400.
const PRIORITIES = [
  { value: "URGENT", label: "Urgent — act now", tone: "text-rose-700" },
  { value: "HIGH", label: "High — today", tone: "text-amber-700" },
  { value: "MEDIUM", label: "Medium — this week", tone: "text-sky-700" },
  { value: "LOW", label: "Low — for information", tone: "text-emerald-700" },
];

// Mirrors CaseType. REPORT is an operational field report raised by a
// supervisor; COMPLAINT is a grievance. A weather alert is a REPORT.
const TYPES = [
  { value: "REPORT", label: "Field report / notice" },
  { value: "COMPLAINT", label: "Complaint" },
];

const CATEGORIES = [
  "Weather",
  "Field condition",
  "Safety",
  "Equipment",
  "Shift notice",
  "Payroll",
  "Other",
];

export default function BroadcastComposer({ open, prefill, zones, onSent, onClose }) {
  const [caseType, setCaseType] = useState("REPORT");
  const [category, setCategory] = useState("Field condition");
  const [priority, setPriority] = useState("MEDIUM");
  const [zone, setZone] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Reset on open, applying whatever the weather screen handed over.
  useEffect(() => {
    if (!open) return;
    setCaseType(prefill?.caseType || "REPORT");
    setCategory(prefill?.category || "Field condition");
    setPriority(prefill?.priority || "MEDIUM");
    setZone(prefill?.zone || "");
    setTitle(prefill?.title || "");
    setBody(prefill?.body || "");
    setError("");
    setDone(null);
  }, [open, prefill]);

  const send = async () => {
    if (!title.trim()) {
      setError("Give the message a title — it is what everyone sees first.");
      return;
    }
    if (!body.trim()) {
      setError("Write the message body.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post("/complaints", {
        caseType,
        category: category || null,
        title: title.trim(),
        body: body.trim(),
        zone: zone || null,
        priority,
        workerCode: null,
        evidenceUrl: null,
      });
      setDone(data);
      onSent?.(data);
    } catch (err) {
      setError(apiError(err, "Could not send that message."));
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  const urgent = priority === "URGENT";

  return createPortal(
    <>
      <div className="fixed inset-0 z-[1200] bg-black/40" onClick={onClose} aria-hidden />
      <div className="fixed inset-0 z-[1210] flex items-center justify-center p-4">
        <div
          className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-label="Compose broadcast"
        >
          {done ? (
            <div className="flex flex-col items-center px-8 py-10 text-center">
              <LuCircleCheck size={60} strokeWidth={1.5} className="text-[#14493B]" />
              <h3 className="mt-5 text-2xl font-extrabold leading-tight text-[#14493B]">
                Message sent
              </h3>
              <p className="mt-2 text-sm text-[#14493B]/60">
                &ldquo;{done.title}&rdquo; is now visible to every supervisor and
                to the admin.
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
              <div className={`flex items-center justify-between ${HEADER} px-6 py-5`}>
                <div>
                  <h3 className="text-xl font-extrabold text-white">New broadcast</h3>
                  <p className="text-xs text-white/60">
                    Goes to every supervisor and the admin
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

              <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
                {error && (
                  <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-sm text-rose-700">
                    {error}
                  </p>
                )}

                {urgent && (
                  <p className="flex items-start gap-2 rounded-xl bg-rose-50 px-4 py-2.5 text-xs text-rose-800 ring-1 ring-rose-200">
                    <LuTriangleAlert size={15} className="mt-0.5 shrink-0" />
                    Urgent messages show as a red banner at the top of every
                    supervisor&rsquo;s Broadcast screen. Use it for conditions
                    that change what people do right now.
                  </p>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className={LABEL} htmlFor="bc-type">
                      Type
                    </label>
                    <div className="relative">
                      <select
                        id="bc-type"
                        value={caseType}
                        onChange={(e) => setCaseType(e.target.value)}
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
                    <label className={LABEL} htmlFor="bc-priority">
                      Priority
                    </label>
                    <div className="relative">
                      <select
                        id="bc-priority"
                        value={priority}
                        onChange={(e) => setPriority(e.target.value)}
                        className={`${FIELD} appearance-none pr-10`}
                      >
                        {PRIORITIES.map((p) => (
                          <option key={p.value} value={p.value}>
                            {p.label}
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
                    <label className={LABEL} htmlFor="bc-category">
                      Category
                    </label>
                    <div className="relative">
                      <select
                        id="bc-category"
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className={`${FIELD} appearance-none pr-10`}
                      >
                        {CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
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
                    <label className={LABEL} htmlFor="bc-zone">
                      Zone
                    </label>
                    <div className="relative">
                      <select
                        id="bc-zone"
                        value={zone}
                        onChange={(e) => setZone(e.target.value)}
                        className={`${FIELD} appearance-none pr-10`}
                      >
                        <option value="">Whole estate</option>
                        {(zones || []).map((z) => (
                          <option key={z.id} value={z.name}>
                            {z.name}
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

                <div>
                  <label className={LABEL} htmlFor="bc-title">
                    Title
                  </label>
                  <input
                    id="bc-title"
                    autoFocus
                    value={title}
                    onChange={(e) => {
                      setTitle(e.target.value);
                      setError("");
                    }}
                    placeholder="Heavy rain warning for Zone D-1"
                    className={FIELD}
                  />
                </div>

                <div>
                  <label className={LABEL} htmlFor="bc-body">
                    Message
                  </label>
                  <textarea
                    id="bc-body"
                    rows={6}
                    value={body}
                    onChange={(e) => {
                      setBody(e.target.value);
                      setError("");
                    }}
                    placeholder="What has happened, and what should people do about it?"
                    className={`${FIELD} resize-y`}
                  />
                  <p className="mt-1 text-xs text-[#14493B]/50">
                    Your name and role are attached automatically from your login.
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
                  onClick={send}
                  disabled={busy}
                  className={`inline-flex items-center gap-2 rounded-xl ${HEADER} px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50`}
                >
                  <LuSend size={15} />
                  {busy ? "Sending…" : "Send to all supervisors"}
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
