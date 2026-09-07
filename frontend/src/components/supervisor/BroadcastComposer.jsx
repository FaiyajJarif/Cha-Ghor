import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { LuX, LuSend, LuCircleCheck, LuChevronDown, LuTriangleAlert } from "react-icons/lu";
import api from "../../api/client";
import { apiError } from "../../lib/apiError";
import { queueOrSend } from "../../lib/outbox";
import { newUuid } from "../../lib/uuid";

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
//
// IT CAN NOW ALSO TEXT WORKERS, and that changes the stakes.
//
// Until this, "Broadcast" reached admin's console and any browser already open
// on the page -- nobody standing in a field. There has been a working SMS
// stack all along, used to tell workers their wages had landed, so the estate
// could text a man that he had been paid but not that a storm was coming.
//
// SMS is opt-in per message and gated behind a confirm step showing the exact
// characters and the exact number of people, because unlike everything else in
// this app it costs money and cannot be undone. Three separate calls keep a
// model from ever being one request away from somebody's phone:
//
//   GET  /complaints/sms-preview   how many would receive it   (sends nothing)
//   POST /complaints/sms-rewrite   shorten into Bangla         (sends nothing)
//   POST /complaints/{id}/sms      send these exact characters (no model)
//
// The supervisor reads and can edit the final text between the second and the
// third.

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

  // ---- SMS to workers ------------------------------------------------------
  // `alsoSms` is the supervisor's intent; `smsStage` is where the confirm flow
  // has got to. Kept apart so ticking the box never sends anything on its own.
  const [alsoSms, setAlsoSms] = useState(false);
  const [smsStage, setSmsStage] = useState("idle"); // idle | confirm | sending | sent
  const [recipients, setRecipients] = useState(null);
  const [smsText, setSmsText] = useState("");
  const [smsResult, setSmsResult] = useState(null);
  const [rewriting, setRewriting] = useState(false);
  const [smsNote, setSmsNote] = useState("");

  // Offline is a hard no for SMS, and it is worth being blunt about why: the
  // outbox replays writes later without anyone watching, and a text message
  // that goes out unattended some hours after a storm has passed is worse than
  // one that never went. The case itself still queues.
  const online = typeof navigator === "undefined" || navigator.onLine;

  // Bangla is UCS-2 over SMS, so only 70 characters fit in a part instead of
  // 160. Counting this honestly is the difference between one message per
  // worker and three.
  // Any non-ASCII character forces UCS-2 for the WHOLE message — one Bangla
  // letter in an otherwise English alert halves the budget for all of it.
  const smsUnicode = smsText.split("").some((ch) => ch.charCodeAt(0) > 127);
  const perPart = smsUnicode ? 70 : 160;
  const smsParts = smsText ? Math.ceil(smsText.length / perPart) : 0;

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
    // SMS intent NEVER carries over between messages. Inheriting "also text
    // everyone" from a previous alert is precisely the accident that makes a
    // mass-texting feature dangerous.
    setAlsoSms(false);
    setSmsStage("idle");
    setRecipients(null);
    setSmsText("");
    setSmsResult(null);
    setSmsNote("");
  }, [open, prefill]);

  // How many workers this would reach. Refreshed when the field changes,
  // because "everyone" and "the twelve people in Hill Section B" are very
  // different decisions.
  useEffect(() => {
    if (!open || !alsoSms || !online) return;
    let alive = true;
    api
      .get("/complaints/sms-preview", { params: { zone: zone || undefined } })
      .then(({ data }) => alive && setRecipients(data))
      .catch(() => alive && setRecipients(null));
    return () => {
      alive = false;
    };
  }, [open, alsoSms, zone, online]);

  // Ask the model to shorten it into Bangla. Sends nothing; the result lands in
  // an editable box.
  const rewrite = async (language) => {
    setRewriting(true);
    setSmsNote("");
    try {
      const { data } = await api.post("/complaints/sms-rewrite", {
        title: title.trim(),
        body: body.trim(),
        priority,
        zone: zone || null,
        language,
      });
      if (data?.message) {
        setSmsText(data.message);
        setSmsNote(
          `Shortened by ${data.provider || "the model"} — read it before sending.`,
        );
      } else if (data?.error) {
        setSmsNote(data.error);
      }
    } catch (err) {
      setSmsNote(apiError(err, "Could not shorten that automatically."));
    } finally {
      setRewriting(false);
    }
  };

  // The actual send. Separate from everything above, and reachable only from
  // the confirm panel.
  const sendSms = async () => {
    if (!done?.id || !smsText.trim()) return;
    setSmsStage("sending");
    setSmsNote("");
    try {
      const { data } = await api.post(`/complaints/${done.id}/sms`, {
        message: smsText.trim(),
      });
      setSmsResult(data);
      setSmsStage("sent");
    } catch (err) {
      setSmsNote(apiError(err, "Could not send the text messages."));
      setSmsStage("confirm");
    }
  };

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
    const payload = {
      caseType,
      category: category || null,
      title: title.trim(),
      body: body.trim(),
      zone: zone || null,
      priority,
      workerCode: null,
      evidenceUrl: null,
    };
    try {
      if (!online) {
        // Queue the case so a report written in a dead spot is not lost — this
        // page was the only supervisor screen still writing straight to the
        // network, and a weather alert is the worst thing to drop.
        //
        // SMS is deliberately NOT queued. A text that goes out unattended some
        // hours later, after the storm has passed, is worse than one that never
        // went.
        await queueOrSend({ path: "/complaints", body: payload, clientUuid: newUuid() });
        setDone({ queued: true, title: payload.title });
        onSent?.(null);
        return;
      }
      const { data } = await api.post("/complaints", payload);
      setDone(data);
      onSent?.(data);
      // Straight into the confirm panel if they asked to text as well. Nothing
      // has been sent to a phone at this point.
      if (alsoSms) {
        setSmsText(payload.body.length <= 160 ? payload.body : "");
        setSmsStage("confirm");
      }
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
          {done && smsStage === "confirm" ? (
            /* ---------- confirm the text messages ----------
               The case is already filed. Nothing has reached a phone yet, and
               nothing will until the button at the bottom is pressed. */
            <div className="flex max-h-[92vh] flex-col overflow-hidden">
              <div className={`flex items-center justify-between ${HEADER} px-6 py-5`}>
                <div>
                  <h3 className="text-xl font-extrabold text-white">Send as SMS?</h3>
                  <p className="text-xs text-white/60">
                    The message is already on the board. This texts phones.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSmsStage("idle")}
                  aria-label="Close"
                  className="grid h-9 w-9 place-items-center rounded-full bg-white/20 text-white"
                >
                  <LuX size={16} />
                </button>
              </div>

              <div className="flex-1 space-y-4 overflow-y-auto bg-[#F4FFE9] px-6 py-5">
                <div className="rounded-xl bg-white p-4 ring-1 ring-[#13483B]/15">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-cg-ink/50">
                    Who will receive this
                  </p>
                  <p className="mt-1 text-2xl font-extrabold text-[#14493B]">
                    {recipients?.count ?? "…"} worker
                    {recipients?.count === 1 ? "" : "s"}
                  </p>
                  <p className="text-xs text-cg-ink/55">
                    {zone ? `In ${zone}.` : "Across the whole estate."} Active
                    workers with a phone number on file.
                  </p>
                  {recipients?.count === 0 && (
                    <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      Nobody matches. Either that field has no active workers
                      with phone numbers, or the field name did not match one on
                      the estate.
                    </p>
                  )}
                </div>

                <div>
                  <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-bold text-[#14493B]">
                      Exactly what will be sent
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => rewrite("bn")}
                        disabled={rewriting}
                        className="rounded-lg bg-white px-2.5 py-1 text-[11px] font-bold text-[#14493B] ring-1 ring-[#13483B]/25 disabled:opacity-50"
                      >
                        {rewriting ? "…" : "Shorten to বাংলা"}
                      </button>
                      <button
                        type="button"
                        onClick={() => rewrite("en")}
                        disabled={rewriting}
                        className="rounded-lg bg-white px-2.5 py-1 text-[11px] font-bold text-[#14493B] ring-1 ring-[#13483B]/25 disabled:opacity-50"
                      >
                        {rewriting ? "…" : "Shorten (EN)"}
                      </button>
                    </div>
                  </div>
                  {/* Always editable, even straight after the model writes it.
                      The supervisor is accountable for what lands on a phone. */}
                  <textarea
                    rows={3}
                    value={smsText}
                    onChange={(e) => setSmsText(e.target.value)}
                    placeholder="Type the text message, or use one of the buttons above."
                    className={`${FIELD} resize-y`}
                  />
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-cg-ink/55">
                    <span>
                      {smsText.length} characters · {smsParts} message
                      {smsParts === 1 ? "" : "s"} each
                    </span>
                    {smsUnicode && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 font-bold text-amber-900">
                        Bangla text — only {perPart} characters per message
                      </span>
                    )}
                    {recipients?.count > 0 && smsParts > 0 && (
                      <span className="font-bold text-cg-ink/70">
                        {recipients.count * smsParts} messages in total
                      </span>
                    )}
                  </p>
                </div>

                {smsNote && (
                  <p className="rounded-xl bg-white px-4 py-2.5 text-xs text-cg-ink ring-1 ring-[#13483B]/15">
                    {smsNote}
                  </p>
                )}

                <p className="flex items-start gap-2 text-[11px] text-cg-ink/50">
                  <LuTriangleAlert size={13} className="mt-0.5 shrink-0" />
                  Text messages cannot be recalled. Read the wording above — if
                  a model shortened it, you are the one sending it.
                </p>
              </div>

              <div className={`flex items-center justify-end gap-2 ${HEADER} px-6 py-4`}>
                <button
                  type="button"
                  onClick={() => setSmsStage("idle")}
                  className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white/70"
                >
                  Skip the SMS
                </button>
                <button
                  type="button"
                  onClick={sendSms}
                  disabled={
                    smsStage === "sending" ||
                    !smsText.trim() ||
                    !(recipients?.count > 0)
                  }
                  className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-[#14493B] disabled:opacity-50"
                >
                  <LuSend size={15} />
                  {smsStage === "sending"
                    ? "Sending…"
                    : `Send to ${recipients?.count ?? 0}`}
                </button>
              </div>
            </div>
          ) : done ? (
            <div className="flex flex-col items-center px-8 py-10 text-center">
              <LuCircleCheck size={60} strokeWidth={1.5} className="text-[#14493B]" />
              <h3 className="mt-5 text-2xl font-extrabold leading-tight text-[#14493B]">
                {done.queued ? "Saved on this device" : "Message sent"}
              </h3>
              <p className="mt-2 text-sm text-[#14493B]/60">
                {done.queued ? (
                  <>
                    No network. &ldquo;{done.title}&rdquo; is stored on this
                    phone and will post by itself when you are back in signal.
                    It cannot be sent as SMS until then.
                  </>
                ) : (
                  <>
                    &ldquo;{done.title}&rdquo; is now visible to every supervisor
                    and to the admin.
                  </>
                )}
              </p>

              {/* What actually happened to the phones. */}
              {smsResult && (
                <p className="mt-4 w-full rounded-xl bg-[#F4FFE9] px-4 py-3 text-xs text-cg-ink ring-1 ring-[#13483B]/10">
                  Texted <strong>{smsResult.sent}</strong> of{" "}
                  <strong>{smsResult.attempted}</strong> worker
                  {smsResult.attempted === 1 ? "" : "s"}
                  {smsResult.failed > 0 ? `, ${smsResult.failed} failed` : ""} via{" "}
                  {smsResult.provider}.
                  {String(smsResult.provider || "").toLowerCase().includes("mock") && (
                    <>
                      {" "}
                      This is the mock sender — the messages are logged, not
                      delivered, until real gateway credentials are configured.
                    </>
                  )}
                </p>
              )}

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

                {/* Opt-in, never remembered between messages. Ticking this
                    sends nothing — it only adds a confirm step after the
                    message is filed, where the exact text and the exact
                    recipient count are shown. */}
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-xl px-4 py-3 ring-1 transition ${
                    alsoSms
                      ? "bg-[#F4FFE9] ring-[#13483B]/25"
                      : "bg-white ring-[#13483B]/15"
                  } ${!online ? "cursor-not-allowed opacity-60" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={alsoSms}
                    disabled={!online}
                    onChange={(e) => setAlsoSms(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-[#14493B]"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-[#14493B]">
                      Also send this to workers as a text message
                    </span>
                    <span className="block text-xs text-[#14493B]/60">
                      {!online ? (
                        <>
                          Needs a connection. The message itself will still be
                          saved on this phone and posted when signal returns.
                        </>
                      ) : alsoSms && recipients ? (
                        <>
                          {recipients.count} worker
                          {recipients.count === 1 ? "" : "s"}{" "}
                          {zone ? `in ${zone}` : "across the estate"} would
                          receive it. You will see the exact wording before
                          anything is sent.
                        </>
                      ) : (
                        <>
                          Reaches phones in the field, not just people with the
                          app open. You confirm the wording first.
                        </>
                      )}
                    </span>
                  </span>
                </label>

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
