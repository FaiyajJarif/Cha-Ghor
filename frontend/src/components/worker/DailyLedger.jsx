import { useCallback, useEffect, useState } from "react";
import { LuCircleCheck, LuCircleX, LuClock, LuLock } from "react-icons/lu";
import api from "../../api/client";
import { apiError } from "../../lib/apiError";

// দিনের হিসাব — what each day earned and where it went.
//
// This is the screen that answers "why did I get nothing today". Before it, the
// only available answer was a monthly payslip with `advanceRecovery` as a
// single line, which is true and completely useless to somebody who worked
// yesterday and was handed nothing.
//
// IT SHOWS A PROJECTION, NOT A SECOND PAYMENT. /me/worker/daily computes these
// figures from the same attendance and leaf rows the payslip is built from, and
// they sum exactly to gross − loanDeduction − advanceRecovery. See the header
// of DailyLedgerService.java. Nothing on this screen moves money.
//
// Newest day first: the worker opened this to ask about today, not about the
// 1st of the month.

const CARD = "rounded-2xl bg-white shadow ring-1 ring-[#13483B]/10";

const BN = "০১২৩৪৫৬৭৮৯";
const bn = (s) => String(s).replace(/[0-9]/g, (d) => BN[+d]);
const taka = (n) =>
  `৳${bn(Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 }))}`;
const MONTHS_BN = [
  "জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন",
  "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর",
];
const dayBn = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${bn(d.getDate())} ${MONTHS_BN[d.getMonth()]}`;
};

const STATUS = {
  present: { label: "উপস্থিত", icon: LuCircleCheck, tone: "text-emerald-700" },
  late: { label: "দেরিতে", icon: LuClock, tone: "text-amber-700" },
  absent: { label: "অনুপস্থিত", icon: LuCircleX, tone: "text-rose-700" },
  leave: { label: "ছুটি", icon: LuCircleX, tone: "text-[#14493B]/45" },
};

export default function DailyLedger({ limit = 10 }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/me/worker/daily");
      setData(data);
      setError("");
    } catch (err) {
      setError(apiError(err, "দিনের হিসাব আনা যায়নি।"));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Newest first, and only days that actually have a register entry — a run of
  // blank future dates would bury the days he came to look at.
  const days = [...(data?.days || [])]
    .filter((d) => d.status || Number(d.earned) > 0)
    .reverse()
    .slice(0, limit);

  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="flex flex-wrap items-center justify-between gap-2 bg-[#C0F28B] px-5 py-3">
        <h2 className="font-bold text-[#14493B]">দিনের হিসাব</h2>
        {/* The old text read "বেতন দিলে কাটা হবে" — everything is pending
            until payday. That stopped being true: days are settled nightly and
            the deduction has already happened on most of this list. */}
        <span className="text-[11px] font-semibold text-[#14493B]/60">
          {Number(data?.settledDays) > 0
            ? `${bn(data.settledDays)} দিন চূড়ান্ত`
            : "হিসাব"}
        </span>
      </div>

      {error ? (
        <p className="px-5 py-4 text-xs font-semibold text-rose-800">{error}</p>
      ) : days.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-[#14493B]/50">
          এই মাসে এখনো কোনো হিসাব নেই।
        </p>
      ) : (
        <ul className="divide-y divide-[#13483B]/8">
          {days.map((d) => {
            const st = STATUS[d.status] || null;
            const Icon = st?.icon;
            const toLoan = Number(d.toLoan || 0);
            const toAdv = Number(d.toAdvance || 0);
            const payable = Number(d.payable || 0);
            const earned = Number(d.earned || 0);
            // SETTLED MEANS THE MONEY ACTUALLY MOVED. An unsettled day is
            // still a forecast and may change if the register is corrected.
            const settled = d.settled === true;
            return (
              <li key={d.date} className="px-5 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[#14493B]">
                      {dayBn(d.date)}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-[#14493B]/55">
                      {st && (
                        <span className={`inline-flex items-center gap-1 ${st.tone}`}>
                          {Icon ? <Icon size={11} /> : null} {st.label}
                        </span>
                      )}
                      {Number(d.kg) > 0 && <span>{bn(Number(d.kg).toFixed(1))} কেজি</span>}
                      {settled ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#14493B]/8 px-1.5 py-px font-semibold text-[#14493B]/70">
                          <LuLock size={9} /> চূড়ান্ত
                        </span>
                      ) : (
                        <span className="font-semibold text-amber-700/80">
                          এখনো চূড়ান্ত হয়নি
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={`text-lg font-extrabold ${
                        payable > 0 ? "text-[#14493B]" : "text-[#14493B]/35"
                      }`}
                    >
                      {taka(payable)}
                    </p>
                    {earned > 0 && payable !== earned && (
                      <p className="text-[11px] text-[#14493B]/45">
                        আয় {taka(earned)}
                      </p>
                    )}
                  </div>
                </div>

                {/* WHERE THE REST WENT. Without this line the worker sees a
                    day he worked paying ৳0 and no reason for it, which is the
                    exact complaint this whole feature answers. */}
                {/* TENSE FOLLOWS THE FACT, NOT THE LAYOUT.
                    "কাটা হয়েছে" (was deducted) only for a settled day, where
                    loan.repaid really has moved. "কাটা হবে" for a day that is
                    still a forecast. Getting this backwards is not cosmetic:
                    the past tense once sent the office hunting for a repayment
                    that was never going to be there, and the future tense now
                    would tell a worker his loan is untouched when it is not. */}
                {(toLoan > 0 || toAdv > 0) && (
                  <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 rounded-lg bg-[#F4FFE9] px-2.5 py-1.5 text-[11px] text-[#14493B]/70">
                    {toAdv > 0 && (
                      <span>
                        অগ্রিম {taka(toAdv)} {settled ? "কাটা হয়েছে" : "কাটা হবে"}
                      </span>
                    )}
                    {toLoan > 0 && (
                      <span>
                        ঋণ {taka(toLoan)} {settled ? "কাটা হয়েছে" : "কাটা হবে"}
                      </span>
                    )}
                  </p>
                )}

                {/* The register was edited after this day was settled, so what
                    was actually deducted no longer matches what today's data
                    says it should have been. The worker must be told, not shown
                    a tidy number that quietly disagrees with his loan balance. */}
                {d.mismatch && (
                  <p className="mt-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-900 ring-1 ring-amber-200">
                    এই দিনের হিসাব চূড়ান্ত হওয়ার পরে তথ্য বদলেছে। চূড়ান্ত হিসাবে
                    কাটা হয়েছিল {taka(d.settledToLoan || 0)} ঋণ ও{" "}
                    {taka(d.settledToAdvance || 0)} অগ্রিম। অফিসে জানান।
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {data && (
        <div className="bg-[#D3FFAC] px-5 py-3">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-[#14493B]/70">
            <span>মোট আয় {taka(data.totalEarned)}</span>
            {Number(data.totalToAdvance) > 0 && (
              <span>অগ্রিম {taka(data.totalToAdvance)}</span>
            )}
            {Number(data.totalToLoan) > 0 && (
              <span>ঋণ {taka(data.totalToLoan)}</span>
            )}
            <span className="font-extrabold text-[#14493B]">
              আপনার {taka(data.totalPayable)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
