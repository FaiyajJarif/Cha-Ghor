import { useCallback, useEffect, useRef, useState } from "react";
import {
  LuLock,
  LuBell,
  LuPhone,
  LuCircleCheck,
  LuInfo,
  LuEye,
  LuEyeOff,
  LuCamera,
} from "react-icons/lu";
import api from "../../api/client";
import WorkerAvatar from "../../components/worker/WorkerAvatar";
import { apiError } from "../../lib/apiError";

// সেটিংস — the two things a worker can actually change about their account.
//
// WHAT IS DELIBERATELY NOT HERE, AND WHY
//
//   Phone number. It is shown, but read-only. The wage SMS is sent to
//   `workers.phone` (SmsService.dispatch), NOT `users.phone` -- so a field
//   wired to PUT /me/profile would edit a column nothing reads and silently
//   fail to move a single message. Beyond that, letting an account redirect
//   its own wage notifications is a real fraud route on an estate where phones
//   are shared and a supervisor may be holding one. The office changes it.
//
//   Language. The whole worker console is Bangla. A selector with one option
//   is furniture.
//
//   Name, field, daily wage, join date. Estate records, maintained by the
//   office. A worker editing their own wage is not a setting.
//
// WHAT IS HERE IS REAL. Both controls hit endpoints that existed and worked;
// the notification toggles additionally required SmsService to start READING
// the preferences, which nothing did until now -- they were written by the
// settings screen and consulted by nobody for the whole life of the project.

const CARD = "rounded-2xl bg-white shadow ring-1 ring-[#13483B]/10";

const BN = "০১২৩৪৫৬৭৮৯";
const bn = (s) => String(s).replace(/[0-9]/g, (d) => BN[+d]);

function Toggle({ on, onChange, label, hint, disabled }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      disabled={disabled}
      aria-pressed={on}
      className="flex w-full items-start justify-between gap-4 rounded-xl bg-[#F4FFE9] px-4 py-3 text-left transition hover:bg-[#E8F8D8] disabled:opacity-50"
    >
      <span className="min-w-0">
        <span className="block text-sm font-bold text-[#14493B]">{label}</span>
        <span className="mt-0.5 block text-[11px] leading-relaxed text-[#14493B]/55">
          {hint}
        </span>
      </span>
      <span
        className={`mt-0.5 grid h-7 w-12 shrink-0 items-center rounded-full px-1 transition ${
          on ? "bg-emerald-600" : "bg-[#13483B]/20"
        }`}
      >
        <span
          className={`h-5 w-5 rounded-full bg-white transition ${
            on ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </span>
    </button>
  );
}

export default function WorkerSettings() {
  const [me, setMe] = useState(null);
  const [worker, setWorker] = useState(null);
  const [loading, setLoading] = useState(true);

  const [notif, setNotif] = useState(null);
  const [savingNotif, setSavingNotif] = useState(false);
  const [notifDone, setNotifDone] = useState(false);

  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoErr, setPhotoErr] = useState("");
  const fileRef = useRef(null);

  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [show, setShow] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);
  const [pwErr, setPwErr] = useState("");
  const [pwDone, setPwDone] = useState(false);

  const load = useCallback(async () => {
    const [u, w] = await Promise.all([
      api.get("/me"),
      api.get("/me/worker").catch(() => ({ data: null })),
    ]);
    setMe(u.data);
    setWorker(w.data);
    setNotif({
      // Default TRUE when absent, matching the column defaults in V3.
      notifyPayroll: u.data?.notifyPayroll !== false,
      notifyBroadcast: u.data?.notifyBroadcast !== false,
      notifyAttendance: u.data?.notifyAttendance !== false,
    });
  }, []);

  useEffect(() => {
    load()
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [load]);

  const saveNotif = async (patch) => {
    const merged = { ...notif, ...patch };
    setNotif(merged);
    setSavingNotif(true);
    setNotifDone(false);
    try {
      // The endpoint takes all three; sending a partial body would reset the
      // two that were not touched to false.
      await api.put("/me/notifications", {
        notifyBroadcast: merged.notifyBroadcast,
        notifyAttendance: merged.notifyAttendance,
        notifyPayroll: merged.notifyPayroll,
      });
      setNotifDone(true);
    } catch {
      // Put the switch back where it was rather than leaving it showing a
      // state the server does not have.
      setNotif(notif);
    } finally {
      setSavingNotif(false);
    }
  };

  const uploadPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // so the same file can be picked again after an error
    if (!file) return;
    // Checked here for an instant answer; CaseAttachmentService enforces it
    // again server-side, along with the magic-byte check.
    if (file.size > 10 * 1024 * 1024) {
      setPhotoErr("ছবিটি অনেক বড়। ছোট ছবি দিন।");
      return;
    }
    setPhotoBusy(true);
    setPhotoErr("");
    try {
      const form = new FormData();
      form.append("file", file);
      await api.post("/me/worker/photo", form);
      await load();
    } catch (err) {
      setPhotoErr(apiError(err, "ছবি সেভ করা যায়নি।"));
    } finally {
      setPhotoBusy(false);
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    setPwErr("");
    setPwDone(false);
    if (next.length < 6) {
      setPwErr("নতুন পাসওয়ার্ড অন্তত ৬ অক্ষরের হতে হবে।");
      return;
    }
    if (next !== again) {
      setPwErr("দুইবার একই নতুন পাসওয়ার্ড লিখুন।");
      return;
    }
    setPwBusy(true);
    try {
      await api.post("/me/password", {
        currentPassword: cur,
        newPassword: next,
      });
      setPwDone(true);
      setCur("");
      setNext("");
      setAgain("");
    } catch (err) {
      setPwErr(apiError(err, "পাসওয়ার্ড বদলানো যায়নি।"));
    } finally {
      setPwBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="grid h-64 place-items-center text-sm text-[#14493B]/60">
        {"লোড হচ্ছে…"}
      </div>
    );
  }

  const FIELD =
    "mt-1 w-full rounded-xl border border-[#13483B]/25 bg-white px-4 py-3 text-sm text-[#14493B] outline-none focus:border-[#14493B]";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-[#14493B]">সেটিংস</h1>
        <p className="text-sm text-[#14493B]/60">
          পাসওয়ার্ড বদলান, আর কোন খবর মোবাইলে পাবেন সেটি ঠিক করুন
        </p>
      </div>

      {/* Account, read-only. Shown so the worker can check the office has the
          right details, and knows who to tell when it is wrong. */}
      <div className={`${CARD} overflow-hidden`}>
        <div className="bg-[#C0F28B] px-5 py-3">
          <h2 className="font-bold text-[#14493B]">আপনার তথ্য</h2>
        </div>
        {/* Photo. The FIRST upload in this product: workers.photo_url has
            existed since V1 and the admin form's photo control is a local
            preview that never uploaded anything, so every avatar everywhere
            fell back to an initial. */}
        <div className="flex flex-wrap items-center gap-4 border-b border-[#13483B]/8 p-5">
          <WorkerAvatar
            src={worker?.photoUrl}
            name={worker?.nameBn || worker?.fullName}
            size={72}
            className="text-2xl ring-2 ring-[#8FD05A]"
          />
          <div className="min-w-0">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={uploadPhoto}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={photoBusy}
              className="inline-flex items-center gap-2 rounded-xl bg-[#14493B] px-4 py-2.5 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-45"
            >
              <LuCamera size={15} />
              {photoBusy
                ? "সেভ হচ্ছে…"
                : worker?.photoUrl
                  ? "ছবি বদলান"
                  : "ছবি যোগ করুন"}
            </button>
            <p className="mt-1 text-[11px] text-[#14493B]/50">
              আপনার ছবি শুধু আপনি ও অফিস দেখতে পাবে।
            </p>
            {photoErr && (
              <p className="mt-1 text-[11px] font-semibold text-rose-700">
                {photoErr}
              </p>
            )}
          </div>
        </div>

        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <div>
            <p className="text-[11px] font-semibold text-[#14493B]/50">নাম</p>
            <p className="text-sm font-bold text-[#14493B]">
              {worker?.nameBn || worker?.fullName || me?.displayName || "—"}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-[#14493B]/50">কর্মী আইডি</p>
            <p className="text-sm font-bold text-[#14493B]">{worker?.code || "—"}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-[#14493B]/50">ক্ষেত্র</p>
            <p className="text-sm font-bold text-[#14493B]">
              {worker?.zoneName || "—"}
            </p>
          </div>
          <div>
            <p className="flex items-center gap-1 text-[11px] font-semibold text-[#14493B]/50">
              <LuPhone size={11} /> মোবাইল নম্বর
            </p>
            <p className="text-sm font-bold text-[#14493B]">
              {worker?.phone ? bn(worker.phone) : "—"}
            </p>
          </div>
        </div>
        <div className="bg-[#D3FFAC] px-5 py-3">
          <p className="flex items-start gap-2 text-[11px] text-[#14493B]/70">
            <LuInfo size={13} className="mt-0.5 shrink-0" />
            নাম, ক্ষেত্র বা মোবাইল নম্বর বদলাতে অফিসে জানান। বেতনের খুদে বার্তা
            এই নম্বরেই যায়।
          </p>
        </div>
      </div>

      {/* Notifications */}
      <div className={`${CARD} overflow-hidden`}>
        <div className="flex flex-wrap items-center justify-between gap-2 bg-[#C0F28B] px-5 py-3">
          <h2 className="flex items-center gap-2 font-bold text-[#14493B]">
            <LuBell size={16} /> খুদে বার্তা
          </h2>
          {notifDone && !savingNotif && (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#14493B]/70">
              <LuCircleCheck size={12} /> সেভ হয়েছে
            </span>
          )}
        </div>
        <div className="space-y-2 p-5">
          <Toggle
            on={!!notif?.notifyPayroll}
            disabled={savingNotif}
            onChange={(v) => saveNotif({ notifyPayroll: v })}
            label="বেতন ও টাকার খবর"
            hint="বেতন পরিশোধ, অগ্রিম ও ঋণের সিদ্ধান্ত মোবাইলে জানানো হবে।"
          />
          <Toggle
            on={!!notif?.notifyBroadcast}
            disabled={savingNotif}
            onChange={(v) => saveNotif({ notifyBroadcast: v })}
            label="জরুরি ঘোষণা"
            hint="আবহাওয়া বা কাজ সংক্রান্ত জরুরি খবর সুপারভাইজার পাঠালে।"
          />
          {/* notify_attendance is NOT offered. Nothing in this system sends an
              attendance SMS -- SmsCategory has payroll, loan, withdrawal and
              alert, and no attendance. A switch for a message that does not
              exist is a control that cannot do anything. */}
          <p className="flex items-start gap-2 pt-1 text-[11px] text-[#14493B]/50">
            <LuInfo size={13} className="mt-0.5 shrink-0" />
            বন্ধ করলে অ্যাপে সব দেখতে পাবেন, শুধু মোবাইলে বার্তা যাবে না।
          </p>
        </div>
      </div>

      {/* Password */}
      <form onSubmit={changePassword} className={`${CARD} overflow-hidden`}>
        <div className="bg-[#C0F28B] px-5 py-3">
          <h2 className="flex items-center gap-2 font-bold text-[#14493B]">
            <LuLock size={16} /> পাসওয়ার্ড বদলান
          </h2>
        </div>
        <div className="p-5">
          {pwDone && (
            <p className="mb-3 flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-900 ring-1 ring-emerald-200">
              <LuCircleCheck size={16} /> পাসওয়ার্ড বদলে গেছে।
            </p>
          )}
          {pwErr && (
            <p className="mb-3 rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
              {pwErr}
            </p>
          )}

          <label className="block text-xs font-bold text-[#14493B]/60">
            এখনকার পাসওয়ার্ড
            <input
              type={show ? "text" : "password"}
              value={cur}
              onChange={(e) => setCur(e.target.value)}
              autoComplete="current-password"
              className={FIELD}
            />
          </label>
          <label className="mt-3 block text-xs font-bold text-[#14493B]/60">
            নতুন পাসওয়ার্ড
            <input
              type={show ? "text" : "password"}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
              className={FIELD}
            />
          </label>
          <label className="mt-3 block text-xs font-bold text-[#14493B]/60">
            আবার লিখুন
            <input
              type={show ? "text" : "password"}
              value={again}
              onChange={(e) => setAgain(e.target.value)}
              autoComplete="new-password"
              className={FIELD}
            />
          </label>

          {/* A show/hide control, not a strength meter. Someone typing a new
              password on a phone outdoors needs to see what they typed far
              more than they need to be graded on it. */}
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-bold text-[#14493B]/60"
          >
            {show ? <LuEyeOff size={13} /> : <LuEye size={13} />}
            {show ? "লুকান" : "দেখুন"}
          </button>

          <button
            type="submit"
            disabled={pwBusy || !cur || !next || !again}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#14493B] px-6 py-3.5 text-base font-extrabold text-white transition hover:brightness-110 disabled:opacity-40"
          >
            {pwBusy ? "সেভ হচ্ছে…" : "পাসওয়ার্ড বদলান"}
          </button>
        </div>
      </form>
    </div>
  );
}
