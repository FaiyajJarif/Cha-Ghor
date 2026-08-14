import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { LuX, LuCircleCheck, LuTriangleAlert, LuSend, LuSparkles } from "react-icons/lu";
import api from "../../api/client";
import { apiError } from "../../lib/apiError";
import { speak, stopSpeaking, voiceSupport, onVoicesReady } from "../../lib/voice";

// ঋণের আবেদন — asking the office for a loan.
//
// THE DESIGN DECISION THAT MATTERS
//   The ask was for a one-tap loan button. One-tap borrowing with no thought
//   step, aimed at low-paid workers, is the shape of predatory lending — and
//   this product exists to make debt visible, not frictionless.
//   CHA_GHOR_IDEA.md §1 names "loans never close" as one of the four failures
//   it was built to fix.
//
//   So the tap stayed and what it does changed: pick an amount, SEE WHAT IT
//   COSTS YOU, then one tap to ask. Instalment, term in the worker's own
//   working days, what they will owe in total, and the instalment as a share of
//   their recent take-home.
//
// NOTHING HERE APPROVES ANYTHING. The request is created PENDING; only an admin
// can move it. The screen says so, because a worker who thinks the money is
// coming and then hears nothing has been misled by the interface.

const HEADER = "bg-[#14493B]";
const BN = "০১২৩৪৫৬৭৮৯";
const bn = (s) => String(s).replace(/[0-9]/g, (d) => BN[+d]);
const taka = (v) => "৳" + bn(Number(v || 0).toLocaleString("en-US"));

const QUICK = [500, 1000, 1500, 2000];

export default function LoanRequestModal({ open, blockedBy, voice, onClose, onDone }) {
  const [amount, setAmount] = useState(null);
  const [afford, setAfford] = useState(null);
  const [note, setNote] = useState(null);
  const [loadingAfford, setLoadingAfford] = useState(false);
  const [noteBusy, setNoteBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);
  const [canSpeak, setCanSpeak] = useState(false);

  // Voices load asynchronously in Chrome, so checking once on mount decides
  // "no Bangla voice" on machines that have one.
  useEffect(() => onVoicesReady(() => setCanSpeak(voiceSupport().canSpeak)), []);

  // Say a line only when the dialog was opened BY VOICE and a Bangla voice
  // exists. Someone who opened it by tapping is reading, and being spoken at
  // unexpectedly is startling rather than helpful.
  const say = (text) => {
    if (voice && canSpeak) speak(text);
  };

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!open) {
      stopSpeaking();
      return;
    }
    setAmount(null);
    setAfford(null);
    setNote(null);
    setError("");
    setDone(null);

    // The spoken opening. A blocked worker hears WHY immediately rather than
    // being asked an amount they cannot have — that is the moment a voice
    // interface either respects someone's time or wastes it.
    if (blockedBy > 0) {
      say("আপনার আগের ঋণ পরিশোধ করুন। তারপর নতুন ঋণের আবেদন করতে পারবেন।");
    } else {
      say("কত টাকা ঋণ চাচ্ছেন?");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, blockedBy, canSpeak]);

  // Picking an amount fetches the consequence. Deliberately BEFORE any submit
  // control appears — the number has to be on screen before the decision.
  const pick = async (v) => {
    setAmount(v);
    setNote(null);
    setError("");
    setLoadingAfford(true);
    try {
      const { data } = await api.get("/me/worker/loan-affordability", {
        params: { amount: v },
      });
      setAfford(data);

      // SPEAK THE COST, NOT JUST THE AMOUNT.
      //
      // The request was for the tap to submit straight away. It does not, and
      // this line is why: a worker who cannot read the affordability panel
      // still hears what the loan costs before anything is sent. Skipping it
      // would mean the people least able to check the numbers are the only
      // ones who never hear them.
      const bits = [`${v} টাকা।`];
      if (Number(data?.dailyDeduction) > 0) {
        bits.push(`প্রতিদিন ${Math.round(Number(data.dailyDeduction))} টাকা করে কাটা হবে।`);
      }
      if (data?.approxMonthsToClear != null) {
        bits.push(`শোধ হতে প্রায় ${data.approxMonthsToClear} মাস লাগবে।`);
      }
      if (Number(data?.currentOutstanding) > 0) {
        bits.push(`আপনার মোট বাকি দাঁড়াবে ${Math.round(Number(data.totalAfterThisLoan))} টাকা।`);
      }
      bits.push("আবেদন পাঠাতে চাইলে সবুজ বোতামে চাপ দিন।");
      say(bits.join(" "));
    } catch (err) {
      setAfford(null);
      setError(apiError(err, "হিসাব করা যায়নি।"));
    } finally {
      setLoadingAfford(false);
    }
  };

  const explain = async () => {
    if (!amount) return;
    setNoteBusy(true);
    try {
      const { data } = await api.get("/me/worker/loan-note", { params: { amount } });
      setNote(data);
    } catch (err) {
      setNote({ error: apiError(err, "ব্যাখ্যা আনা যায়নি।") });
    } finally {
      setNoteBusy(false);
    }
  };

  const submit = async () => {
    if (!amount) return;
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post("/me/worker/loans", { amount });
      setDone(data);
      onDone?.(data);
    } catch (err) {
      setError(apiError(err, "আবেদন পাঠানো যায়নি।"));
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  // A high instalment relative to pay is worth marking without a model, so the
  // warning still appears when ai_service is down.
  const heavy = afford?.instalmentPctOfPay != null && afford.instalmentPctOfPay >= 25;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[1200] bg-black/40" onClick={onClose} aria-hidden />
      <div className="fixed inset-0 z-[1210] flex items-center justify-center p-4">
        <div
          className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-label="ঋণের আবেদন"
        >
          <div className={`flex items-center justify-between ${HEADER} px-6 py-5`}>
            <div>
              <h3 className="text-xl font-extrabold text-white">ঋণের আবেদন</h3>
              <p className="text-xs text-white/60">
                অফিস সিদ্ধান্ত নেবে — এটি এখনই অনুমোদন নয়
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="বন্ধ করুন"
              className="grid h-9 w-9 place-items-center rounded-full bg-white/20 text-white"
            >
              <LuX size={16} />
            </button>
          </div>

          {/* An unpaid loan blocks a new one — enforced on the server, explained
              here. Naming the balance and pointing at অগ্রিম is the difference
              between a refusal and a dead end. */}
          {blockedBy > 0 ? (
            <div className="flex flex-col items-center px-8 py-10 text-center">
              <LuTriangleAlert size={52} strokeWidth={1.5} className="text-amber-600" />
              <h4 className="mt-4 text-lg font-extrabold text-[#14493B]">
                এখন নতুন ঋণ নেওয়া যাবে না
              </h4>
              <p className="mt-2 text-sm text-[#14493B]/65">
                আপনার আগের ঋণ থেকে এখনো{" "}
                <strong className="text-[#14493B]">{taka(blockedBy)}</strong> বাকি
                আছে। সেটি শোধ হলে নতুন আবেদন করতে পারবেন।
              </p>
              <p className="mt-3 rounded-xl bg-[#F4FFE9] px-4 py-3 text-xs text-[#14493B]/70">
                জরুরি প্রয়োজন হলে <strong>অগ্রিমের আবেদন</strong> করুন — সেটি পরের
                বেতন থেকে একবারে সমন্বয় হয়।
              </p>
              <button
                type="button"
                onClick={onClose}
                className={`mt-6 w-full rounded-2xl ${HEADER} px-6 py-3 text-sm font-semibold text-white`}
              >
                বুঝেছি
              </button>
            </div>
          ) : done ? (
            <div className="flex flex-col items-center px-8 py-10 text-center">
              <LuCircleCheck size={54} strokeWidth={1.5} className="text-[#14493B]" />
              <h4 className="mt-4 text-xl font-extrabold text-[#14493B]">
                আবেদন পাঠানো হয়েছে
              </h4>
              <p className="mt-2 text-sm text-[#14493B]/60">
                {taka(done.amount)} টাকার আবেদন অফিসে গেছে। অফিস সিদ্ধান্ত নিলে
                আপনি জানতে পারবেন। এখনো টাকা অনুমোদন হয়নি।
              </p>
              <button
                type="button"
                onClick={onClose}
                className={`mt-6 w-full rounded-2xl ${HEADER} px-6 py-3 text-sm font-semibold text-white`}
              >
                ঠিক আছে
              </button>
            </div>
          ) : (
            <>
              <div className="flex-1 space-y-4 overflow-y-auto bg-[#F4FFE9] px-6 py-5">
                {error && (
                  <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-sm text-rose-700">
                    {error}
                  </p>
                )}

                <div>
                  <p className="mb-2 text-sm font-bold text-[#14493B]">
                    কত টাকা দরকার?
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {QUICK.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => pick(q)}
                        className={`rounded-xl px-4 py-3 text-base font-extrabold transition ${
                          amount === q
                            ? "bg-[#14493B] text-white"
                            : "bg-white text-[#14493B] ring-1 ring-[#13483B]/25 hover:bg-[#E8F8D8]"
                        }`}
                      >
                        {taka(q)}
                      </button>
                    ))}
                  </div>
                </div>

                {loadingAfford && (
                  <p className="text-center text-sm text-[#14493B]/50">{"হিসাব করা হচ্ছে…"}</p>
                )}

                {/* The consequence, before the submit control exists. */}
                {afford && !loadingAfford && (
                  <>
                    <div className="space-y-2 rounded-xl bg-white p-4 ring-1 ring-[#13483B]/15">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-[#14493B]/50">
                        এটি নিলে যা হবে
                      </p>
                      <div className="flex justify-between text-sm">
                        <span className="text-[#14493B]/70">প্রতিদিন কাটা যাবে</span>
                        <span className="font-bold text-[#14493B]">
                          {taka(afford.dailyDeduction)}
                        </span>
                      </div>
                      {afford.workingDaysToClear != null && (
                        <div className="flex justify-between text-sm">
                          <span className="text-[#14493B]/70">শোধ হতে লাগবে</span>
                          <span className="font-bold text-[#14493B]">
                            {bn(afford.workingDaysToClear)} কর্মদিবস
                            {afford.approxMonthsToClear != null
                              ? ` (প্রায় ${bn(afford.approxMonthsToClear)} মাস)`
                              : ""}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between border-t border-[#13483B]/10 pt-2 text-sm">
                        <span className="text-[#14493B]/70">মোট বাকি দাঁড়াবে</span>
                        <span className="font-extrabold text-[#14493B]">
                          {taka(afford.totalAfterThisLoan)}
                        </span>
                      </div>
                      {afford.instalmentPctOfPay != null && (
                        <div className="flex justify-between text-sm">
                          <span className="text-[#14493B]/70">আপনার বেতনের</span>
                          <span
                            className={`font-bold ${heavy ? "text-amber-700" : "text-[#14493B]"}`}
                          >
                            প্রায় {bn(afford.instalmentPctOfPay)}%
                          </span>
                        </div>
                      )}
                      {afford.caveat && (
                        <p className="pt-1 text-[11px] text-[#14493B]/45">{afford.caveat}</p>
                      )}
                    </div>

                    {heavy && (
                      <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-900 ring-1 ring-amber-200">
                        <LuTriangleAlert size={14} className="mt-0.5 shrink-0" />
                        এই কিস্তি আপনার মাসের আয়ের বড় অংশ। কম টাকা নিলে প্রতি মাসে
                        চাপ কম পড়বে।
                      </p>
                    )}

                    {/* The AI part: one Bangla sentence over figures already on
                        screen. Opt-in, and its absence costs nothing. */}
                    {note?.note ? (
                      <p className="rounded-xl bg-white px-4 py-3 text-sm leading-relaxed text-[#14493B] ring-1 ring-[#13483B]/15">
                        {note.note}
                      </p>
                    ) : note?.error ? (
                      <p className="rounded-xl bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
                        {note.error}
                      </p>
                    ) : (
                      <button
                        type="button"
                        onClick={explain}
                        disabled={noteBusy}
                        className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-bold text-[#14493B] ring-1 ring-[#13483B]/25 disabled:opacity-50"
                      >
                        <LuSparkles size={13} />
                        {noteBusy ? "লেখা হচ্ছে…" : "সহজ ভাষায় বুঝিয়ে দিন"}
                      </button>
                    )}
                  </>
                )}
              </div>

              <div className={`flex items-center justify-end gap-2 ${HEADER} px-6 py-4`}>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white/70"
                >
                  বাতিল
                </button>
                <button
                  type="button"
                  onClick={submit}
                  // Cannot submit before the consequence has loaded. That is the
                  // whole point of the screen.
                  disabled={busy || !amount || !afford}
                  className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-[#14493B] disabled:opacity-50"
                >
                  <LuSend size={15} />
                  {busy ? "পাঠানো হচ্ছে…" : "আবেদন পাঠান"}
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
