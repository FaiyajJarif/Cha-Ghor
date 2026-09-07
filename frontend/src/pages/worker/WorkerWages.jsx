import { useCallback, useEffect, useState } from "react";
import { LuInfo, LuTriangleAlert, LuHandCoins, LuMic, LuPrinter } from "react-icons/lu";
import api from "../../api/client";
import { apiError } from "../../lib/apiError";
import TakeMoneyModal from "../../components/worker/TakeMoneyModal";
import MoneyActions from "../../components/worker/MoneyActions";
import DailyLedger from "../../components/worker/DailyLedger";
import PayChangePanel from "../../components/worker/PayChangePanel";
import MyPayslip from "../../components/worker/MyPayslip";
import LoanRequestModal from "../../components/worker/LoanRequestModal";
import {
  listenOnce,
  heardLoan,
  voiceSupport,
  onVoicesReady,
  voiceErrorMessage,
} from "../../lib/voice";

// বেতন ও ঋণ — a worker's own pay, shown line by line.
//
// THIS SCREEN IS THE POINT OF THE PROJECT. CHA_GHOR_IDEA.md §1 says a worker
// "cannot verify their own kilos or their own arithmetic. There is no payslip."
// Everything else — the weigh-in, the wage engine, the ledger — exists so that
// this page can be correct.
//
// SO IT SHOWS EVERY LINE, AND IT SHOWS THE DEDUCTIONS.
// The mockup for this screen listed base / attendance bonus / collection bonus /
// tax. Two of those do not exist in the wage engine, and it left out the loan
// deduction and the advance recovery — which are precisely the two things
// §1 identifies as going wrong ("advances vanish", "loans never close"). A
// payslip that hides them would recreate the dispute this system exists to end.
//
// A DRAFT IS NOT A PROMISE. Anything not yet approved still moves as more leaf
// is weighed. The server marks it `provisional` and this page says so loudly,
// because a worker who reads a mid-month figure as final has been misled by the
// one screen that was supposed to stop that happening.

const CARD = "rounded-2xl bg-white p-5 shadow ring-1 ring-[#13483B]/10";

// Bangla digits, because the rest of this console is Bangla and a plucker
// reading ৳৩,২৬০ should not have to switch numeral systems mid-sentence.
const BN = "০১২৩৪৫৬৭৮৯";
const bn = (s) => String(s).replace(/[0-9]/g, (d) => BN[+d]);

const taka = (v) =>
  v == null ? "—" : "৳" + bn(Number(v).toLocaleString("en-US", { maximumFractionDigits: 0 }));

const kg = (v) => (v == null ? "—" : bn(Number(v).toFixed(1)) + " কেজি");

const MONTHS_BN = [
  "জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন",
  "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর",
];
const monthLabel = (iso) => {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00`);
  return `${MONTHS_BN[d.getMonth()]} ${bn(d.getFullYear())}`;
};

const STATUS_BN = {
  draft: { label: "খসড়া", tone: "bg-slate-100 text-slate-600" },
  review: { label: "যাচাই চলছে", tone: "bg-amber-100 text-amber-800" },
  approved: { label: "অনুমোদিত", tone: "bg-sky-100 text-sky-700" },
  paid: { label: "পরিশোধিত", tone: "bg-emerald-100 text-emerald-700" },
};

// Withdrawal statuses are lowercase Postgres enum labels.
const ADVANCE_BN = {
  pending: { label: "অপেক্ষায়", tone: "bg-amber-100 text-amber-800" },
  paid: { label: "দেওয়া হয়েছে", tone: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "বাতিল", tone: "bg-rose-100 text-rose-700" },
};

const dateBn = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${bn(d.getDate())} ${MONTHS_BN[d.getMonth()]}`;
};

// The seven lines, in the order the engine computes them. `sign` drives the
// colour and the minus sign; nothing here is a category the engine does not have.
const EARNINGS = [
  ["base", "মূল মজুরি", "উপস্থিত দিন × দৈনিক মজুরি"],
  ["surplus", "অতিরিক্ত পাতার মজুরি", "কোটার বেশি পাতা, প্রতিদিন হিসাব করে"],
  ["gradeBonus", "'এ' গ্রেড বোনাস", "'এ' গ্রেড পাতার জন্য বাড়তি"],
];
const DEDUCTIONS = [
  ["loanDeduction", "ঋণ কর্তন", "চলতি ঋণ থেকে কাটা হয়েছে"],
  ["advanceRecovery", "অগ্রিম সমন্বয়", "আগে নেওয়া অগ্রিম টাকা"],
  ["otherDeduction", "অন্যান্য কর্তন", "অফিস থেকে যোগ করা"],
];

function Line({ label, hint, value, negative }) {
  const zero = !value || Number(value) === 0;
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[#13483B]/8 py-3 last:border-0">
      <div className="min-w-0">
        <p className={`text-sm font-semibold ${zero ? "text-[#14493B]/45" : "text-[#14493B]"}`}>
          {label}
        </p>
        <p className="text-[11px] text-[#14493B]/45">{hint}</p>
      </div>
      <p
        className={`shrink-0 text-sm font-bold tabular-nums ${
          zero ? "text-[#14493B]/35" : negative ? "text-rose-600" : "text-[#14493B]"
        }`}
      >
        {negative && !zero ? "− " : ""}
        {taka(value)}
      </p>
    </div>
  );
}

export default function WorkerWages() {
  const [wages, setWages] = useState(null);
  const [loans, setLoans] = useState(null);
  const [advances, setAdvances] = useState([]);
  const [advanceOpen, setAdvanceOpen] = useState(false);
  // Needed by TakeMoneyModal above. MoneyActions fetches its own copy for its
  // own display; this one exists only so the modal opened from elsewhere on
  // the page carries the same ceiling.
  const [limits, setLimits] = useState(null);
  const [loanOpen, setLoanOpen] = useState(false);
  const [slipOpen, setSlipOpen] = useState(false);
  // The profile call, purely so the printed slip carries a name, a worker id
  // and a field. Failing it must not break the wages page.
  const [profile, setProfile] = useState(null);
  // Was the dialog opened by voice? Decides whether it speaks back — someone
  // who tapped is reading and should not be spoken at unexpectedly.
  const [byVoice, setByVoice] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceOk, setVoiceOk] = useState(false);
  const [heard, setHeard] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const [w, l, a, lim, prof] = await Promise.all([
      api.get("/me/worker/wages"),
      api.get("/me/worker/loans").catch(() => ({ data: null })),
      api.get("/me/worker/advances").catch(() => ({ data: [] })),
      api.get("/me/worker/limits").catch(() => ({ data: null })),
      api.get("/me/worker").catch(() => ({ data: null })),
    ]);
    setWages(w.data);
    setLoans(l.data);
    setAdvances(a.data || []);
    setLimits(lim.data);
    setProfile(prof.data);
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    load()
      .catch((err) => alive && setError(apiError(err, "বেতনের তথ্য আনা যায়নি।")))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [load]);

  // The mic only appears if the browser can genuinely listen. Recognition needs
  // a SECURE CONTEXT, so on a phone at http://192.168.x.x it is unavailable —
  // which is exactly the setup a field demo uses. Better to hide the control
  // than to offer one that silently fails.
  useEffect(() => onVoicesReady(() => setVoiceOk(voiceSupport().canListen)), []);

  const startListening = () => {
    setHeard("");
    setListening(true);
    listenOnce({
      onResult: (alts) => {
        if (heardLoan(alts)) {
          setByVoice(true);
          setLoanOpen(true);
          setHeard("");
        } else {
          // Say what was heard, so a worker knows it listened and got the wrong
          // word rather than wondering whether the button works at all.
          setHeard(
            `“${alts[0] || ""}” শুনলাম — বুঝতে পারিনি। “ঋণ” বলুন, অথবা নিচের বোতামে চাপ দিন।`,
          );
        }
      },
      onEnd: () => setListening(false),
      onError: (code) => {
        setListening(false);
        const { text, permanent } = voiceErrorMessage(code);
        setHeard(text);
        // A browser that cannot do this will not start doing it. Hiding the
        // button after the first definite failure is kinder than leaving a
        // control that flashes and does nothing — which is exactly how this
        // behaved in Brave before the failure could be detected at all.
        if (permanent) setVoiceOk(false);
      },
    });
  };

  if (loading) {
    return (
      <div className="grid h-64 place-items-center text-sm text-[#14493B]/60">
        {"লোড হচ্ছে…"}
      </div>
    );
  }

  const cur = wages?.current;
  const history = wages?.history || [];
  // At most one open request at a time — the server enforces it, and showing
  // the open one instead of the button is what makes that rule legible rather
  // than a surprise 409.
  const pending = advances.find((a) => a.status === "pending");
  const decided = advances.filter((a) => a.status !== "pending");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold text-[#14493B]">বেতন ও ঋণ</h1>
          <p className="text-sm text-[#14493B]/60">
            আপনার মজুরি কীভাবে হিসাব হলো, কত কাটা হয়েছে এবং হাতে কত পাবেন
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* ঋণের আবেদন, up here in the header.
              The same action exists lower down inside the আপনার ঋণ card, but
              that card sits below the wage breakdown and is off-screen on a
              phone — a worker who opened this page to borrow had to scroll
              past the thing they were not looking for to reach it.
              Both open the SAME modal, so the block rule and the wording can
              only be written once.

              NOT hidden when a loan is outstanding. The modal explains the
              block and says what they can do instead; a missing button would
              leave someone wondering whether the feature exists at all. The
              server refuses it independently either way. */}
          {/* A payslip they can keep. CHA_GHOR_IDEA.md §1 — "there is no
              payslip" — is the failure this whole screen answers, and a
              printable copy is what a worker takes to somebody who reads. */}
          <button
            type="button"
            onClick={() => setSlipOpen(true)}
            disabled={!cur}
            className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-bold text-[#14493B] ring-2 ring-[#14493B]/25 transition hover:bg-[#F4FFE9] disabled:opacity-40"
          >
            <LuPrinter size={17} /> বেতন স্লিপ
          </button>

          <button
            type="button"
            onClick={() => setLoanOpen(true)}
            className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-bold text-[#14493B] ring-2 ring-[#14493B]/25 transition hover:bg-[#F4FFE9]"
          >
            <LuHandCoins size={17} /> ঋণের আবেদন
          </button>

          {/* Say "ঋণ" to open the same dialog.
              Shown ONLY when the browser can actually listen — an unusable mic
              button on a screen built for people who may not read is worse than
              no button. Everything it does is also reachable by tapping, and
              now by the button immediately to its left. */}
          {voiceOk && (
            <button
              type="button"
              onClick={startListening}
              aria-label="কথা বলে ঋণের আবেদন করুন"
              className={`inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold transition ${
                listening
                  ? "animate-pulse bg-rose-600 text-white"
                  : "bg-[#14493B] text-white hover:brightness-110"
              }`}
            >
              <LuMic size={18} />
              {listening ? "শুনছি…" : "কথা বলুন"}
            </button>
          )}
        </div>
      </div>

      {/* টাকা — moved here from the profile. This is the বেতন ও ঋণ page, and
          it is the only place money can be taken, so the withdraw / advance /
          loan distinction lives in one component instead of three screens.
          The profile now shows only the payment card. */}
      <MoneyActions onChanged={() => load().catch(() => {})} />

      {/* Why a worked day paid nothing. */}
      <DailyLedger />

      {/* Why THIS MONTH differs from last month. Built and verified two
          sessions ago and then never mounted — the endpoint existed, no screen
          fetched it, so the feature did not exist as far as a worker was
          concerned. It renders nothing when the components do not reconcile. */}
      <PayChangePanel />

      {heard && (
        <p className="rounded-xl bg-white px-4 py-2.5 text-sm text-[#14493B] ring-1 ring-[#13483B]/15">
          {heard}
        </p>
      )}

      {error && (
        <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">
          {error}
        </p>
      )}

      {!cur && !error && (
        <p className={`${CARD} text-sm text-[#14493B]/60`}>
          এই মাসের বেতন এখনো তৈরি হয়নি। মাস শেষে অফিস হিসাব করলে এখানে দেখা যাবে।
        </p>
      )}

      {cur && (
        <>
          {/* Provisional warning first, above the numbers it applies to. */}
          {cur.provisional && (
            <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
              <LuTriangleAlert size={16} className="mt-0.5 shrink-0" />
              এটি চলতি মাসের <strong>অস্থায়ী হিসাব</strong>। আপনি আরও পাতা তুললে বা
              কর্তন বদলালে এই সংখ্যা বদলাবে। মাস শেষে অফিস অনুমোদন করলে এটি চূড়ান্ত হবে।
            </p>
          )}

          <div className="grid gap-5 lg:grid-cols-3">
            {/* The payslip itself */}
            <div className={`${CARD} lg:col-span-2`}>
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-extrabold text-[#14493B]">
                  {monthLabel(cur.periodStart)} মাসের হিসাব
                </h2>
                <span
                  className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                    (STATUS_BN[cur.status] || STATUS_BN.draft).tone
                  }`}
                >
                  {(STATUS_BN[cur.status] || STATUS_BN.draft).label}
                </span>
              </div>

              {/* What the pay was computed FROM. Without this a worker is still
                  being asked to trust arithmetic they cannot check. */}
              <div className="mb-4 flex flex-wrap gap-4 rounded-xl bg-[#F4FFE9] px-4 py-3 text-xs text-[#14493B]/70">
                <span>
                  উপস্থিত: <strong className="text-[#14493B]">{bn(cur.presentDays)} দিন</strong>
                </span>
                <span>
                  মোট পাতা: <strong className="text-[#14493B]">{kg(cur.leafKg)}</strong>
                </span>
                <span>
                  'এ' গ্রেড: <strong className="text-[#14493B]">{kg(cur.gradeAKg)}</strong>
                </span>
              </div>

              <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[#14493B]/45">
                আয়
              </p>
              {EARNINGS.map(([k, label, hint]) => (
                <Line key={k} label={label} hint={hint} value={cur[k]} />
              ))}
              <div className="flex items-center justify-between border-t-2 border-[#13483B]/15 py-3">
                <p className="text-sm font-extrabold text-[#14493B]">মোট আয়</p>
                <p className="text-base font-extrabold tabular-nums text-[#14493B]">
                  {taka(cur.gross)}
                </p>
              </div>

              <p className="mb-1 mt-4 text-[11px] font-bold uppercase tracking-wide text-[#14493B]/45">
                কর্তন
              </p>
              {DEDUCTIONS.map(([k, label, hint]) => (
                <Line key={k} label={label} hint={hint} value={cur[k]} negative />
              ))}

              <div className="mt-4 flex items-center justify-between rounded-xl bg-[#14493B] px-5 py-4">
                <div>
                  <p className="text-sm font-bold text-white">নেট প্রদেয়</p>
                  <p className="text-[11px] text-white/60">
                    {cur.provisional ? "এখন পর্যন্ত হিসাব" : "চূড়ান্ত"}
                  </p>
                </div>
                <p className="text-3xl font-extrabold tabular-nums text-white">
                  {taka(cur.netPayable)}
                </p>
              </div>

              <p className="mt-3 flex items-start gap-2 text-[11px] text-[#14493B]/50">
                <LuInfo size={13} className="mt-0.5 shrink-0" />
                কোনো কর্তন বুঝতে না পারলে বা ভুল মনে হলে &ldquo;প্রশাসককে রিপোর্ট করুন&rdquo;
                থেকে জানান। নেট কখনো শূন্যের নিচে যায় না — বাকি থাকলে তা ঋণেই থেকে যায়।
              </p>
            </div>

            {/* Loans */}
            <div className="space-y-5">
              <div className={CARD}>
                <h2 className="text-sm font-extrabold uppercase tracking-wide text-[#14493B]">
                  আপনার ঋণ
                </h2>
                {!loans?.loans?.length ? (
                  <>
                    <p className="mt-3 text-sm text-[#14493B]/55">
                      আপনার কোনো চলতি ঋণ নেই।
                    </p>
                    <button
                      type="button"
                      onClick={() => setLoanOpen(true)}
                      className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#14493B] px-4 py-2.5 text-sm font-bold text-white transition hover:brightness-110"
                    >
                      <LuHandCoins size={15} /> ঋণের আবেদন
                    </button>
                  </>
                ) : (
                  <>
                    <p className="mt-2 text-3xl font-extrabold tabular-nums text-[#14493B]">
                      {taka(loans.totalOutstanding)}
                    </p>
                    <p className="text-xs text-[#14493B]/55">এখনো বাকি আছে</p>
                    <ul className="mt-4 space-y-3">
                      {loans.loans.map((l) => (
                        <li key={l.ref} className="rounded-xl bg-[#F4FFE9] px-3 py-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-[#14493B]">{l.ref}</span>
                            <span className="text-sm font-extrabold tabular-nums text-[#14493B]">
                              {taka(l.outstanding)}
                            </span>
                          </div>
                          <p className="mt-0.5 text-[11px] text-[#14493B]/55">
                            মোট {taka(l.principal)} · শোধ হয়েছে {taka(l.repaid)}
                          </p>
                          {Number(l.dailyDeduction) > 0 && (
                            <>
                              <p className="text-[11px] text-[#14493B]/55">
                                প্রতিদিন {taka(l.dailyDeduction)} করে কাটা হচ্ছে
                              </p>
                              {/* WHEN IT ENDS. "৳1,860 outstanding" tells a
                                  worker nothing about whether this ever
                                  finishes; a number of days does.

                                  কর্মদিবস — WORKING days, not calendar days,
                                  and the distinction is real: a day not worked
                                  deducts nothing, so the debt pauses rather
                                  than running on a calendar. Promising a date
                                  would be inventing one. */}
                              <p className="mt-0.5 text-[11px] font-semibold text-[#14493B]/70">
                                আর প্রায়{" "}
                                {bn(
                                  Math.ceil(
                                    Number(l.outstanding) / Number(l.dailyDeduction),
                                  ),
                                )}{" "}
                                কর্মদিবস কাটলে এই ঋণ শেষ হবে
                              </p>
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                    {/* An unpaid loan blocks a new one. The button stays
                        visible and says why — hiding it would leave a worker
                        wondering whether the feature exists. The server
                        enforces the same rule regardless. */}
                    <button
                      type="button"
                      onClick={() => setLoanOpen(true)}
                      title="আগের ঋণ শোধ হলে নতুন আবেদন করা যাবে"
                      className="mt-4 inline-flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-[#14493B]/30 px-4 py-2.5 text-sm font-bold text-white"
                    >
                      <LuHandCoins size={15} /> ঋণের আবেদন
                    </button>
                    <p className="mt-1.5 text-[10px] leading-snug text-[#14493B]/45">
                      আগের ঋণ বাকি থাকায় নতুন ঋণ নেওয়া যাবে না। জরুরি প্রয়োজনে
                      অগ্রিমের আবেদন করুন।
                    </p>
                  </>
                )}
              </div>

              {/* Advances. Goes through /me/worker/advances, which takes the
                  worker from the JWT — not /withdrawals, which reads workerId
                  from the request body and would let a worker file against a
                  colleague's wages. */}
              <div className={CARD}>
                <h2 className="text-sm font-extrabold uppercase tracking-wide text-[#14493B]">
                  অগ্রিম
                </h2>

                {pending ? (
                  <>
                    <p className="mt-2 text-xs text-[#14493B]/60">
                      আপনার একটি আবেদন অফিসে বিবেচনাধীন আছে।
                    </p>
                    <div className="mt-3 rounded-xl bg-amber-50 px-4 py-3 ring-1 ring-amber-200">
                      <p className="text-xl font-extrabold tabular-nums text-amber-900">
                        {taka(pending.amount)}
                      </p>
                      <p className="text-[11px] text-amber-900/70">
                        {dateBn(pending.requestedAt)} তারিখে পাঠানো · সিদ্ধান্তের
                        অপেক্ষায়
                      </p>
                    </div>
                    <p className="mt-2 text-[10px] text-[#14493B]/45">
                      একসাথে একটির বেশি আবেদন করা যায় না — না হলে একই বেতন থেকে
                      কয়েকবার কাটা পড়তে পারে।
                    </p>
                  </>
                ) : (
                  <>
                    {/* No button here any more. Taking money happens in ONE
                        place on this page — the টাকা block above — because that
                        is the only place that knows the difference between
                        withdrawing your own earned wages and borrowing an
                        advance against days you have not worked. A second
                        entry point here offered the advance without the
                        no-pay-days warning attached to it. */}
                    <p className="mt-2 text-xs text-[#14493B]/60">
                      মাসের মাঝে টাকা দরকার হলে উপরের{" "}
                      <b>টাকা</b> অংশ থেকে অগ্রিম চাইতে পারেন। অফিস অনুমোদন
                      করলে সেটি পরের বেতন থেকে সমন্বয় হবে।
                    </p>
                  </>
                )}

                {/* Past requests, so an approved advance and the deduction that
                    follows it can be tied together by the worker themselves. */}
                {decided.length > 0 && (
                  <ul className="mt-4 space-y-2 border-t border-[#13483B]/10 pt-3">
                    {decided.slice(0, 4).map((a) => (
                      <li key={a.id} className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-[#14493B]/60">{dateBn(a.requestedAt)}</span>
                        <span className="font-bold tabular-nums text-[#14493B]">
                          {taka(a.amount)}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            ADVANCE_BN[a.status]?.tone || "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {ADVANCE_BN[a.status]?.label || a.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="overflow-hidden rounded-2xl bg-white shadow ring-1 ring-[#13483B]/10">
          <div className="bg-[#C0F28B] px-5 py-3">
            <h2 className="font-bold text-[#14493B]">আগের মাসের মজুরি</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-[#14493B]/50">
                <tr>
                  <th className="bg-[#D3FFAC] px-5 py-3">মাস</th>
                  <th className="bg-[#D3FFAC] px-5 py-3 text-right">মোট আয়</th>
                  <th className="bg-[#D3FFAC] px-5 py-3 text-right">কর্তন</th>
                  <th className="bg-[#D3FFAC] px-5 py-3 text-right">নেট</th>
                  <th className="bg-[#D3FFAC] px-5 py-3">অবস্থা</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#13483B]/8">
                {history.map((p) => {
                  const cut =
                    Number(p.loanDeduction || 0) +
                    Number(p.advanceRecovery || 0) +
                    Number(p.otherDeduction || 0);
                  const s = STATUS_BN[p.status] || STATUS_BN.draft;
                  return (
                    <tr key={`${p.periodStart}-${p.periodEnd}`} className="hover:bg-[#F4FFE9]">
                      <td className="px-5 py-3 font-semibold text-[#14493B]">
                        {monthLabel(p.periodStart)}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-[#14493B]">
                        {taka(p.gross)}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-rose-600">
                        {cut > 0 ? `− ${taka(cut)}` : taka(0)}
                      </td>
                      <td className="px-5 py-3 text-right font-bold tabular-nums text-[#14493B]">
                        {taka(p.netPayable)}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${s.tone}`}>
                          {s.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <LoanRequestModal
        open={loanOpen}
        voice={byVoice}
        // Passed so the modal can explain the block rather than only refusing.
        // The server enforces it independently — a disabled button is a
        // suggestion, not a rule.
        blockedBy={Number(loans?.totalOutstanding || 0)}
        onClose={() => {
          setLoanOpen(false);
          setByVoice(false);
        }}
        onDone={() => load().catch(() => {})}
      />

      {/* Kept for the voice flow and any other caller that still opens it by
          setting advanceOpen. Same component the টাকা block uses, so the cap
          and the no-pay-days warning can only be written once.
          kind="advance": this entry point is explicitly borrowing. */}
      <MyPayslip
        open={slipOpen}
        period={cur}
        worker={profile}
        onClose={() => setSlipOpen(false)}
      />

      <TakeMoneyModal
        open={advanceOpen}
        kind="advance"
        max={Number(limits?.advanceAvailable || 0)}
        avgDailyEarning={Number(limits?.averageDailyEarning || 0)}
        onClose={() => setAdvanceOpen(false)}
        onDone={() => {
          setAdvanceOpen(false);
          load().catch(() => {});
        }}
      />
    </div>
  );
}
