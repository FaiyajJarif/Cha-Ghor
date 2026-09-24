import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { LuX, LuSearch, LuSend, LuTriangleAlert } from "react-icons/lu";
import api from "../../api/client";
import { apiError } from "../../lib/apiError";
import { BTN_DARK, BTN_GHOST } from "../../lib/ui";

// Choose who, choose what, confirm, send.
//
// ============================================================================
// THE ORDER OF THE STEPS IS THE SAFETY FEATURE
// ============================================================================
//
// Recipients first, message second, confirmation last — and the confirm step
// states the two numbers that decide the cost: how many people, and how many
// SMS parts each message will be split into. A Bangla message is UCS-2, so a
// part is 70 characters instead of 160; a three-line Bangla notice to 40
// workers is 120 messages, not 40. That multiplication is invisible unless
// something does it for you, which is how phone bills happen.
//
// Recipients are sent as WORKER IDS, never phone numbers. The server looks the
// number up from the worker row, so this dialog cannot be used to text an
// arbitrary number even by someone with an admin token.

const TEMPLATES = [
  {
    key: "alert",
    label: "Field notice",
    // Matches SmsCategory.alert — the same category supervisor broadcasts use.
    text: "চা ঘর: আজ বাগানে কাজ বন্ধ থাকবে। পরে জানানো হবে।",
    hint: "General notice to workers. Same category as a supervisor broadcast.",
  },
  {
    key: "payroll",
    label: "Payroll notice",
    text: "চা ঘর: {name}, এই মাসের বেতনের হিসাব চূড়ান্ত হয়েছে। বিস্তারিত অ্যাপে দেখুন।",
    // Deliberately no amount. See the note under the textarea.
    hint: "Tells workers their statement is ready. Carries no amount — see below.",
  },
  {
    key: "withdrawal",
    label: "Withdrawal notice",
    text: "চা ঘর: {name}, আপনার টাকা তোলার আবেদনের খবর অ্যাপে দেখুন।",
    hint: "Points a worker at their withdrawal status in the app.",
  },
];

// Compare phone numbers by digits only.
//
// "+8801712345601", "8801712345601" and "01712345601" are one handset written
// three ways, and all three come out of a spreadsheet. The last nine digits are
// the subscriber number. Same rule as BkashService.samePhone on the server, so
// a slip that imports there also matches here.
const samePhone = (a, b) => {
  if (!a || !b) return false;
  const da = String(a).replace(/[^0-9]/g, "");
  const db = String(b).replace(/[^0-9]/g, "");
  if (da.length < 9 || db.length < 9) return false;
  return da.slice(-9) === db.slice(-9);
};

// Minimal RFC 4180 reader. Quoted fields matter: a name saved as
// "Akter, Shahida" would otherwise split into two columns and shift the amount
// into the phone position.
const parseCsv = (text) =>
  text
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "")
    .map((line) => {
      const out = [];
      let cur = "";
      let inQ = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (inQ) {
          if (c === '"') {
            if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false;
          } else cur += c;
        } else if (c === '"') inQ = true;
        else if (c === ",") { out.push(cur.trim()); cur = ""; }
        else cur += c;
      }
      out.push(cur.trim());
      return out;
    });

export default function SmsSendDialog({ open, onClose, onSent }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState(() => new Set());
  const [category, setCategory] = useState("alert");
  const [message, setMessage] = useState(TEMPLATES[0].text);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);

  // ---- payment mode, entered by uploading a payout slip -------------------
  //
  // payAmounts is workerId -> amount. Its presence is what switches this dialog
  // from "one message to everyone" to "each worker gets their own figure", and
  // what makes Send post to /sms/send-payments instead of /sms/send-bulk.
  const [payAmounts, setPayAmounts] = useState(null);
  const [csvSkipped, setCsvSkipped] = useState([]);
  // Whether the estate already texts workers automatically on payment. If it
  // does, these people have had a message about this payment already.
  const [autoNotify, setAutoNotify] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rec, cfg] = await Promise.all([
        api.get("/sms/recipients"),
        // Non-fatal: without it we simply cannot show the duplicate warning.
        api.get("/sms/settings").catch(() => ({ data: {} })),
      ]);
      setRows(rec.data || []);
      setAutoNotify(Boolean(cfg.data?.smsAutoNotify));
      setError("");
    } catch (err) {
      setError(apiError(err, "Could not load the worker list."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      load();
      setPicked(new Set());
      setConfirming(false);
      setQ("");
      setPayAmounts(null);
      setCsvSkipped([]);
    }
  }, [open, load]);

  // Read a payout slip and tick the workers on it.
  //
  // THE FILE SELECTS PEOPLE. IT DOES NOT DECIDE WHAT IS SENT.
  //
  // Matching is by CG id AND phone against the worker list the server just
  // gave us -- a row whose number disagrees with the record is refused, not
  // quietly preferred, exactly as the bKash slip import does. And the amount
  // is checked a second time on the server against a withdrawal that is
  // actually `paid`, so an edited figure cannot make the estate tell someone
  // money moved when it did not.
  const loadSlip = async (file) => {
    if (!file) return;
    setError("");
    try {
      const text = await file.text();
      const lines = parseCsv(text);
      const next = new Set();
      const amounts = {};
      const bad = [];

      lines.forEach((cells, idx) => {
        const lineNo = idx + 1;
        if (lineNo === 1 && /^cg_?id$/i.test(cells[0] || "")) return; // header
        if (cells.length < 4) {
          bad.push({ line: lineNo, reason: "Needs cg_id, name, phone, amount." });
          return;
        }
        const [cgId, , phone, amtRaw] = cells;
        const digits = String(cgId).replace(/[^0-9]/g, "");
        const worker = digits
          ? rows.find((r) => String(r.workerId) === String(Number(digits)))
          : null;
        if (!worker) {
          bad.push({ line: lineNo, reason: `No active worker ${cgId} with a phone on file.` });
          return;
        }
        if (!samePhone(worker.phone, phone)) {
          bad.push({
            line: lineNo,
            reason: `The number on the slip does not match the one on file for ${cgId}.`,
          });
          return;
        }
        const amount = Number(String(amtRaw).replace(/,/g, ""));
        if (!Number.isFinite(amount) || amount <= 0) {
          bad.push({ line: lineNo, reason: `"${amtRaw}" is not an amount.` });
          return;
        }
        next.add(worker.workerId);
        amounts[worker.workerId] = amount;
      });

      if (next.size === 0) {
        setPayAmounts(null);
        setCsvSkipped(bad);
        setError("Nothing on that slip matched a worker who can be texted.");
        return;
      }
      setPicked(next);
      setPayAmounts(amounts);
      setCsvSkipped(bad);
      setCategory("withdrawal");
      setConfirming(false);
    } catch {
      setError("That file could not be read.");
    }
  };

  const clearSlip = () => {
    setPayAmounts(null);
    setCsvSkipped([]);
    setPicked(new Set());
    setConfirming(false);
  };

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(
      (r) =>
        (r.name || "").toLowerCase().includes(s) ||
        (r.code || "").toLowerCase().includes(s) ||
        (r.zone || "").toLowerCase().includes(s) ||
        (r.phone || "").includes(s),
    );
  }, [rows, q]);

  const toggle = (id) => {
    setConfirming(false);
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Select-all applies to WHAT IS FILTERED, not the whole estate. Ticking a box
  // labelled "all" and silently including people you filtered out is how a
  // message meant for one field reaches everybody.
  const allFilteredPicked =
    filtered.length > 0 && filtered.every((r) => picked.has(r.workerId));

  const toggleAllFiltered = () => {
    setConfirming(false);
    setPicked((prev) => {
      const next = new Set(prev);
      if (allFilteredPicked) filtered.forEach((r) => next.delete(r.workerId));
      else filtered.forEach((r) => next.add(r.workerId));
      return next;
    });
  };

  const unicode = [...message].some((ch) => ch.charCodeAt(0) > 127);
  const perPart = unicode ? 70 : 160;
  const parts = message ? Math.ceil(message.length / perPart) : 0;
  const count = picked.size;
  const totalMessages = parts * count;

  const send = async () => {
    setSending(true);
    setError("");
    try {
      // Two endpoints, because they are two different things. A payment notice
      // carries a per-worker figure and is checked against a paid withdrawal
      // before it goes out; a bulk notice is one message to everyone and
      // carries no amount at all.
      const { data } = payAmounts
        ? await api.post("/sms/send-payments", {
            lines: [...picked].map((id) => ({ workerId: id, amount: payAmounts[id] })),
          })
        : await api.post("/sms/send-bulk", {
            workerIds: [...picked],
            category,
            message,
          });
      onSent?.(data);
      onClose?.();
    } catch (err) {
      setError(apiError(err, "Could not send."));
      setConfirming(false);
    } finally {
      setSending(false);
    }
  };

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[1200] grid place-items-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Send a text message"
      >
        <div className="flex shrink-0 items-center justify-between gap-2 bg-[#14493B] px-4 py-4 sm:px-6">
          <h3 className="text-base font-extrabold text-white sm:text-lg">
            Send a text message
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/20 text-white"
          >
            <LuX size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-[#F4FFE9] px-4 py-4 sm:px-6">
          {error && (
            <p className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</p>
          )}

          {/* ---- 0. payment slip ---- */}
          <div className="rounded-xl bg-white p-3 ring-1 ring-cg-green/10">
            <p className="text-sm font-bold text-cg-ink">
              Notify workers you have paid
            </p>
            <p className="mt-0.5 text-xs text-cg-ink/60">
              Upload the payout slip. It ticks those workers and sends each one
              their own amount. The server checks every figure against a paid
              withdrawal before anything goes out.
            </p>

            {payAmounts ? (
              <div className="mt-3 rounded-lg bg-[#E6F6ED] px-3 py-2 text-xs text-[#1a7f4f] ring-1 ring-[#bfe4cd]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold">
                    Payment mode: {picked.size} worker(s) from the slip.
                  </span>
                  <button
                    type="button"
                    onClick={clearSlip}
                    className="rounded-lg px-2 py-1 font-semibold text-cg-ink/70 underline"
                  >
                    Clear
                  </button>
                </div>
                <p className="mt-1 text-cg-ink/70">
                  Each worker gets their own figure in Bangla. The message below
                  is not used in this mode.
                </p>
              </div>
            ) : (
              <label className="mt-3 flex flex-wrap items-center gap-3">
                <span className={BTN_GHOST}>Upload payout slip…</span>
                <input
                  data-testid="sms-slip-upload"
                  type="file"
                  accept=".csv,text/csv"
                  className="sr-only"
                  disabled={loading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    // Reset so the same file can be chosen again after a fix.
                    e.target.value = "";
                    loadSlip(f);
                  }}
                />
                <span className="text-xs text-cg-ink/50">
                  cg_id, name, phone, amount
                </span>
              </label>
            )}

            {/* The duplicate warning. Auto-notify already texted these people
                when the payment committed, so this would be a second message
                about one payment. Shown, not blocked -- re-sending after a
                failed delivery is a real need. */}
            {payAmounts && autoNotify && (
              <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
                <b>Automatic notices are on.</b> These workers were already
                texted when the payment went through. Sending now means a second
                message about the same money.
              </p>
            )}

            {csvSkipped.length > 0 && (
              <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
                <p className="font-bold">
                  {csvSkipped.length} row(s) were not matched:
                </p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {csvSkipped.map((s, i) => (
                    <li key={i}>
                      Line {s.line}: {s.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* ---- 1. who ---- */}
          <div>
            <p className="text-sm font-bold text-cg-ink">1. Choose who</p>
            <label className="relative mt-2 flex items-center">
              <LuSearch size={15} className="pointer-events-none absolute left-3 text-cg-ink/40" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search name, ID, field or number…"
                className="w-full rounded-xl border border-cg-green/20 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-cg-green"
              />
            </label>

            <div className="mt-2 overflow-hidden rounded-xl bg-white ring-1 ring-cg-green/15">
              <label className="flex items-center gap-3 border-b border-cg-green/10 px-3 py-2">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={allFilteredPicked}
                  onChange={toggleAllFiltered}
                  disabled={filtered.length === 0}
                />
                <span className="text-xs font-bold text-cg-ink">
                  Select all {q.trim() ? "shown" : ""} ({filtered.length})
                </span>
                <span className="ml-auto text-xs font-bold text-cg-green">
                  {count} chosen
                </span>
              </label>

              <ul className="max-h-56 overflow-y-auto">
                {loading ? (
                  <li className="px-3 py-6 text-center text-sm text-cg-ink/50">Loading…</li>
                ) : filtered.length === 0 ? (
                  <li className="px-3 py-6 text-center text-sm text-cg-ink/50">
                    {rows.length === 0
                      ? "No active worker has a phone number on file."
                      : "Nobody matches that search."}
                  </li>
                ) : (
                  filtered.map((r) => (
                    <li key={r.workerId} className="border-b border-cg-green/10 last:border-0">
                      <label className="flex cursor-pointer items-center gap-3 px-3 py-2">
                        <input
                          type="checkbox"
                          className="h-4 w-4 shrink-0"
                          checked={picked.has(r.workerId)}
                          onChange={() => toggle(r.workerId)}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-cg-ink">
                            {r.name}
                          </span>
                          <span className="block truncate text-[11px] text-cg-ink/55">
                            {r.code}
                            {r.zone ? ` • ${r.zone}` : ""}
                          </span>
                        </span>
                        <span className="shrink-0 font-mono text-xs text-cg-ink/60">
                          {r.phone}
                        </span>
                      </label>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>

          {/* ---- 2. what ---- */}
          <div>
            <p className="text-sm font-bold text-cg-ink">2. Choose what to send</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {TEMPLATES.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => {
                    setCategory(t.key);
                    setMessage(t.text);
                    setConfirming(false);
                  }}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    category === t.key
                      ? "bg-cg-dark text-white"
                      : "bg-white text-cg-ink/70 ring-1 ring-cg-green/20"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-cg-ink/55">
              {TEMPLATES.find((t) => t.key === category)?.hint}
            </p>

            <textarea
              value={message}
              onChange={(e) => {
                setMessage(e.target.value);
                setConfirming(false);
              }}
              rows={3}
              className="mt-2 w-full rounded-xl border border-cg-green/20 bg-white px-3 py-2 text-sm outline-none focus:border-cg-green"
            />
            <p className="mt-1 text-[11px] leading-snug text-cg-ink/55">
              <code>{"{name}"}</code> and <code>{"{code}"}</code> are replaced for
              each person. Amounts are deliberately not available here — a
              payslip total differs for everybody, so one shared message carrying
              a number would be wrong for almost everyone who received it.
            </p>
          </div>

          {/* ---- 3. cost ---- */}
          <div className="rounded-xl bg-white p-3 ring-1 ring-cg-green/15">
            <p className="text-sm font-bold text-cg-ink">3. Check before sending</p>
            <div className="mt-1 grid grid-cols-3 gap-2 text-center">
              <div className="min-w-0">
                <p className="truncate text-xl font-extrabold tabular-nums text-cg-ink">{count}</p>
                <p className="text-[10px] uppercase tracking-wide text-cg-ink/50">people</p>
              </div>
              <div className="min-w-0">
                <p className="truncate text-xl font-extrabold tabular-nums text-cg-ink">{parts}</p>
                <p className="text-[10px] uppercase tracking-wide text-cg-ink/50">
                  parts each
                </p>
              </div>
              <div className="min-w-0">
                <p className="truncate text-xl font-extrabold tabular-nums text-cg-green">
                  {totalMessages}
                </p>
                <p className="text-[10px] uppercase tracking-wide text-cg-ink/50">
                  SMS total
                </p>
              </div>
            </div>
            <p className="mt-2 text-[11px] leading-snug text-cg-ink/55">
              {message.length} characters
              {unicode
                ? " — Bangla, so 70 per part instead of 160."
                : " — 160 per part."}{" "}
              Every message is recorded in the SMS delivery log.
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 bg-[#14493B] px-4 py-4 sm:px-6">
          {!confirming ? (
            <button
              type="button"
              className={BTN_DARK + " bg-white !text-[#14493B]"}
              disabled={count === 0 || !message.trim()}
              onClick={() => setConfirming(true)}
            >
              <LuSend size={15} /> Review and send
            </button>
          ) : (
            <>
              <span className="mr-auto flex items-start gap-1.5 text-[11px] text-white/80">
                <LuTriangleAlert size={13} className="mt-0.5 shrink-0" />
                This sends {totalMessages} SMS on the estate SIM. It cannot be undone.
              </span>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-lg px-3 py-2 text-sm font-semibold text-white/70"
              >
                Back
              </button>
              <button
                type="button"
                onClick={send}
                disabled={sending}
                className={BTN_DARK + " bg-white !text-[#14493B]"}
              >
                {sending ? "Sending…" : `Yes, send to ${count}`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
