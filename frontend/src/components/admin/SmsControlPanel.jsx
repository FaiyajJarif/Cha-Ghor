import { useCallback, useEffect, useState } from "react";
import {
  LuMessageSquare,
  LuSend,
  LuTriangleAlert,
  LuCircleCheck,
  LuUsers,
} from "react-icons/lu";
import api from "../../api/client";
import { apiError } from "../../lib/apiError";
import { BTN_DARK } from "../../lib/ui";
import SmsSendDialog from "./SmsSendDialog";

// The admin's control over outgoing SMS: two switches and a send button.
//
// ============================================================================
// WHY THIS SCREEN EXISTS
// ============================================================================
//
// Until a real transport was configured, none of this mattered — MockSmsSender
// logged and did nothing. With a real SIM behind the sender, two code paths
// send messages with NO confirmation of any kind:
//
//   marking a payslip paid   -> texts that worker
//   deciding a withdrawal    -> texts that worker
//
// Closing a cycle of fifty payslips would be fifty messages, and real credit,
// from one button press. Both are now behind "Automatic notices", which is off
// by default and cannot be armed without the master switch.
//
// The send box below is the other half: a way to send ONE deliberate message to
// a number you choose, so the transport can be tested without triggering a
// business event that texts a real worker.

export default function SmsControlPanel() {
  const [cfg, setCfg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Send form
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [confirming, setConfirming] = useState(false);

  // The recipient picker, and the summary of the last batch it sent.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [bulk, setBulk] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/sms/settings");
      setCfg(data);
      setError("");
    } catch (err) {
      setError(apiError(err, "Could not read the SMS settings."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setSwitch = async (patch) => {
    setSaving(true);
    setError("");
    try {
      const { data } = await api.put("/sms/settings", patch);
      setCfg(data);
    } catch (err) {
      setError(apiError(err, "Could not change that setting."));
    } finally {
      setSaving(false);
    }
  };

  const send = async () => {
    setSending(true);
    setResult(null);
    setError("");
    try {
      const { data } = await api.post("/sms/send", { phone: phone.trim(), message });
      setResult(data);
      setConfirming(false);
    } catch (err) {
      setError(apiError(err, "Could not send that message."));
      setConfirming(false);
    } finally {
      setSending(false);
    }
  };

  // Bangla forces UCS-2, which halves an SMS part from 160 characters to 70.
  // Counting it honestly is the difference between one message per recipient
  // and three — and this screen is about not spending money by accident.
  const unicode = [...message].some((ch) => ch.charCodeAt(0) > 127);
  const perPart = unicode ? 70 : 160;
  const parts = message ? Math.ceil(message.length / perPart) : 0;

  const armed = !!cfg?.smsEnabled;
  const real = !!cfg?.providerIsReal;

  return (
    <section className="rounded-2xl bg-white shadow ring-1 ring-cg-green/10">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-t-2xl bg-[#C0F28B] px-4 py-3 sm:px-5">
        <h2 className="flex items-center gap-2 font-bold text-cg-ink">
          <LuMessageSquare size={18} /> Text messages
        </h2>
        {cfg && (
          // The provider is displayed prominently ON PURPOSE. "mock" and
          // "macmessages" behave identically in this UI; the difference is
          // whether a real SIM is spending money.
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
              real ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-600"
            }`}
          >
            {real ? `live: ${cfg.provider}` : `${cfg.provider} — nothing is sent`}
          </span>
        )}
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        {error && (
          <p className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</p>
        )}

        {loading ? (
          <p className="py-6 text-center text-sm text-cg-ink/50">Loading…</p>
        ) : (
          <>
            {/* ---- master switch ---- */}
            <label className="flex items-start gap-3 rounded-xl bg-[#F4FFE9] p-3 ring-1 ring-cg-green/10">
              <input
                type="checkbox"
                className="mt-0.5 h-5 w-5 shrink-0"
                checked={armed}
                disabled={saving}
                onChange={(e) => setSwitch({ smsEnabled: e.target.checked })}
              />
              <span className="min-w-0">
                <span className="block text-sm font-bold text-cg-ink">
                  Allow this system to send text messages
                </span>
                <span className="mt-0.5 block text-xs leading-snug text-cg-ink/60">
                  Off means nothing is transmitted by any screen, including
                  supervisor broadcasts. Messages are still recorded in the
                  delivery log so you can see what would have gone out.
                </span>
              </span>
            </label>

            {/* ---- automatic notices ---- */}
            <label
              className={`flex items-start gap-3 rounded-xl p-3 ring-1 ${
                armed
                  ? "bg-amber-50 ring-amber-200"
                  : "bg-slate-50 opacity-60 ring-slate-200"
              }`}
            >
              <input
                type="checkbox"
                className="mt-0.5 h-5 w-5 shrink-0"
                checked={!!cfg?.smsAutoNotify}
                // Cannot be armed on its own. Turning the master switch off
                // also clears this server-side, so the two can never disagree.
                disabled={saving || !armed}
                onChange={(e) => setSwitch({ smsAutoNotify: e.target.checked })}
              />
              <span className="min-w-0">
                <span className="block text-sm font-bold text-cg-ink">
                  Send automatic notices to workers
                </span>
                <span className="mt-0.5 block text-xs leading-snug text-cg-ink/60">
                  Texts a worker whenever a payslip is closed or a withdrawal is
                  decided — with no confirmation step.{" "}
                  <b className="text-amber-900">
                    Closing a cycle of 50 payslips sends 50 messages.
                  </b>{" "}
                  Leave this off unless you mean it.
                </span>
              </span>
            </label>

            {/* ---- send to chosen workers ---- */}
            <div className="rounded-xl bg-[#F4FFE9] p-3 ring-1 ring-cg-green/10">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-cg-ink">
                    Send to workers
                  </span>
                  <span className="mt-0.5 block text-xs text-cg-ink/60">
                    Pick people from the list, choose the message, then confirm.
                  </span>
                </span>
                <button
                  type="button"
                  className={BTN_DARK}
                  disabled={!armed}
                  onClick={() => setPickerOpen(true)}
                  title={armed ? undefined : "Turn sending on first"}
                >
                  <LuUsers size={15} /> Choose recipients
                </button>
              </div>

              {bulk && (
                <p className="mt-2 rounded-lg bg-white px-3 py-2 text-xs text-cg-ink/70 ring-1 ring-cg-green/15">
                  Last batch: <b>{bulk.sent} sent</b>
                  {bulk.failed ? `, ${bulk.failed} failed` : ""}
                  {bulk.skipped ? `, ${bulk.skipped} skipped (no phone)` : ""} via{" "}
                  {bulk.provider}. See the SMS delivery log in Payroll for every row.
                </p>
              )}
            </div>

            <SmsSendDialog
              open={pickerOpen}
              onClose={() => setPickerOpen(false)}
              onSent={setBulk}
            />

            {/* ---- send one, by number ---- */}
            <div className="rounded-xl bg-[#F4FFE9] p-3 ring-1 ring-cg-green/10">
              <p className="text-sm font-bold text-cg-ink">Send one message</p>
              <p className="mt-0.5 text-xs text-cg-ink/60">
                Goes to this number only. Use it to check the transport without
                triggering anything that texts a real worker.
              </p>

              <div className="mt-3 space-y-2">
                <input
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    setConfirming(false);
                  }}
                  placeholder="+8801XXXXXXXXX"
                  inputMode="tel"
                  className="w-full rounded-lg border border-cg-green/20 bg-white px-3 py-2 text-sm outline-none focus:border-cg-green"
                />
                <textarea
                  value={message}
                  onChange={(e) => {
                    setMessage(e.target.value);
                    setConfirming(false);
                  }}
                  rows={3}
                  placeholder="Type the message…"
                  className="w-full rounded-lg border border-cg-green/20 bg-white px-3 py-2 text-sm outline-none focus:border-cg-green"
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] text-cg-ink/55">
                    {message.length} characters
                    {parts > 0 && (
                      <>
                        {" · "}
                        {parts} message{parts === 1 ? "" : "s"} per recipient
                        {unicode ? " (Bangla — 70 per part)" : " (160 per part)"}
                      </>
                    )}
                  </span>

                  {/* TWO TAPS TO SEND. The first arms, the second sends. This
                      is the same reasoning as the broadcast confirm step: the
                      action costs money and cannot be undone. */}
                  {!confirming ? (
                    <button
                      type="button"
                      className={BTN_DARK}
                      disabled={!armed || !phone.trim() || !message.trim() || sending}
                      onClick={() => setConfirming(true)}
                      title={armed ? undefined : "Turn sending on first"}
                    >
                      <LuSend size={15} /> Send
                    </button>
                  ) : (
                    <span className="flex items-center gap-2">
                      <button
                        type="button"
                        className={BTN_DARK}
                        disabled={sending}
                        onClick={send}
                      >
                        {sending ? "Sending…" : `Yes, text ${phone.trim()}`}
                      </button>
                      <button
                        type="button"
                        className="rounded-lg px-3 py-2 text-sm font-semibold text-cg-ink/60"
                        onClick={() => setConfirming(false)}
                      >
                        Cancel
                      </button>
                    </span>
                  )}
                </div>

                {!armed && (
                  <p className="flex items-start gap-1.5 text-[11px] text-amber-900">
                    <LuTriangleAlert size={13} className="mt-0.5 shrink-0" />
                    Sending is switched off, so the button is disabled.
                  </p>
                )}

                {result && (
                  // The server's own words. sms_log has no detail column, so
                  // this is the one place the reason is visible in the UI.
                  <p
                    className={`flex items-start gap-1.5 rounded-lg px-3 py-2 text-xs ${
                      result.status === "sent"
                        ? "bg-emerald-50 text-emerald-800"
                        : result.status === "mock"
                          ? "bg-slate-100 text-slate-700"
                          : "bg-rose-50 text-rose-700"
                    }`}
                  >
                    {result.status === "sent" ? (
                      <LuCircleCheck size={13} className="mt-0.5 shrink-0" />
                    ) : (
                      <LuTriangleAlert size={13} className="mt-0.5 shrink-0" />
                    )}
                    <span>
                      <b>{result.status}</b> via {result.provider}
                      {result.detail ? ` — ${result.detail}` : ""}
                      {result.status === "sent" && (
                        <>
                          {" "}
                          Handed to the phone; there is no delivery receipt, so
                          check the handset to be sure.
                        </>
                      )}
                    </span>
                  </p>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
