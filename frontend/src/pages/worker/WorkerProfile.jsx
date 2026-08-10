import { useCallback, useEffect, useState } from "react";
import { LuInfo, LuCircleCheck, LuClock, LuCircleX } from "react-icons/lu";
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const [p, t] = await Promise.all([
      api.get("/me/worker"),
      api.get("/me/worker/today").catch(() => ({ data: null })),
    ]);
    setMe(p.data);
    setToday(t.data);
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
              {me?.photoUrl ? (
                <img
                  src={me.photoUrl.replace(/^\/api\/v1/, "")}
                  alt=""
                  className="h-28 w-28 rounded-full object-cover ring-4 ring-[#8FD05A]"
                />
              ) : (
                <span className="grid h-28 w-28 place-items-center rounded-full bg-[#14493B] text-3xl font-extrabold text-white">
                  {name.slice(0, 1)}
                </span>
              )}
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
