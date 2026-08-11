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
  LuUserPlus,
  LuUserCheck,
  LuCheck,
  LuX,
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

  // ---- pending account requests (admin only) ---------------------------
  //
  // Workers and supervisors can request an account themselves; nothing is
  // granted until someone here accepts it. Until this queue existed the
  // requests had nowhere to land, which is the same as not having the feature.
  const [pending, setPending] = useState([]);
  const [deciding, setDeciding] = useState(null);
  const [queueMsg, setQueueMsg] = useState(null);
  const [issuedPin, setIssuedPin] = useState(null);

  const loadPending = async () => {
    try {
      const { data } = await api.get("/auth/pending");
      setPending(Array.isArray(data) ? data : []);
    } catch {
      // A failure here must not blank the rest of Settings.
      setPending([]);
    }
  };

  useEffect(() => {
    if (isAdmin) loadPending();
  }, [isAdmin]);

  // Which worker record each pending WORKER request will be attached to.
  // Keyed by request id. "" means none chosen yet, "new" means create one.
  const [linkChoice, setLinkChoice] = useState({});

  const decideAccount = async (id, action, name, role) => {
    let reason = null;
    let body = {};
    if (action === "reject") {
      // Asked for, not required: an unexplained rejection is one the office
      // cannot answer for when the person asks why.
      reason = window.prompt(`Why is ${name}'s request being turned down?`) || "";
      body = { reason };
    } else if (role === "worker") {
      // THE ADMIN PICKS. The server used to match on name and two workers can
      // share one, so a coin flip decided whose wages the login could see.
      const choice = linkChoice[id];
      if (!choice) {
        setQueueMsg({
          ok: false,
          text: `Choose which worker record ${name} is, or create a new one. Their pay depends on it.`,
        });
        return;
      }
      body = choice === "new" ? { createWorker: true } : { workerId: Number(choice) };
    }
    setDeciding(id);
    setQueueMsg(null);
    try {
      const { data } = await api.post(`/auth/pending/${id}/${action}`, body);
      // THE PIN IS SHOWN ONCE AND NEVER AGAIN. It is BCrypt-hashed server-side,
      // so nothing can recover it later — if this message is dismissed before
      // the admin writes it down, a new PIN has to be issued.
      if (action === "approve" && data?.pin) {
        setIssuedPin({ name, pin: String(data.pin) });
      }
      setQueueMsg({
        ok: true,
        text:
          action === "approve"
            ? `${name} can now sign in.`
            : `${name}'s request was turned down.`,
      });
      await loadPending();
    } catch (err) {
      setQueueMsg({ ok: false, text: apiError(err, "Could not save that decision.") });
    } finally {
      setDeciding(null);
    }
  };

  // ---- staff accounts (admin only) ------------------------------------
  //
  // Account creation lives HERE, behind an admin session, because
  // POST /auth/register is admin-only by design: an account on a payroll
  // system is how a person gets paid, so the office decides who has one.
  // The public /register page could never have worked -- it would have hit
  // 403 on every submit -- and it now points people at the office instead.
  //
  // Workers get their login from Workforce, where the login is created
  // alongside the worker record. This form is for admin and supervisor staff.
  const [acct, setAcct] = useState({
    username: "",
    email: "",
    password: "",
    confirm: "",
    role: "supervisor",
  });
  const [creating, setCreating] = useState(false);
  const [acctMsg, setAcctMsg] = useState(null);

  const createAccount = async (e) => {
    e.preventDefault();
    setAcctMsg(null);
    if (acct.password !== acct.confirm) {
      setAcctMsg({ ok: false, text: "The two passwords do not match." });
      return;
    }
    if (acct.password.length < 8) {
      setAcctMsg({ ok: false, text: "Password must be at least 8 characters." });
      return;
    }
    setCreating(true);
    try {
      const { data } = await api.post("/auth/register", {
        username: acct.username.trim(),
        email: acct.email.trim() || null,
        password: acct.password,
        role: acct.role,
      });
      setAcctMsg({
        ok: true,
        text: `Created ${data.username} as ${data.role}. Give them the password directly — it is not shown again.`,
      });
      setAcct({ username: "", email: "", password: "", confirm: "", role: "supervisor" });
    } catch (err) {
      setAcctMsg({ ok: false, text: apiError(err, "Could not create the account.") });
    } finally {
      setCreating(false);
    }
  };

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

      {isAdmin && (
        <SectionCard
          icon={LuUserCheck}
          title={`Account requests${pending.length ? ` (${pending.length})` : ""}`}
          info="People who have asked for an account from the sign-up page. Nothing is granted until you accept it — a pending account cannot sign in. Approving a worker also creates or links their Workforce record so payroll can see them."
        >
          {pending.length === 0 ? (
            <p className="rounded-xl bg-cg-lime/20 px-4 py-6 text-center text-sm text-cg-ink/55">
              No one is waiting for an account.
            </p>
          ) : (
            <ul className="divide-y divide-cg-green/10">
              {pending.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-cg-ink">
                      {p.displayName || p.username}
                      <span className="ml-2 rounded-full bg-cg-lime/60 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-cg-green">
                        {p.role}
                      </span>
                    </p>
                    <p className="text-xs text-cg-ink/55">
                      @{p.username}
                      {p.phone ? " · " + p.phone : ""}
                      {p.email ? " · " + p.email : ""}
                    </p>
                    {p.requestedAt && (
                      <p className="text-[11px] text-cg-ink/40">
                        asked {String(p.requestedAt).slice(0, 10)}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {p.role === "worker" && (
                      <label className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-cg-ink/60">
                          Is
                        </span>
                        <select
                          className="rounded-lg border border-cg-green/20 bg-white px-2 py-1.5 text-sm text-cg-ink"
                          value={linkChoice[p.id] || ""}
                          onChange={(e) =>
                            setLinkChoice((c) => ({ ...c, [p.id]: e.target.value }))
                          }
                        >
                          <option value="">Choose worker record…</option>
                          {/* Zone and phone are shown because two people can
                              share a name — the name alone is not enough to
                              tell whose wages this login will see. */}
                          {(p.candidates || []).map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.fullName}
                              {c.zoneName ? ` · ${c.zoneName}` : ""}
                              {c.phone ? ` · ${c.phone}` : ""}
                              {c.nameMatches ? " (same name)" : ""}
                            </option>
                          ))}
                          <option value="new">＋ Create a new worker record</option>
                        </select>
                      </label>
                    )}
                    <button
                      onClick={() =>
                        decideAccount(p.id, "approve", p.displayName || p.username, p.role)
                      }
                      className={BTN_DARK}
                      disabled={deciding === p.id}
                    >
                      <LuCheck size={15} /> Approve
                    </button>
                    <button
                      onClick={() =>
                        decideAccount(p.id, "reject", p.displayName || p.username, p.role)
                      }
                      className={BTN_GHOST}
                      disabled={deciding === p.id}
                    >
                      <LuX size={15} /> Reject
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {issuedPin && (
            <div className="mt-3 rounded-xl bg-amber-50 p-4 ring-1 ring-amber-300">
              <p className="text-sm font-bold text-amber-900">
                {issuedPin.name}&rsquo;s sign-in PIN
              </p>
              <p className="my-2 text-center text-4xl font-extrabold tracking-[0.4em] text-amber-900">
                {issuedPin.pin}
              </p>
              <p className="text-xs leading-relaxed text-amber-800">
                Write this down and give it to them now. It is stored encrypted
                and <strong>cannot be looked up again</strong> — if it is lost, a
                new PIN has to be issued. They sign in with their mobile number
                and these four digits.
              </p>
              <button
                onClick={() => setIssuedPin(null)}
                className={`${BTN_GHOST} mt-3`}
              >
                I have written it down
              </button>
            </div>
          )}
          {queueMsg && (
            <p
              className={`mt-3 rounded-lg px-3 py-2 text-sm ${
                queueMsg.ok ? "bg-cg-lime/30 text-cg-ink/80" : "bg-red-50 text-red-700"
              }`}
            >
              {queueMsg.text}
            </p>
          )}
        </SectionCard>
      )}

      {isAdmin && (
        <SectionCard
          icon={LuUserPlus}
          title="Staff accounts"
          info="Create admin and supervisor logins. Worker logins are created in Workforce, alongside the worker record. There is no public sign-up: an account is how someone gets paid, so the office decides who has one."
          footer={
            <button
              type="submit"
              form="staff-account-form"
              className={BTN_DARK}
              disabled={creating}
            >
              {creating ? "Creating…" : "Create account"}
            </button>
          }
        >
          <form id="staff-account-form" onSubmit={createAccount} className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Username"
              value={acct.username}
              onChange={(e) => setAcct((a) => ({ ...a, username: e.target.value }))}
              placeholder="rahim.uddin"
              autoComplete="off"
              required
            />
            <label className="block">
              <span className="text-sm font-semibold text-cg-ink/80">Role</span>
              <select
                className={FIELD}
                value={acct.role}
                onChange={(e) => setAcct((a) => ({ ...a, role: e.target.value }))}
              >
                <option value="supervisor">Supervisor</option>
                <option value="admin">Admin</option>
              </select>
            </label>
            <Field
              label="Email (optional)"
              type="email"
              value={acct.email}
              onChange={(e) => setAcct((a) => ({ ...a, email: e.target.value }))}
              placeholder="name@example.com"
              autoComplete="off"
            />
            <div />
            <Field
              label="Password"
              type="password"
              value={acct.password}
              onChange={(e) => setAcct((a) => ({ ...a, password: e.target.value }))}
              placeholder="At least 8 characters"
              autoComplete="new-password"
              required
            />
            <Field
              label="Confirm password"
              type="password"
              value={acct.confirm}
              onChange={(e) => setAcct((a) => ({ ...a, confirm: e.target.value }))}
              autoComplete="new-password"
              required
            />
            {/* Said plainly, because the alternative is an admin assuming the
                system will email it. Nothing here sends anything. */}
            <p className="sm:col-span-2 text-xs text-cg-ink/55">
              The password is not emailed or shown again. Hand it over directly and
              ask them to change it in Settings after their first sign-in.
            </p>
            {acctMsg && (
              <p
                className={`sm:col-span-2 rounded-lg px-3 py-2 text-sm ${
                  acctMsg.ok
                    ? "bg-cg-lime/30 text-cg-ink/80"
                    : "bg-red-50 text-red-700"
                }`}
              >
                {acctMsg.text}
              </p>
            )}
          </form>
        </SectionCard>
      )}
    </div>
  );
}
