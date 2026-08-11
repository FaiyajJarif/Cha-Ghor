import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  LuLeaf,
  LuUser,
  LuBadgeCheck,
  LuMail,
  LuLock,
  LuEye,
  LuEyeOff,
  LuCircleCheck,
} from "react-icons/lu";
import api from "../api/client";
import { apiError } from "../lib/apiError";

const bg = { backgroundImage: "linear-gradient(160deg, #16281c, #24422e)" };
const labelCls = "text-xs font-semibold uppercase tracking-wide text-cg-bright";
const inputCls =
  "w-full rounded-lg bg-white/10 py-3 pl-10 pr-4 text-sm text-white placeholder-white/40 outline-none ring-1 ring-white/15 transition focus:ring-cg-bright";
const iconCls =
  "pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40";

// WORKERS SEE BANGLA. Everyone else sees English.
//
// The entire worker console is already Bangla, so a worker meeting this form
// in English hits the one English screen in their whole experience of the
// app — at the moment they are least able to ask for help, and about the
// thing that decides whether they get paid.
//
// Supervisors and admins work in English elsewhere in the product, so the
// screen follows whichever role is being requested.
const T = {
  en: {
    title: "Request an account",
    notice:
      "The estate office approves every account. You will be able to sign in once someone there has accepted your request — not straight away.",
    fullName: "Full name",
    username: "Username",
    iAm: "I am a",
    worker: "Worker",
    supervisor: "Supervisor",
    phone: "Mobile number",
    phoneHint: "10 digits after +880",
    email: "Email (optional)",
    password: "Password",
    passwordHint:
      "At least 8 characters, with a capital letter, a number and a symbol (! # @)",
    confirm: "Confirm password",
    submit: "Send request",
    sending: "Sending…",
    mismatch: "The two passwords do not match.",
    weak:
      "Password needs at least 8 characters, one capital letter, one number and one symbol such as ! # or @.",
    badPhone: "Enter the 10 digits after +880, for example 1712345678.",
    failed: "Could not send your request. Please try again.",
    sentTitle: "Request sent",
    sentBody:
      "The estate office has your request. Someone there will review it and approve your account.",
    sentWait:
      "You will not be able to sign in until then. If it is taking a while, speak to your supervisor or the office.",
    backToLogin: "Back to sign in",
    haveAccount: "Already have an account?",
    signIn: "Sign in",
  },
  bn: {
    title: "অ্যাকাউন্টের জন্য আবেদন",
    notice:
      "প্রতিটি অ্যাকাউন্ট অফিস থেকে অনুমোদন করা হয়। অফিস আপনার আবেদন গ্রহণ করলে তবেই আপনি ঢুকতে পারবেন — সঙ্গে সঙ্গে নয়।",
    fullName: "পুরো নাম",
    username: "ইউজারনেম",
    iAm: "আমি একজন",
    worker: "শ্রমিক",
    supervisor: "সুপারভাইজার",
    phone: "মোবাইল নম্বর",
    phoneHint: "+৮৮০ এর পরের ১০ সংখ্যা",
    email: "ইমেইল (না দিলেও চলবে)",
    password: "পাসওয়ার্ড",
    passwordHint:
      "কমপক্ষে ৮ অক্ষর, একটি বড় হাতের অক্ষর, একটি সংখ্যা ও একটি চিহ্ন (! # @)",
    confirm: "পাসওয়ার্ড আবার লিখুন",
    submit: "আবেদন পাঠান",
    sending: "পাঠানো হচ্ছে…",
    mismatch: "দুটি পাসওয়ার্ড এক হয়নি।",
    weak:
      "পাসওয়ার্ডে কমপক্ষে ৮ অক্ষর, একটি বড় হাতের অক্ষর, একটি সংখ্যা এবং একটি চিহ্ন (! # @) থাকতে হবে।",
    badPhone: "+৮৮০ এর পরের ১০ সংখ্যা লিখুন, যেমন ১৭১২৩৪৫৬৭৮।",
    failed: "আবেদন পাঠানো যায়নি। আবার চেষ্টা করুন।",
    sentTitle: "আবেদন পাঠানো হয়েছে",
    sentBody:
      "অফিসে আপনার আবেদন পৌঁছেছে। তারা দেখে আপনার অ্যাকাউন্ট অনুমোদন করবে।",
    sentWait:
      "তার আগে আপনি ঢুকতে পারবেন না। দেরি হলে আপনার সুপারভাইজার বা অফিসে কথা বলুন।",
    backToLogin: "লগইনে ফিরুন",
    haveAccount: "আগে থেকেই অ্যাকাউন্ট আছে?",
    signIn: "লগইন করুন",
  },
};

// Mirrors the server rule in SignupRequest exactly. Checked here too so the
// worker is told before a round-trip, never INSTEAD of the server checking.
const STRONG = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,72}$/;

export default function Register() {
  const [params] = useSearchParams();
  const [form, setForm] = useState({
    fullName: "",
    username: "",
    email: "",
    phone: "",
    role: params.get("role") === "supervisor" ? "supervisor" : "worker",
    password: "",
    confirm: "",
  });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const t = form.role === "worker" ? T.bn : T.en;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // +880 IS PART OF THE FURNITURE, NOT SOMETHING TO TYPE.
  //
  // Every worker on this estate has a Bangladeshi number, so asking each one to
  // type the country code is asking for "01712...", "8801712...", "+88 01712"
  // and a validation error nobody understands. The prefix is printed inside the
  // field and only the 10 digits are editable.
  const setPhone = (e) => {
    let digits = e.target.value.replace(/\D/g, "");
    // People here know their number as 01712345678 and will type it that way,
    // leading zero and all, straight after a printed +880. Left alone that
    // becomes +8800171234567 and a rejection they cannot make sense of.
    // Same for anyone who types the country code again.
    if (digits.startsWith("880")) digits = digits.slice(3);
    if (digits.startsWith("0")) digits = digits.slice(1);
    setForm((f) => ({ ...f, phone: digits.slice(0, 10) }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (form.password !== form.confirm) {
      setError(t.mismatch);
      return;
    }
    if (!STRONG.test(form.password)) {
      setError(t.weak);
      return;
    }
    if (form.phone && form.phone.length !== 10) {
      setError(t.badPhone);
      return;
    }
    setBusy(true);
    try {
      await api.post("/auth/signup", {
        fullName: form.fullName.trim(),
        username: form.username.trim(),
        email: form.email.trim(),
        // Reassembled here so the server still receives full E.164.
        phone: form.phone ? "+880" + form.phone : "",
        password: form.password,
        role: form.role,
      });
      setSent(true);
    } catch (err) {
      // A duplicate username or email now comes back as a readable 409 rather
      // than a silent 202 that left the applicant waiting for an approval that
      // was never coming.
      setError(apiError(err, t.failed));
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <main className="grid min-h-screen place-items-center px-4 py-10" style={bg}>
        <div className="w-full max-w-md text-center text-white">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-cg-green/30 text-3xl text-cg-bright">
            <LuCircleCheck />
          </span>
          <h1 className="mt-4 text-2xl font-extrabold">{t.sentTitle}</h1>
          <div className="mt-6 rounded-3xl bg-white/5 p-8 text-left ring-1 ring-white/10">
            <p className="text-sm leading-relaxed text-white/75">{t.sentBody}</p>
            <p className="mt-3 text-sm leading-relaxed text-white/60">{t.sentWait}</p>
            <Link
              to={`/login${form.role === "worker" ? "?role=worker" : ""}`}
              className="mt-6 block w-full rounded-lg bg-cg-bright py-3 text-center text-sm font-bold text-[#16281c] transition hover:brightness-110"
            >
              {t.backToLogin}
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10" style={bg}>
      <div className="w-full max-w-lg">
        <div className="text-center text-white">
          <Link
            to="/"
            aria-label="Back to home"
            className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-cg-green/30 text-2xl text-cg-bright transition-transform hover:-translate-y-0.5"
          >
            <LuLeaf />
          </Link>
          <h1 className="mt-3 text-2xl font-extrabold">{t.title}</h1>
          <p className="text-xs uppercase tracking-widest text-white/60">
            Cha Ghor — চা ঘর
          </p>
        </div>

        <form
          onSubmit={submit}
          className="mt-6 rounded-3xl bg-white/5 p-8 text-white ring-1 ring-white/10"
        >
          <p className="mb-5 rounded-lg bg-cg-green/20 px-4 py-3 text-xs leading-relaxed text-white/75">
            {t.notice}
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className={labelCls}>{t.fullName}</span>
              <div className="relative mt-1">
                <LuUser className={iconCls} size={16} />
                <input
                  className={inputCls}
                  value={form.fullName}
                  onChange={set("fullName")}
                  placeholder="আব্দুল করিম"
                  required
                />
              </div>
            </label>

            <label className="block">
              <span className={labelCls}>{t.username}</span>
              <div className="relative mt-1">
                <LuBadgeCheck className={iconCls} size={16} />
                <input
                  className={inputCls}
                  value={form.username}
                  onChange={set("username")}
                  placeholder="abdul.karim"
                  autoComplete="off"
                  required
                />
              </div>
            </label>

            <label className="block">
              <span className={labelCls}>{t.iAm}</span>
              {/* Worker and supervisor only. Admin is neither offered here nor
                  accepted by the server. */}
              <select
                className="mt-1 w-full rounded-lg bg-white/10 px-4 py-3 text-sm text-white outline-none ring-1 ring-white/15 focus:ring-cg-bright"
                value={form.role}
                onChange={set("role")}
              >
                <option className="text-cg-ink" value="worker">
                  {t.worker}
                </option>
                <option className="text-cg-ink" value="supervisor">
                  {t.supervisor}
                </option>
              </select>
            </label>

            <label className="block sm:col-span-2">
              <span className={labelCls}>{t.phone}</span>
              <div className="mt-1 flex overflow-hidden rounded-lg bg-white/10 ring-1 ring-white/15 focus-within:ring-cg-bright">
                {/* Static. Not an input, so it cannot be edited, deleted or
                    duplicated into "+880+880". */}
                <span className="grid shrink-0 place-items-center border-r border-white/15 bg-white/5 px-3 text-sm font-semibold text-white/70">
                  +880
                </span>
                <input
                  className="w-full bg-transparent px-4 py-3 text-sm text-white placeholder-white/40 outline-none"
                  value={form.phone}
                  onChange={setPhone}
                  placeholder="1712345678"
                  inputMode="numeric"
                />
              </div>
              <span className="mt-1 block text-[11px] text-white/45">
                {t.phoneHint}
              </span>
            </label>

            <label className="block sm:col-span-2">
              <span className={labelCls}>{t.email}</span>
              <div className="relative mt-1">
                <LuMail className={iconCls} size={16} />
                <input
                  type="email"
                  className={inputCls}
                  value={form.email}
                  onChange={set("email")}
                  placeholder="name@example.com"
                />
              </div>
            </label>

            <label className="block sm:col-span-2">
              <span className={labelCls}>{t.password}</span>
              <div className="relative mt-1">
                <LuLock className={iconCls} size={16} />
                <input
                  type={show ? "text" : "password"}
                  className={inputCls}
                  value={form.password}
                  onChange={set("password")}
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
                  aria-label={show ? "Hide password" : "Show password"}
                >
                  {show ? <LuEyeOff size={16} /> : <LuEye size={16} />}
                </button>
              </div>
              <span className="mt-1 block text-[11px] text-white/45">
                {t.passwordHint}
              </span>
            </label>

            <label className="block sm:col-span-2">
              <span className={labelCls}>{t.confirm}</span>
              <div className="relative mt-1">
                <LuLock className={iconCls} size={16} />
                <input
                  type={show ? "text" : "password"}
                  className={inputCls}
                  value={form.confirm}
                  onChange={set("confirm")}
                  autoComplete="new-password"
                  required
                />
              </div>
            </label>
          </div>

          {error && (
            <p className="mt-4 rounded-lg bg-red-500/15 px-4 py-3 text-sm text-red-200 ring-1 ring-red-400/30">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="mt-6 w-full rounded-lg bg-cg-bright py-3 text-sm font-bold text-[#16281c] transition hover:brightness-110 disabled:opacity-60"
          >
            {busy ? t.sending : t.submit}
          </button>

          <p className="mt-5 text-center text-sm text-white/60">
            {t.haveAccount}{" "}
            <Link
              to={`/login${form.role === "worker" ? "?role=worker" : ""}`}
              className="font-semibold text-cg-bright hover:underline"
            >
              {t.signIn}
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}
