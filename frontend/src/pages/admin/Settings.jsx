import { useEffect, useState } from "react";
import {
  LuUser,
  LuLock,
  LuLanguages,
  LuBell,
  LuBuilding2,
  LuCamera,
  LuTrash2,
  LuSave,
  LuShieldCheck,
} from "react-icons/lu";
import api from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { BTN_DARK, BTN_GHOST } from "../../lib/ui";
import { apiError } from "../../lib/apiError";
import InfoTip from "../../components/admin/InfoTip";

const FIELD =
  "mt-1 w-full rounded-lg border border-cg-green/20 bg-cg-lime/30 px-3 py-2 text-sm outline-none focus:border-cg-green";

// Shrinks an image file client-side and returns a small JPEG data URL, so the
// avatar / logo can be stored and shown today without a file-storage service.
// Swap for real object storage later.
function resizeImage(file, max) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// apiError() is imported from ../../lib/apiError (shared, single source of truth).

function Msg({ msg }) {
  if (!msg) return null;
  return (
    <p
      className={`text-sm ${msg.type === "ok" ? "text-cg-green" : "text-red-600"}`}
    >
      {msg.text}
    </p>
  );
}

function Field({ label, ...props }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-cg-ink/80">{label}</span>
      <input className={FIELD} {...props} />
    </label>
  );
}

function SectionCard({ icon: Icon, title, info, children, footer }) {
  return (
    <section className="rounded-2xl bg-white shadow ring-1 ring-cg-green/10">
      <div className="flex items-center gap-3 border-b border-cg-green/10 px-6 py-4">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-cg-lime text-cg-green">
          <Icon size={18} />
        </span>
        <h2 className="flex items-center gap-1 text-base font-extrabold text-cg-ink">
          {title}
          {info && <InfoTip text={info} />}
        </h2>
      </div>
      <div className="p-6">{children}</div>
      {footer && (
        <div className="flex items-center justify-end gap-3 border-t border-cg-green/10 px-6 py-4">
          {footer}
        </div>
      )}
    </section>
  );
}

function Toggle({ checked, onChange, label, desc }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 rounded-lg border border-cg-green/15 bg-cg-lime/20 px-4 py-3 text-left"
    >
      <span>
        <span className="block text-sm font-semibold text-cg-ink">{label}</span>
        {desc && (
          <span className="mt-0.5 block text-xs text-cg-ink/60">{desc}</span>
        )}
      </span>
      <span
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${
          checked ? "bg-cg-green" : "bg-cg-ink/20"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
            checked ? "left-[22px]" : "left-0.5"
          }`}
        />
      </span>
    </button>
  );
}

export default function Settings() {
  const { user, updateUser } = useAuth();
  const isAdmin = user?.role === "admin";

  const [loading, setLoading] = useState(true);

  // Profile
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [locale, setLocale] = useState("en");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState(null);
  const [savingLang, setSavingLang] = useState(false);
  const [langMsg, setLangMsg] = useState(null);

  // Password
  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [savingPw, setSavingPw] = useState(false);
  const [pwMsg, setPwMsg] = useState(null);

  // Notifications
  const [notif, setNotif] = useState({
    notifyBroadcast: true,
    notifyAttendance: true,
    notifyPayroll: true,
  });
  const [savingNotif, setSavingNotif] = useState(false);
  const [notifMsg, setNotifMsg] = useState(null);

  // Estate (admin)
  const [estateName, setEstateName] = useState("");
  const [currency, setCurrency] = useState("৳");
  const [logoUrl, setLogoUrl] = useState("");
  const [savingEstate, setSavingEstate] = useState(false);
  const [estateMsg, setEstateMsg] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await api.get("/me");
        if (!alive) return;
        setDisplayName(data.displayName || "");
        setEmail(data.email || "");
        setPhone(data.phone || "");
        setAvatarUrl(data.avatarUrl || "");
        setLocale(data.locale || "en");
        setNotif({
          notifyBroadcast: data.notifyBroadcast ?? true,
          notifyAttendance: data.notifyAttendance ?? true,
          notifyPayroll: data.notifyPayroll ?? true,
        });
      } catch {
        // ignore — fields stay blank
      }
      if (isAdmin) {
        try {
          const { data } = await api.get("/settings/estate");
          if (!alive) return;
          setEstateName(data.estateName || "");
          setCurrency(data.currency || "৳");
          setLogoUrl(data.logoUrl || "");
        } catch {
          // ignore
        }
      }
      if (alive) setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [isAdmin]);

  const onAvatar = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setAvatarUrl(await resizeImage(file, 256));
    } catch {
      setProfileMsg({ type: "err", text: "Couldn't read that image." });
    }
  };

  const onLogo = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setLogoUrl(await resizeImage(file, 400));
    } catch {
      setEstateMsg({ type: "err", text: "Couldn't read that image." });
    }
  };

  const saveProfile = async () => {
    setSavingProfile(true);
    setProfileMsg(null);
    try {
      await api.put("/me/profile", { displayName, email, phone, avatarUrl });
      updateUser({ displayName, avatarUrl });
      setProfileMsg({ type: "ok", text: "Profile saved." });
    } catch (err) {
      setProfileMsg({
        type: "err",
        text: apiError(err, "Couldn't save your profile."),
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const saveLanguage = async (code) => {
    setLocale(code);
    setSavingLang(true);
    setLangMsg(null);
    try {
      await api.put("/me/profile", { locale: code });
      setLangMsg({ type: "ok", text: "Language preference saved." });
    } catch (err) {
      setLangMsg({
        type: "err",
        text: apiError(err, "Couldn't save language."),
      });
    } finally {
      setSavingLang(false);
    }
  };

  const savePassword = async () => {
    setPwMsg(null);
    if (newPw.length < 6) {
      setPwMsg({
        type: "err",
        text: "New password must be at least 6 characters.",
      });
      return;
    }
    if (newPw !== confirmPw) {
      setPwMsg({
        type: "err",
        text: "New password and confirmation don't match.",
      });
      return;
    }
    setSavingPw(true);
    try {
      await api.post("/me/password", {
        currentPassword: curPw,
        newPassword: newPw,
      });
      setPwMsg({ type: "ok", text: "Password changed." });
      setCurPw("");
      setNewPw("");
      setConfirmPw("");
    } catch (err) {
      setPwMsg({
        type: "err",
        text: apiError(
          err,
          "Couldn't change password — check your current password.",
        ),
      });
    } finally {
      setSavingPw(false);
    }
  };

  const saveNotifications = async () => {
    setSavingNotif(true);
    setNotifMsg(null);
    try {
      await api.put("/me/notifications", notif);
      setNotifMsg({ type: "ok", text: "Notification preferences saved." });
    } catch (err) {
      setNotifMsg({
        type: "err",
        text: apiError(err, "Couldn't save preferences."),
      });
    } finally {
      setSavingNotif(false);
    }
  };

  const saveEstate = async () => {
    setSavingEstate(true);
    setEstateMsg(null);
    try {
      await api.put("/settings/estate", { estateName, currency, logoUrl });
      setEstateMsg({ type: "ok", text: "Estate settings saved." });
    } catch (err) {
      setEstateMsg({
        type: "err",
        text: apiError(err, "Couldn't save estate settings."),
      });
    } finally {
      setSavingEstate(false);
    }
  };

  const initials = (displayName || user?.username || "A")
    .trim()
    .slice(0, 2)
    .toUpperCase();

  if (loading) {
    return (
      <div className="rounded-2xl bg-white p-10 text-center text-sm text-cg-ink/60 shadow ring-1 ring-cg-green/10">
        Loading your settings…
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      {/* Profile */}
      <SectionCard
        icon={LuUser}
        title="My Profile"
        info="Your personal details. Your name and photo represent you across the console."
        footer={
          <>
            <Msg msg={profileMsg} />
            <button
              className={BTN_DARK}
              onClick={saveProfile}
              disabled={savingProfile}
            >
              <LuSave size={16} /> {savingProfile ? "Saving…" : "Save profile"}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-6 sm:flex-row">
          <div className="flex flex-col items-center gap-3">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt="avatar"
                className="h-28 w-28 rounded-full object-cover ring-2 ring-cg-green/20"
              />
            ) : (
              <span className="grid h-28 w-28 place-items-center rounded-full bg-cg-dark text-2xl font-bold text-white">
                {initials}
              </span>
            )}
            <div className="flex gap-2">
              <label className={`${BTN_GHOST} cursor-pointer`}>
                <LuCamera size={16} /> Upload
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={onAvatar}
                />
              </label>
              {avatarUrl && (
                <button className={BTN_GHOST} onClick={() => setAvatarUrl("")}>
                  <LuTrash2 size={16} /> Remove
                </button>
              )}
            </div>
            <p className="text-center text-xs text-cg-ink/50">
              JPG or PNG. Resized automatically.
            </p>
          </div>
          <div className="grid flex-1 gap-3">
            <Field
              label="Display name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Faiyaz Jarif"
            />
            <Field
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@estate.com"
            />
            <Field
              label="Phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+8801…"
            />
            <p className="text-xs text-cg-ink/50">
              Signed in as <b>{user?.username}</b> · role <b>{user?.role}</b>
            </p>
          </div>
        </div>
      </SectionCard>

      {/* Language */}
      <SectionCard
        icon={LuLanguages}
        title="Language & region"
        info="Choose the language for your console. Times are shown in the estate's timezone."
        footer={<Msg msg={langMsg} />}
      >
        <div className="flex flex-wrap gap-3">
          {[
            { code: "en", label: "English" },
            { code: "bn", label: "বাংলা" },
          ].map((l) => (
            <button
              key={l.code}
              type="button"
              disabled={savingLang}
              onClick={() => saveLanguage(l.code)}
              className={`rounded-lg border px-4 py-2 text-sm font-semibold transition ${
                locale === l.code
                  ? "border-cg-green bg-cg-green text-white"
                  : "border-cg-green/20 bg-cg-lime/30 text-cg-ink hover:bg-cg-lime"
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-cg-ink/50">
          Timezone: Asia/Dhaka (GMT+6) · fixed for this estate.
        </p>
      </SectionCard>

      {/* Security */}
      <SectionCard
        icon={LuShieldCheck}
        title="Security"
        info="Change your password. You'll need your current password to confirm it's you."
        footer={
          <>
            <Msg msg={pwMsg} />
            <button
              className={BTN_DARK}
              onClick={savePassword}
              disabled={savingPw}
            >
              <LuLock size={16} /> {savingPw ? "Saving…" : "Change password"}
            </button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Field
            label="Current password"
            type="password"
            value={curPw}
            onChange={(e) => setCurPw(e.target.value)}
          />
          <Field
            label="New password"
            type="password"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
          />
          <Field
            label="Confirm new"
            type="password"
            value={confirmPw}
            onChange={(e) => setConfirmPw(e.target.value)}
          />
        </div>
      </SectionCard>

      {/* Notifications */}
      <SectionCard
        icon={LuBell}
        title="Notifications"
        info="Pick which in-app alerts you receive. Turning one off hides its live notifications."
        footer={
          <>
            <Msg msg={notifMsg} />
            <button
              className={BTN_DARK}
              onClick={saveNotifications}
              disabled={savingNotif}
            >
              <LuSave size={16} />{" "}
              {savingNotif ? "Saving…" : "Save preferences"}
            </button>
          </>
        }
      >
        <div className="grid gap-3">
          <Toggle
            checked={notif.notifyBroadcast}
            onChange={(v) => setNotif((n) => ({ ...n, notifyBroadcast: v }))}
            label="Broadcasts & announcements"
            desc="Estate-wide messages from the admin."
          />
          <Toggle
            checked={notif.notifyAttendance}
            onChange={(v) => setNotif((n) => ({ ...n, notifyAttendance: v }))}
            label="Attendance alerts"
            desc="When attendance is submitted or flagged."
          />
          <Toggle
            checked={notif.notifyPayroll}
            onChange={(v) => setNotif((n) => ({ ...n, notifyPayroll: v }))}
            label="Payroll updates"
            desc="Pay run generated, approved or paid."
          />
        </div>
      </SectionCard>

      {/* Estate (admin) */}
      {isAdmin && (
        <SectionCard
          icon={LuBuilding2}
          title="Estate settings"
          info="Workspace-wide identity used across the app: estate name, logo and default currency."
          footer={
            <>
              <Msg msg={estateMsg} />
              <button
                className={BTN_DARK}
                onClick={saveEstate}
                disabled={savingEstate}
              >
                <LuSave size={16} /> {savingEstate ? "Saving…" : "Save estate"}
              </button>
            </>
          }
        >
          <div className="flex flex-col gap-6 sm:flex-row">
            <div className="flex flex-col items-center gap-3">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt="logo"
                  className="h-24 w-24 rounded-xl object-cover ring-2 ring-cg-green/20"
                />
              ) : (
                <span className="grid h-24 w-24 place-items-center rounded-xl bg-cg-lime text-cg-green">
                  <LuBuilding2 size={28} />
                </span>
              )}
              <label className={`${BTN_GHOST} cursor-pointer`}>
                <LuCamera size={16} /> Logo
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={onLogo}
                />
              </label>
            </div>
            <div className="grid flex-1 gap-3">
              <Field
                label="Estate name"
                value={estateName}
                onChange={(e) => setEstateName(e.target.value)}
                placeholder="Cha-Ghor Estate"
              />
              <label className="block sm:max-w-[140px]">
                <span className="text-sm font-semibold text-cg-ink/80">
                  Currency
                </span>
                <input
                  className={FIELD}
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  maxLength={8}
                />
              </label>
              <p className="text-xs text-cg-ink/50">
                Only admins can change these; everyone sees the result.
              </p>
            </div>
          </div>
        </SectionCard>
      )}
    </div>
  );
}
