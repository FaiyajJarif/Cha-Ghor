import { useCallback, useEffect, useRef, useState } from "react";
import { LuInfo, LuCircleCheck, LuClock, LuCircleX, LuTrophy, LuBanknote } from "react-icons/lu";
import WorkerAvatar from "../../components/worker/WorkerAvatar";
import { WS_BASE } from "../../lib/config";
import { closeSocket } from "../../lib/ws";
import api from "../../api/client";
import { apiError } from "../../lib/apiError";

// আমার প্রোফাইল — the worker's own record and their day so far.
//
// TWO PANELS FROM THE MOCKUP ARE DELIBERATELY NOT HERE.
//
//   চেক-ইন সময় / শিফট শেষ — there is no clock-in in this system. Attendance
//   stores a status, optional late minutes, and `markedAt`, which is when the
//   SUPERVISOR marked the register — a different thing entirely. Showing a
//   fixed 08:00 AM would be a number invented by the screen, on the one page a
//   worker is most likely to read closely.
//
//   মাটির অবস্থা (soil moisture) — nothing measures it. The estate records
//   rainfall and humidity, not soil.
//
// What replaced them is real: attendance status with lateness, kilos against
// the configured quota, and the assigned field.

const CARD = "rounded-2xl bg-white shadow ring-1 ring-[#13483B]/10";

const BN = "০১২৩৪৫৬৭৮৯";
const bn = (s) => String(s).replace(/[0-9]/g, (d) => BN[+d]);
const taka = (v) => (v == null ? "—" : "৳" + bn(Number(v).toLocaleString("en-US")));

const MONTHS_BN = [
  "জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন",
  "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর",
];
const dateBn = (iso) => {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  return `${bn(d.getDate())} ${MONTHS_BN[d.getMonth()]} ${bn(d.getFullYear())}`;
};

const GENDER_BN = { male: "পুরুষ", female: "নারী", other: "অন্যান্য" };
const ROLE_BN = { plucker: "পাতা সংগ্রাহক", supervisor: "সুপারভাইজার" };

const ATT = {
  present: { label: "উপস্থিত", icon: LuCircleCheck, tone: "bg-emerald-100 text-emerald-700" },
  late: { label: "দেরিতে এসেছেন", icon: LuClock, tone: "bg-amber-100 text-amber-800" },
  absent: { label: "অনুপস্থিত", icon: LuCircleX, tone: "bg-rose-100 text-rose-700" },
};

function Field({ label, value }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-[#14493B]/50">{label}</p>
      <p className="text-sm font-bold text-[#14493B]">
        {value || <span className="font-normal text-[#14493B]/35">রেকর্ড নেই</span>}
      </p>
    </div>
  );
}

export default function WorkerProfile() {
  const [me, setMe] = useState(null);
  const [today, setToday] = useState(null);
  const [month, setMonth] = useState(null);

  // "Fresh" is 7 days. Chosen, not computed: long enough that a worker who
  // did not open the app the day he was paid still sees it, short enough that
  // it is gone well before the next payslip.
  const paidAt = month?.lastPayment?.paidAt;
  const freshlyPaid =
    !!paidAt && Date.now() - new Date(paidAt).getTime() < 7 * 24 * 60 * 60 * 1000;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const [p, t, m] = await Promise.all([
      api.get("/me/worker"),
      api.get("/me/worker/today").catch(() => ({ data: null })),
      api.get("/me/worker/month").catch(() => ({ data: null })),
    ]);
    setMe(p.data);
    setToday(t.data);
    setMonth(m.data);
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    load()
      .catch((err) => alive && setError(apiError(err, "আপনার তথ্য আনা যায়নি।")))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [load]);

  // Live on payroll.saved, pushed by PayrollService.markPaid.
  //
  // WITHOUT THIS the worker only learns he was paid by reloading on the
  // off-chance: the SMS reaches his phone while the app in his hand keeps
  // showing the old figure. attendance.saved and leaf.saved are here too so
  // today's kilos and the month card move as the supervisor marks the register.
  //
  // loadRef, so this effect subscribes once and never re-subscribes when
  // `load` is re-created — a socket that reconnects on every render is how you
  // get a refetch storm.
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => {
    let retry;
    let closedByUs = false;
    let ws;
    const url =
      (typeof import.meta !== "undefined" &&
        import.meta.env &&
        import.meta.env.VITE_WS_URL) ||
      `${WS_BASE}/ws/notifications`;
    const connect = () => {
      try {
        ws = new WebSocket(url);
      } catch {
        return;
      }
      ws.onmessage = (e) => {
        let kind = "";
        try {
          kind = JSON.parse(e.data)?.kind || "";
        } catch {
          return;
        }
        // Real kinds only, read from their push sites — there is no
        // "payroll.updated" or "worker.saved".
        if (
          (kind === "payroll.saved" ||
            kind === "attendance.saved" ||
            kind === "leaf.saved") &&
          loadRef.current
        ) {
          loadRef.current().catch(() => {});
        }
      };
      ws.onerror = () => ws.close();
      ws.onclose = () => {
        if (!closedByUs) retry = setTimeout(connect, 5000);
      };
    };
    connect();
    return () => {
      closedByUs = true;
      clearTimeout(retry);
      closeSocket(ws);
    };
  }, []);

  if (loading) {
    return (
      <div className="grid h-64 place-items-center text-sm text-[#14493B]/60">
        {"লোড হচ্ছে…"}
      </div>
    );
  }

  if (error) {
    return (
      <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">
        {error}
      </p>
    );
  }

  const name = me?.nameBn || me?.fullName || "—";
  const att = today?.attendance;
  const state = att?.status ? ATT[att.status] : null;
  const pct = Math.min(100, Number(today?.quotaPct ?? 0));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-[#14493B]">স্বাগতম, {name}</h1>
        <p className="text-sm text-[#14493B]/60">
          এখানে আপনার তথ্য ও আজকের কাজের সারসংক্ষেপ দেওয়া হলো
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Personal details */}
        <div className={`${CARD} overflow-hidden lg:col-span-2`}>
          <div className="bg-[#C0F28B] px-5 py-3">
            <h2 className="font-bold text-[#14493B]">ব্যক্তিগত তথ্য</h2>
          </div>
          <div className="flex flex-wrap gap-6 p-5">
            <div className="text-center">
              {/* Was a bare <img src>, which would have 401'd the moment a
                  photo actually existed: attachments are authenticated and an
                  img tag sends no token. It never showed because nothing could
                  upload a photo until now. */}
              <WorkerAvatar
                src={me?.photoUrl}
                name={name}
                size={112}
                className="text-3xl ring-4 ring-[#8FD05A]"
              />
              <p className="mt-3 text-sm font-extrabold text-[#14493B]">{name}</p>
              <p className="text-xs text-[#14493B]/55">কর্মী আইডি: {me?.code}</p>
            </div>

            <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-6 gap-y-4">
              <Field label="পূর্ণ নাম" value={me?.fullName} />
              <Field label="কর্মীর ধরন" value={ROLE_BN[me?.jobRole] || me?.jobRole} />
              <Field label="লিঙ্গ" value={GENDER_BN[me?.gender]} />
              <Field label="জন্ম তারিখ" value={me?.dob ? dateBn(me.dob) : null} />
              <Field label="যোগাযোগ নম্বর" value={me?.phone ? bn(me.phone) : null} />
              <Field label="যোগদানের তারিখ" value={me?.joinDate ? dateBn(me.joinDate) : null} />
              <Field label="দৈনিক মজুরি" value={taka(me?.dailyWage)} />
              <Field label="সুপারভাইজার" value={me?.supervisorName} />
            </div>
          </div>
        </div>

        {/* Assigned field */}
        <div className={`${CARD} overflow-hidden`}>
          <div className="bg-[#C0F28B] px-5 py-3">
            <h2 className="font-bold text-[#14493B]">নির্ধারিত ক্ষেত্র</h2>
          </div>
          <div className="p-5">
            <p className="text-xl font-extrabold text-[#14493B]">
              {me?.zoneName || (
                <span className="text-base font-normal text-[#14493B]/45">
                  এখনো কোনো ক্ষেত্র নির্ধারিত হয়নি
                </span>
              )}
            </p>
            {me?.supervisorName && (
              <p className="mt-1 text-xs text-[#14493B]/55">
                সুপারভাইজার: {me.supervisorName}
              </p>
            )}
            <p className="mt-4 flex items-start gap-2 text-[11px] text-[#14493B]/45">
              <LuInfo size={13} className="mt-0.5 shrink-0" />
              ক্ষেত্র বদলাতে হলে আপনার সুপারভাইজারকে জানান।
            </p>
          </div>
        </div>
      </div>

      {/* This month, and the last time they were actually paid.
          Replaces the mockup's compliance card — PPE %, safety score,
          "450 accident-free days" — none of which any table records. Every
          figure below comes from the same registers the payslip is built from,
          so it can be checked against the wages screen and will agree. */}
      <div className="grid gap-5 lg:grid-cols-3">
        <div className={`${CARD} overflow-hidden lg:col-span-2`}>
          <div className="flex flex-wrap items-center justify-between gap-2 bg-[#C0F28B] px-5 py-3">
            <h2 className="font-bold text-[#14493B]">এই মাসে আপনি</h2>
            <span className="text-xs font-semibold text-[#14493B]/70">
              {MONTHS_BN[new Date().getMonth()]}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
            <div>
              <p className="text-[11px] font-semibold text-[#14493B]/50">কাজ করেছেন</p>
              <p className="text-2xl font-extrabold text-[#14493B]">
                {bn(month?.workedDays ?? 0)}{" "}
                <span className="text-sm font-bold text-[#14493B]/45">দিন</span>
              </p>
              {month?.lateDays > 0 && (
                <p className="text-[11px] text-amber-700">
                  {bn(month.lateDays)} দিন দেরিতে
                </p>
              )}
            </div>
            <div>
              <p className="text-[11px] font-semibold text-[#14493B]/50">মোট পাতা</p>
              <p className="text-2xl font-extrabold text-[#14493B]">
                {bn(Number(month?.totalKg ?? 0).toFixed(1))}{" "}
                <span className="text-sm font-bold text-[#14493B]/45">কেজি</span>
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold text-[#14493B]/50">দিনে গড়ে</p>
              <p className="text-2xl font-extrabold text-[#14493B]">
                {bn(Number(month?.avgKgPerPickingDay ?? 0).toFixed(1))}{" "}
                <span className="text-sm font-bold text-[#14493B]/45">কেজি</span>
              </p>
              {/* Per day picked, not per calendar day — dividing by the month
                  would make someone who worked three weeks look lazy. */}
              <p className="text-[11px] text-[#14493B]/40">যেদিন পাতা তুলেছেন</p>
            </div>
            <div>
              <p className="flex items-center gap-1 text-[11px] font-semibold text-[#14493B]/50">
                <LuTrophy size={11} /> সেরা দিন
              </p>
              {month?.bestKg ? (
                <>
                  <p className="text-2xl font-extrabold text-emerald-700">
                    {bn(Number(month.bestKg).toFixed(1))}{" "}
                    <span className="text-sm font-bold text-emerald-700/50">কেজি</span>
                  </p>
                  <p className="text-[11px] text-[#14493B]/40">{dateBn(month.bestDay)}</p>
                </>
              ) : (
                <p className="mt-1 text-sm text-[#14493B]/35">এখনো নেই</p>
              )}
            </div>
          </div>
        </div>

        {/* Last payment.
            FRESH (within 7 days) it is the loud "বেতন এসেছে" card; after that
            it settles back into the quiet version. A celebration that never
            goes away stops meaning anything, and a worker paid every month
            would otherwise see it permanently. */}
        <div
          className={`${CARD} overflow-hidden ${
            freshlyPaid ? "ring-2 ring-emerald-600" : ""
          }`}
        >
          <div
            className={`px-5 py-3 ${
              freshlyPaid ? "bg-emerald-600" : "bg-[#C0F28B]"
            }`}
          >
            <h2
              className={`flex items-center gap-2 font-bold ${
                freshlyPaid ? "text-white" : "text-[#14493B]"
              }`}
            >
              {freshlyPaid && <LuCircleCheck size={17} />}
              {freshlyPaid ? "বেতন এসেছে" : "সর্বশেষ পরিশোধ"}
            </h2>
          </div>
          <div className="p-5">
            {month?.lastPayment ? (
              <>
                <p className="text-3xl font-extrabold text-[#14493B]">
                  {taka(month.lastPayment.amount)}
                </p>
                <p className="mt-1 text-xs text-[#14493B]/55">
                  {dateBn(month.lastPayment.paidAt)} তারিখে দেওয়া হয়েছে
                </p>
                <p className="mt-3 flex items-start gap-2 rounded-xl bg-[#F4FFE9] px-3 py-2 text-[11px] text-[#14493B]/65">
                  <LuBanknote size={13} className="mt-0.5 shrink-0" />
                  কীভাবে এই হিসাব হলো দেখতে &ldquo;বেতন ও ঋণ&rdquo; পাতায় যান।
                </p>
              </>
            ) : (
              /* Not "৳0". A worker who has not been paid yet and a worker paid
                 nothing are different situations. */
              <p className="text-sm text-[#14493B]/50">
                এখনো কোনো বেতন পরিশোধ হয়নি।
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Today */}
      <div className={`${CARD} overflow-hidden`}>
        <div className="flex flex-wrap items-center justify-between gap-2 bg-[#C0F28B] px-5 py-3">
          <h2 className="font-bold text-[#14493B]">আজকের কাজ</h2>
          <span className="text-xs font-semibold text-[#14493B]/70">
            {dateBn(today?.date)}
          </span>
        </div>
        <div className="grid gap-5 p-5 sm:grid-cols-2">
          <div>
            <p className="text-[11px] font-semibold text-[#14493B]/50">হাজিরা</p>
            {!att?.marked ? (
              <p className="mt-1 text-sm text-[#14493B]/50">
                আপনার সুপারভাইজার এখনো আজকের হাজিরা দেননি।
              </p>
            ) : (
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
                    state?.tone || "bg-slate-100 text-slate-600"
                  }`}
                >
                  {state?.icon ? <state.icon size={13} /> : null}
                  {state?.label || att.status}
                </span>
                {att.lateMinutes ? (
                  <span className="text-xs text-[#14493B]/55">
                    {bn(att.lateMinutes)} মিনিট দেরি
                  </span>
                ) : null}
              </div>
            )}
            {/* Named honestly: the register was marked, which is not the same as
                a clock-in — this system has none. */}
            <p className="mt-2 text-[10px] text-[#14493B]/40">
              হাজিরা সুপারভাইজার খাতায় তোলেন। এখানে আসা-যাওয়ার সময় রাখা হয় না।
            </p>
          </div>

          <div>
            <p className="text-[11px] font-semibold text-[#14493B]/50">আজকের পাতা</p>
            <p className="mt-1 text-2xl font-extrabold text-[#14493B]">
              {bn(Number(today?.leafKgToday ?? 0).toFixed(1))}{" "}
              <span className="text-sm font-bold text-[#14493B]/45">
                / {bn(Number(today?.quotaKg ?? 0).toFixed(0))} কেজি
              </span>
            </p>
            <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-[#E8F8D8]">
              <div
                className="h-full rounded-full bg-[#14493B] transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-[#14493B]/55">
              {pct >= 100
                ? "কোটা পূরণ হয়েছে — এর বেশি পাতার জন্য বাড়তি মজুরি পাবেন।"
                : `কোটার ${bn(pct)}% হয়েছে।`}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
