import { useCallback, useEffect, useRef, useState } from "react";
import {
  LuLock,
  LuBell,
  LuCamera,
  LuCircleCheck,
  LuInfo,
  LuEye,
  LuEyeOff,
} from "react-icons/lu";
import api from "../../api/client";
import { apiError } from "../../lib/apiError";
import { useAuth } from "../../context/AuthContext";
import UserAvatar from "../../components/UserAvatar";
import { BTN_DARK } from "../../lib/ui";

// Settings — the supervisor's own account.
//
// A SUPERVISOR IS NOT A WORKER ROW, and that decides what belongs here.
//   The seeded supervisor is referenced BY worker rows as `supervisor_id`; they
//   have no `workers` row of their own. So `workers.phone`, `workers.photo_url`
//   and the whole /me/worker tier do not apply. Their name, email, phone and
//   avatar live on `users`, which is what PUT /me/profile edits.
//
// THE SMS TOGGLES ARE CONDITIONAL, on purpose.
//   SmsService.dispatch resolves a phone from a WORKER id. An account with no
//   worker row never receives an SMS, so showing it a switch that claims to
//   control one would be a control that cannot do anything — the exact fault
//   just fixed on the worker screen, where these preferences had been written
//   and read by nobody for the life of the project. The toggles appear only
//   when this account is actually linked to a worker.
//
// Estate-wide settings (estate name, currency, wage rates, borrowing limits)
// are NOT here. Those are admin's, and a supervisor editing the daily wage is
// not a preference.

const CARD = "rounded-2xl bg-white p-5 shadow ring-1 ring-cg-green/10";
const FIELD =
  "mt-1 w-full rounded-lg border border-cg-green/20 bg-cg-lime/30 px-3 py-2 text-sm outline-none focus:border-cg-green";

function Toggle({ on, onChange, label, hint, disabled }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      disabled={disabled}
      aria-pressed={on}
      className="flex w-full items-start justify-between gap-4 rounded-xl bg-cg-lime/30 px-4 py-3 text-left transition hover:bg-cg-lime/50 disabled:opacity-50"
    >
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-cg-ink">{label}</span>
        <span className="mt-0.5 block text-xs text-cg-ink/55">{hint}</span>
      </span>
      <span
        className={`mt-0.5 grid h-6 w-11 shrink-0 items-center rounded-full px-1 transition ${
          on ? "bg-cg-green" : "bg-cg-ink/20"
        }`}
      >
        <span
          className={`h-4 w-4 rounded-full bg-white transition ${
            on ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </span>
    </button>
  );
}

export default function SupervisorSettings() {
  const { updateUser } = useAuth();
  const [me, setMe] = useState(null);
  const [linkedWorker, setLinkedWorker] = useState(null);
  const [loading, setLoading] = useState(true);

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileErr, setProfileErr] = useState("");
  const [profileDone, setProfileDone] = useState(false);

  const [notif, setNotif] = useState(null);
  const [savingNotif, setSavingNotif] = useState(false);

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
      // 404 here is the ORDINARY case for a supervisor: it means no worker row,
      // which is what decides whether the SMS toggles are shown at all.
      api.get("/me/worker").catch(() => ({ data: null })),
    ]);
    setMe(u.data);
    setLinkedWorker(w.data);
    setDisplayName(u.data?.displayName || "");
    setEmail(u.data?.email || "");
    setPhone(u.data?.phone || "");
    setNotif({
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

  const saveProfile = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileErr("");
    setProfileDone(false);
    try {
      const { data } = await api.put("/me/profile", { displayName, email, phone });
      // Keep the header in step; it reads displayName from auth context, not
      // from this page.
      updateUser?.({ displayName: data?.displayName });
      setProfileDone(true);
    } catch (err) {
      setProfileErr(apiError(err, "Could not save your profile."));
    } finally {
      setSavingProfile(false);
    }
  };

  const saveNotif = async (patch) => {
    const merged = { ...notif, ...patch };
    setNotif(merged);
    setSavingNotif(true);
    try {
      // All three, always: a partial body resets the untouched two to false.
      await api.put("/me/notifications", merged);
    } catch {
      setNotif(notif);
    } finally {
      setSavingNotif(false);
    }
  };

  const uploadPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setPhotoErr("That image is larger than 10MB.");
      return;
    }
    setPhotoBusy(true);
    setPhotoErr("");
    try {
      const form = new FormData();
      form.append("file", file);
      const { data } = await api.post("/me/avatar", form);
      updateUser?.({ avatarUrl: data?.avatarUrl });
      await load();
    } catch (err) {
      setPhotoErr(apiError(err, "Could not save that image."));
    } finally {
      setPhotoBusy(false);
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    setPwErr("");
    setPwDone(false);
    if (next.length < 6) {
      setPwErr("The new password must be at least 6 characters.");
      return;
    }
    if (next !== again) {
      setPwErr("The two new passwords do not match.");
      return;
    }
    setPwBusy(true);
    try {
      await api.post("/me/password", { currentPassword: cur, newPassword: next });
      setPwDone(true);
      setCur("");
      setNext("");
      setAgain("");
    } catch (err) {
      setPwErr(apiError(err, "Could not change your password."));
    } finally {
      setPwBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="grid h-64 place-items-center text-sm text-cg-ink/60">
        {"Loading…"}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-cg-ink">Settings</h1>
        <p className="text-sm text-cg-ink/60">
          Your own account. Estate-wide rates and limits are set by the office.
        </p>
      </div>

      {/* Profile */}
      <form onSubmit={saveProfile} className={CARD}>
        <div className="mb-4 flex flex-wrap items-center gap-4">
          <UserAvatar src={me?.avatarUrl} name={displayName || me?.username} size={64} />
          <div>
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
              className={BTN_DARK}
            >
              <LuCamera size={15} />
              {photoBusy ? "Saving…" : me?.avatarUrl ? "Change photo" : "Add photo"}
            </button>
            {photoErr && (
              <p className="mt-1 text-xs text-red-700">{photoErr}</p>
            )}
          </div>
        </div>

        <h2 className="text-base font-extrabold text-cg-ink">Your details</h2>
        {profileErr && (
          <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {profileErr}
          </p>
        )}
        {profileDone && (
          <p className="mt-2 flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
            <LuCircleCheck size={15} /> Saved
          </p>
        )}
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="text-sm font-semibold text-cg-ink/70">
            Display name
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className={FIELD}
            />
          </label>
          <label className="text-sm font-semibold text-cg-ink/70">
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={FIELD}
            />
          </label>
          <label className="text-sm font-semibold text-cg-ink/70">
            Phone
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={FIELD}
            />
          </label>
        </div>
        <button type="submit" className={BTN_DARK + " mt-4"} disabled={savingProfile}>
          {savingProfile ? "Saving…" : "Save changes"}
        </button>
      </form>

      {/* Notifications — only when this account can actually receive an SMS. */}
      <div className={CARD}>
        <h2 className="flex items-center gap-2 text-base font-extrabold text-cg-ink">
          <LuBell size={16} /> SMS notifications
        </h2>
        {linkedWorker ? (
          <div className="mt-3 space-y-2">
            <Toggle
              on={!!notif?.notifyPayroll}
              disabled={savingNotif}
              onChange={(v) => saveNotif({ notifyPayroll: v })}
              label="Pay and money"
              hint="Salary paid, advance and loan decisions."
            />
            <Toggle
              on={!!notif?.notifyBroadcast}
              disabled={savingNotif}
              onChange={(v) => saveNotif({ notifyBroadcast: v })}
              label="Urgent broadcasts"
              hint="Weather and work alerts sent to the estate."
            />
          </div>
        ) : (
          /* Said plainly rather than showing switches that move and do nothing.
             SmsService.dispatch looks a phone up from a WORKER id; an account
             with no worker row is never a recipient. */
          <p className="mt-2 flex items-start gap-2 text-sm text-cg-ink/60">
            <LuInfo size={15} className="mt-0.5 shrink-0" />
            This account is not linked to a worker record, so it does not receive
            estate SMS. In-app notifications still appear in the bell.
          </p>
        )}
      </div>

      {/* Password */}
      <form onSubmit={changePassword} className={CARD}>
        <h2 className="flex items-center gap-2 text-base font-extrabold text-cg-ink">
          <LuLock size={16} /> Change password
        </h2>
        {pwDone && (
          <p className="mt-2 flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
            <LuCircleCheck size={15} /> Password changed
          </p>
        )}
        {pwErr && (
          <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {pwErr}
          </p>
        )}
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="text-sm font-semibold text-cg-ink/70">
            Current password
            <input
              type={show ? "text" : "password"}
              value={cur}
              onChange={(e) => setCur(e.target.value)}
              autoComplete="current-password"
              className={FIELD}
            />
          </label>
          <label className="text-sm font-semibold text-cg-ink/70">
            New password
            <input
              type={show ? "text" : "password"}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
              className={FIELD}
            />
          </label>
          <label className="text-sm font-semibold text-cg-ink/70">
            Confirm new
            <input
              type={show ? "text" : "password"}
              value={again}
              onChange={(e) => setAgain(e.target.value)}
              autoComplete="new-password"
              className={FIELD}
            />
          </label>
        </div>
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-cg-ink/60"
        >
          {show ? <LuEyeOff size={13} /> : <LuEye size={13} />}
          {show ? "Hide" : "Show"}
        </button>
        <div>
          <button
            type="submit"
            className={BTN_DARK + " mt-3"}
            disabled={pwBusy || !cur || !next || !again}
          >
            {pwBusy ? "Saving…" : "Change password"}
          </button>
        </div>
      </form>
    </div>
  );
}
