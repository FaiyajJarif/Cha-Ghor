import { useCallback, useEffect, useState } from "react";
import { LuWallet, LuHandCoins, LuTriangleAlert, LuInfo } from "react-icons/lu";
import api from "../../api/client";
import { apiError } from "../../lib/apiError";
import TakeMoneyModal from "./TakeMoneyModal";

// টাকা — the three things a worker can do with money, kept apart on purpose.
//
// ============================================================================
// THESE ARE NOT THREE VERSIONS OF THE SAME BUTTON
// ============================================================================
//
//   বেতন তোলা   money he has ALREADY EARNED. Not a debt. Nothing is recovered,
//               because there is nothing to recover -- he worked for it.
//
//   অগ্রিম       money against days NOT YET WORKED. Repaid by being paid
//               NOTHING AT ALL until it clears. At ৳170 a day, a ৳500 advance
//               is three days with no income.
//
//   ঋণ          a loan. Repaid a fixed amount each working day, so he keeps
//               the remainder and is never left with nothing.
//
// An earlier draft of this screen had one button labelled "বিকাশে অগ্রিম চান"
// sitting next to a withdrawable balance, which invited a worker to take on a
// debt while believing he was drawing his own wages. Whatever else changes
// here, the first two must never share a control or a colour.
//
// The cost of an advance is stated BEFORE the button, not after it. "You will
// be paid nothing for about 3 days" is the single fact that decides whether
// this is a useful facility or the thing that sends someone to a moneylender.

const CARD = "rounded-2xl bg-white shadow ring-1 ring-[#13483B]/10";

const BN = "০১২৩৪৫৬৭৮৯";
const bn = (s) => String(s).replace(/[0-9]/g, (d) => BN[+d]);
const taka = (n) =>
  `৳ ${bn(Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 }))}`;

export default function MoneyActions({ onChanged }) {
  const [limits, setLimits] = useState(null);
  const [error, setError] = useState("");
  const [mode, setMode] = useState(null); // "salary" | "advance"

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/me/worker/limits");
      setLimits(data);
      setError("");
    } catch (err) {
      setError(apiError(err, "টাকার হিসাব আনা যায়নি।"));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const withdrawable = Number(limits?.withdrawable || 0);
  const advAvailable = Number(limits?.advanceAvailable || 0);
  const advOwed = Number(limits?.advanceOutstanding || 0);
  const avgDay = Number(limits?.averageDailyEarning || 0);

  // How many days of no pay a full advance would cost, from HIS OWN average
  // earning, not a guessed wage. Null when there is no history yet — an
  // invented number here would be a promise nobody checked.
  const noPayDays =
    avgDay > 0 && advAvailable > 0 ? Math.ceil(advAvailable / avgDay) : null;

  // How many more working days the CURRENT debt needs. Null when there is no
  // earning history to base it on — an invented figure is worse than none.
  const owedDays = avgDay > 0 && advOwed > 0 ? Math.ceil(advOwed / avgDay) : null;

  return (
    <>
      <div className={`${CARD} overflow-hidden`}>
        <div className="bg-[#C0F28B] px-5 py-3">
          <h2 className="font-bold text-[#14493B]">টাকা</h2>
        </div>

        <div className="p-5">
          {error && (
            <p className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">
              {error}
            </p>
          )}

          {/* 1. HIS OWN MONEY. Stated first, and stated as his. */}
          <p className="text-[11px] font-semibold text-[#14493B]/50">
            আপনার জমা টাকা
          </p>
          <p className="text-3xl font-extrabold text-[#14493B]">
            {taka(withdrawable)}
          </p>
          <p className="mt-1 text-xs text-[#14493B]/55">
            এই মাসে কাজ করে জমেছে। এটি আপনার টাকা — ফেরত দিতে হবে না।
          </p>

          <button
            type="button"
            onClick={() => setMode("salary")}
            disabled={withdrawable <= 0}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#14493B] px-6 py-4 text-base font-extrabold text-white transition hover:brightness-110 disabled:opacity-40"
          >
            <LuWallet size={19} /> বেতন তুলুন
          </button>
          {withdrawable <= 0 && (
            /* Says WHY it is off. A dead button with no explanation reads as a
               broken app, and this one is off for a good reason. */
            <p className="mt-1.5 text-[11px] text-[#14493B]/45">
              এখন তোলার মতো জমা নেই। কাজ করলে জমা হবে।
            </p>
          )}

          <div className="my-4 border-t border-dashed border-[#13483B]/15" />

          {/* 2. BORROWING. Visually separated, different weight, and the cost
                 spelled out above the control rather than after it. */}
          <p className="text-[11px] font-semibold text-[#14493B]/50">
            টাকা ধার
          </p>

          {advOwed > 0 ? (
            /* THE REMAINING BALANCE, from the same computation the day list
               uses. It used to read the raw payout amount while the day list
               had already recovered part of it — the card said ৳500 owed and
               the days said ৳190 left, on the same screen. Both now come from
               DailyLedgerService.ledger(), so they cannot disagree. */
            <div className="mt-1 rounded-xl bg-amber-50 px-3 py-2.5 ring-1 ring-amber-200">
              <p className="flex items-center gap-1.5 text-sm font-bold text-amber-900">
                <LuTriangleAlert size={14} /> অগ্রিম বাকি {taka(advOwed)}
              </p>
              <p className="mt-0.5 text-[11px] text-amber-800">
                এটি শোধ না হওয়া পর্যন্ত আপনার দৈনিক আয় থেকে পুরোটা কেটে নেওয়া
                হবে — এই সময়ে কোনো বেতন পাবেন না।
              </p>
              {owedDays ? (
                /* Working days at HIS average, not calendar days: a day he does
                   not work deducts nothing, so a date would be a promise the
                   system cannot keep. */
                <p className="mt-1 text-[11px] font-bold text-amber-900">
                  আর প্রায় {bn(owedDays)} দিন কাজ করলে শোধ হয়ে যাবে।
                </p>
              ) : null}
            </div>
          ) : null}

          {advAvailable > 0 && (
            <p className="mt-2 flex items-start gap-1.5 rounded-xl bg-[#F4FFE9] px-3 py-2 text-[11px] leading-relaxed text-[#14493B]/70">
              <LuInfo size={13} className="mt-0.5 shrink-0" />
              <span>
                অগ্রিম নিলে পুরো টাকা শোধ না হওয়া পর্যন্ত আপনি কোনো বেতন পাবেন
                না।
                {noPayDays
                  ? ` সর্বোচ্চ ${bn(noPayDays)} দিন কোনো টাকা পাবেন না।`
                  : ""}
              </span>
            </p>
          )}

          <button
            type="button"
            onClick={() => setMode("advance")}
            disabled={advAvailable <= 0}
            className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-6 py-3.5 text-base font-extrabold text-[#14493B] ring-2 ring-[#14493B]/25 transition hover:bg-[#F4FFE9] disabled:opacity-40"
          >
            <LuHandCoins size={18} /> অগ্রিম চান
            {advAvailable > 0 && (
              <span className="text-xs font-bold text-[#14493B]/55">
                সর্বোচ্চ {taka(advAvailable)}
              </span>
            )}
          </button>
          {advAvailable <= 0 && (
            <p className="mt-1.5 text-[11px] text-[#14493B]/45">
              {advOwed > 0
                ? "আগের অগ্রিম শোধ হলে আবার নিতে পারবেন।"
                : "এখন অগ্রিম দেওয়া বন্ধ আছে।"}
            </p>
          )}
        </div>
      </div>

      <TakeMoneyModal
        open={!!mode}
        kind={mode}
        max={mode === "salary" ? withdrawable : advAvailable}
        avgDailyEarning={avgDay}
        onClose={() => setMode(null)}
        onDone={() => {
          setMode(null);
          load();
          onChanged?.();
        }}
      />
    </>
  );
}
