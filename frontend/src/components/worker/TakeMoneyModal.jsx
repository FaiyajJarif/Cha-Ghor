import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { LuX, LuWallet, LuHandCoins, LuTriangleAlert } from "react-icons/lu";
import api from "../../api/client";
import { apiError } from "../../lib/apiError";

// One modal, two jobs, and it says which one it is doing in every sentence.
//
// `kind` is passed straight through to POST /me/worker/advances, where the
// server picks the ceiling: "salary" is capped by what he has already earned,
// "advance" by the configured advance limit. The cap shown here is only the
// server's own figure echoed back — this screen never decides what is allowed,
// it only avoids wasting a round trip on an amount that is obviously too high.
//
// THE CONFIRM STEP EXISTS ONLY FOR ADVANCES. Taking your own wages needs no
// warning. Borrowing against days you have not worked does, and it is shown
// before the button rather than in a toast afterwards.

const QUICK = [500, 1000, 1500, 2000];

const BN = "০১২৩৪৫৬৭৮৯";
const bn = (s) => String(s).replace(/[0-9]/g, (d) => BN[+d]);
const taka = (n) =>
  `৳ ${bn(Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 }))}`;

export default function TakeMoneyModal({
  open,
  kind,
  max,
  avgDailyEarning,
  onClose,
  onDone,
}) {
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setAmount("");
      setError("");
    }
  }, [open, kind]);

  if (!open) return null;

  const salary = kind === "salary";
  const cap = Number(max || 0);
  const value = Number(amount || 0);
  const over = value > cap;

  // Days with no pay, from HIS average earning. Only meaningful for an advance.
  const avg = Number(avgDailyEarning || 0);
  const noPayDays = !salary && avg > 0 && value > 0 ? Math.ceil(value / avg) : null;

  const submit = async () => {
    if (value <= 0) {
      setError("টাকার পরিমাণ লিখুন।");
      return;
    }
    if (over) {
      setError(`এখন সর্বোচ্চ ${taka(cap)} নিতে পারবেন।`);
      return;
    }
    setBusy(true);
    setError("");
    try {
      // NOT through the offline outbox. This asks the office to move real money
      // to a bKash number; a request replayed from a queue days later, against
      // a balance that has since changed, is exactly the double-payout this
      // system exists to prevent. It needs a live answer.
      await api.post("/me/worker/advances", {
        amount: value,
        method: "bkash",
        kind: salary ? "salary" : "advance",
      });
      onDone?.();
    } catch (err) {
      setError(apiError(err, "আবেদন পাঠানো যায়নি।"));
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="w-full max-w-md overflow-hidden rounded-t-3xl bg-white sm:rounded-3xl">
        <div className="flex items-center justify-between gap-3 bg-[#C0F28B] px-5 py-3">
          <h2 className="flex items-center gap-2 font-extrabold text-[#14493B]">
            {salary ? <LuWallet size={18} /> : <LuHandCoins size={18} />}
            {salary ? "বেতন তুলুন" : "অগ্রিমের আবেদন"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="বন্ধ করুন"
            className="grid h-9 w-9 place-items-center rounded-full bg-white/70 text-[#14493B]"
          >
            <LuX size={17} />
          </button>
        </div>

        <div className="p-5">
          <p className="text-sm text-[#14493B]/70">
            {salary
              ? "আপনার জমা টাকা থেকে বিকাশে পাঠানো হবে। এটি আপনার নিজের টাকা।"
              : "এই টাকা আপনি এখনো কাজ করে আয় করেননি। পরে দৈনিক আয় থেকে কেটে নেওয়া হবে।"}
          </p>
          <p className="mt-1 text-xs font-bold text-[#14493B]">
            সর্বোচ্চ {taka(cap)}
          </p>

          {/* Quick amounts, but only the ones actually allowed. Offering ৳2,000
              and then refusing it is worse than not offering it. */}
          <div className="mt-4 grid grid-cols-2 gap-2">
            {QUICK.filter((q) => q <= cap).map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => {
                  setAmount(String(q));
                  setError("");
                }}
                className={`rounded-2xl px-4 py-4 text-lg font-extrabold transition ${
                  Number(amount) === q
                    ? "bg-[#14493B] text-white"
                    : "bg-[#F4FFE9] text-[#14493B] ring-1 ring-[#13483B]/15"
                }`}
              >
                {taka(q)}
              </button>
            ))}
          </div>

          <label className="mt-3 block text-xs font-bold text-[#14493B]/60">
            অন্য পরিমাণ
            <input
              type="number"
              min="0"
              inputMode="numeric"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setError("");
              }}
              className="mt-1 w-full rounded-xl border border-[#13483B]/25 px-4 py-3 text-lg font-bold text-[#14493B] outline-none focus:border-[#14493B]"
            />
          </label>

          {/* The cost of an advance, in days, before the button. */}
          {noPayDays ? (
            <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-900 ring-1 ring-amber-200">
              <LuTriangleAlert size={14} className="mt-0.5 shrink-0" />
              <span>
                এই {taka(value)} শোধ হতে প্রায় <b>{bn(noPayDays)} দিন</b> লাগবে।
                ওই দিনগুলোতে আপনি কোনো বেতন পাবেন না।
              </span>
            </p>
          ) : null}

          {error && (
            <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={submit}
            disabled={busy || value <= 0 || over}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-6 py-4 text-lg font-extrabold text-white transition hover:brightness-110 disabled:opacity-45"
          >
            {busy ? "পাঠানো হচ্ছে…" : "আবেদন পাঠান"}
          </button>

          {/* Nothing is approved by this screen. Saying so prevents the worker
              waiting by the phone for money that needs an admin first. */}
          <p className="mt-2 text-center text-[11px] text-[#14493B]/50">
            অফিস অনুমোদন করলে বিকাশে টাকা যাবে।
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
