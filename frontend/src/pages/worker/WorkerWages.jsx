import { useCallback, useEffect, useState } from "react";
import { LuInfo, LuTriangleAlert, LuHandCoins } from "react-icons/lu";
import api from "../../api/client";
import { apiError } from "../../lib/apiError";

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const [w, l] = await Promise.all([
      api.get("/me/worker/wages"),
      api.get("/me/worker/loans").catch(() => ({ data: null })),
    ]);
    setWages(w.data);
    setLoans(l.data);
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

  if (loading) {
    return (
      <div className="grid h-64 place-items-center text-sm text-[#14493B]/60">
        {"লোড হচ্ছে…"}
      </div>
    );
  }

  const cur = wages?.current;
  const history = wages?.history || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-[#14493B]">বেতন ও ঋণ</h1>
        <p className="text-sm text-[#14493B]/60">
          আপনার মজুরি কীভাবে হিসাব হলো, কত কাটা হয়েছে এবং হাতে কত পাবেন
        </p>
      </div>

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
                  <p className="mt-3 text-sm text-[#14493B]/55">
                    আপনার কোনো চলতি ঋণ নেই।
                  </p>
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
                            <p className="text-[11px] text-[#14493B]/55">
                              প্রতিদিন {taka(l.dailyDeduction)} করে কাটা হচ্ছে
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>

              {/* Advance request. Points at the withdrawal flow, which already
                  admits WORKER — not at the loan endpoints, which do not. */}
              <div className={CARD}>
                <h2 className="text-sm font-extrabold uppercase tracking-wide text-[#14493B]">
                  অগ্রিম চাই
                </h2>
                <p className="mt-2 text-xs text-[#14493B]/60">
                  মাসের মাঝে টাকা দরকার হলে অগ্রিম চাইতে পারেন। অফিস অনুমোদন করলে
                  সেটি পরের বেতন থেকে সমন্বয় হবে।
                </p>
                <button
                  type="button"
                  disabled
                  title="পরের ধাপে যুক্ত হবে"
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#14493B] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40"
                >
                  <LuHandCoins size={15} /> অগ্রিমের আবেদন
                </button>
                <p className="mt-2 text-[10px] text-[#14493B]/40">
                  এই বোতামটি এখনো কাজ করে না — পরের ধাপে যুক্ত হবে।
                </p>
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
    </div>
  );
}
