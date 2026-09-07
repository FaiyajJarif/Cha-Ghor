import { useCallback, useEffect, useState } from "react";
import { LuTrendingUp, LuTrendingDown, LuInfo } from "react-icons/lu";
import api from "../../api/client";

// কেন বেতন বদলালো — why this month differs from last month.
//
// THE QUESTION THAT ACTUALLY STARTS ARGUMENTS. The wage breakdown above proves
// WHAT a worker was paid. It does not answer "why is it less than last month",
// which is the thing someone walks to the office about.
//
// EVERY FIGURE IS ARITHMETIC over two payroll rows — no model is involved in
// producing any number here. The components sum EXACTLY to the net difference;
// the server computes `reconciles` as a check on its own arithmetic, and this
// panel renders NOTHING when it is false. An explanation that does not add up
// is worse than no explanation: it invites trust and then collapses the moment
// somebody checks, which is the opposite of what this product is for.
//
// The seven keys below are the complete set emitted by MeWorkerService — the
// six wage lines plus `unrecovered`, which is money that was owed but could not
// be deducted because net floors at zero. Leaving that one out made an earlier
// version overstate a fall by ৳2,300.

const CARD = "rounded-2xl bg-white shadow ring-1 ring-[#13483B]/10";

const BN = "০১২৩৪৫৬৭৮৯";
const bn = (s) => String(s).replace(/[0-9]/g, (d) => BN[+d]);
const signedTaka = (n) => {
  const v = Number(n || 0);
  const abs = Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 0 });
  return `${v < 0 ? "−" : "+"} ৳${bn(abs)}`;
};

// Bangla for each key, and a plain reason a non-reader can follow when it is
// read to them. No jargon: "advanceRecovery" means nothing to anybody.
const LABEL = {
  base: {
    up: "বেশি দিন কাজ করেছেন",
    down: "কম দিন কাজ করেছেন",
    why: "হাজিরার দিন বদলেছে",
  },
  surplus: {
    up: "বেশি পাতা তুলেছেন",
    down: "কম পাতা তুলেছেন",
    why: "কোটার বেশি পাতার জন্য বাড়তি টাকা",
  },
  gradeBonus: {
    up: "ভালো মানের পাতা বেশি",
    down: "ভালো মানের পাতা কম",
    why: "এ-গ্রেড পাতার বোনাস",
  },
  loanDeduction: {
    up: "ঋণ কম কাটা হয়েছে",
    down: "ঋণ বেশি কাটা হয়েছে",
    why: "ঋণের কিস্তি",
  },
  advanceRecovery: {
    up: "অগ্রিম কম কাটা হয়েছে",
    down: "অগ্রিম বেশি কাটা হয়েছে",
    why: "আগে নেওয়া অগ্রিম সমন্বয়",
  },
  otherDeduction: {
    up: "অন্য কর্তন কম",
    down: "অন্য কর্তন বেশি",
    why: "অন্যান্য কর্তন",
  },
  unrecovered: {
    up: "বাকি থেকে যাওয়া কর্তন কমেছে",
    down: "কিছু কর্তন নেওয়া যায়নি",
    why: "বেতন কম হওয়ায় পুরো কর্তন নেওয়া যায়নি — বাকিটা ঋণেই থেকে গেছে",
  },
};

export default function PayChangePanel() {
  const [data, setData] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/me/worker/pay-change");
      setData(data);
    } catch {
      // Silent. This panel is an extra explanation on a page that already
      // renders the wage breakdown — it must never be the reason the wages
      // screen shows an error.
      setData(null);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!data?.available) {
    // First month on the estate, or no previous period. Say so rather than
    // rendering an empty box.
    return data?.unavailableReason ? (
      <div className={`${CARD} p-5`}>
        <h2 className="font-bold text-[#14493B]">কেন বেতন বদলালো</h2>
        <p className="mt-1 text-sm text-[#14493B]/55">
          আগের মাসের হিসাব না থাকায় তুলনা করা যাচ্ছে না।
        </p>
      </div>
    ) : null;
  }

  // The server checks its own arithmetic. If the parts do not sum to the
  // difference, show nothing at all.
  if (!data.reconciles) return null;

  const diff = Number(data.netDifference || 0);
  const better = diff >= 0;
  const Icon = better ? LuTrendingUp : LuTrendingDown;

  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="bg-[#C0F28B] px-5 py-3">
        <h2 className="font-bold text-[#14493B]">কেন বেতন বদলালো</h2>
      </div>

      <div className="p-5">
        <div
          className={`flex items-center gap-2 text-2xl font-extrabold ${
            better ? "text-emerald-700" : "text-rose-700"
          }`}
        >
          <Icon size={22} />
          {signedTaka(diff)}
        </div>
        <p className="mt-0.5 text-xs text-[#14493B]/55">
          গত মাসের তুলনায়
        </p>

        <ul className="mt-4 space-y-2">
          {(data.components || []).map((c) => {
            const amt = Number(c.amount || 0);
            const up = amt >= 0;
            const l = LABEL[c.key];
            return (
              <li
                key={c.key}
                className="flex items-start justify-between gap-3 rounded-xl bg-[#F4FFE9] px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[#14493B]">
                    {l ? (up ? l.up : l.down) : c.key}
                  </p>
                  {/* The measurement behind the claim, so it can be checked
                      against the breakdown above rather than believed. */}
                  <p className="mt-0.5 text-[11px] text-[#14493B]/55">
                    {l?.why}
                    {c.fromValue && c.toValue
                      ? ` · ${bn(c.fromValue)} → ${bn(c.toValue)}`
                      : ""}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-sm font-extrabold tabular-nums ${
                    up ? "text-emerald-700" : "text-rose-700"
                  }`}
                >
                  {signedTaka(amt)}
                </span>
              </li>
            );
          })}
        </ul>

        <p className="mt-3 flex items-start gap-2 text-[11px] text-[#14493B]/50">
          <LuInfo size={13} className="mt-0.5 shrink-0" />
          উপরের সব যোগ করলে ঠিক {signedTaka(diff)} হয়। মিল না হলে এই অংশ দেখানো
          হয় না।
        </p>
      </div>
    </div>
  );
}
