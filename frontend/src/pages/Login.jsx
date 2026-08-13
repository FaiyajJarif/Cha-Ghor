import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { LuLeaf, LuEye, LuEyeOff } from "react-icons/lu";
import { useAuth } from "../context/AuthContext";
import { apiError } from "../lib/apiError";

const bg = { backgroundImage: "linear-gradient(160deg, #16281c, #24422e)" };

// Workers see Bangla and get PIN sign-in; everyone else sees English and a
// password. The role arrives as ?role=worker from RoleSelect and the
// registration screen.
const T = {
  en: {
    welcome: "Welcome back",
    sub: "Sign in to access Cha Ghor",
    username: "Username",
    password: "Password",
    signIn: "Log In",
    signingIn: "Signing in…",
    failed: "Invalid username or password.",
    newHere: "New here?",
    request: "Request an account",
    usePin: "Sign in with a PIN instead",
    usePassword: "Sign in with a password instead",
    phone: "Mobile number",
    pin: "4-digit PIN",
    pinHelp: "The estate office gave you this when your account was approved.",
    badPhone: "Enter the 10 digits after +880.",
    badPin: "The PIN is 4 digits.",
  },
  bn: {
    welcome: "স্বাগতম",
    sub: "চা ঘরে ঢুকতে সাইন ইন করুন",
    username: "ইউজারনেম",
    password: "পাসওয়ার্ড",
    signIn: "ঢুকুন",
    signingIn: "ঢোকা হচ্ছে…",
    failed: "ইউজারনেম বা পাসওয়ার্ড ঠিক নেই।",
    newHere: "নতুন?",
    request: "অ্যাকাউন্টের জন্য আবেদন করুন",
    usePin: "পিন দিয়ে ঢুকুন",
    usePassword: "পাসওয়ার্ড দিয়ে ঢুকুন",
    phone: "মোবাইল নম্বর",
    pin: "৪ সংখ্যার পিন",
    pinHelp: "অ্যাকাউন্ট অনুমোদনের সময় অফিস থেকে এই পিন দেওয়া হয়েছে।",
    badPhone: "+৮৮০ এর পরের ১০ সংখ্যা লিখুন।",
    badPin: "পিন ৪ সংখ্যার।",
  },
};

export default function Login() {
  const { login, loginWithPin } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const role = params.get("role");
  const isWorker = role === "worker";
  const t = isWorker ? T.bn : T.en;

  // A worker lands on the PIN form; everyone else on the password form. Both
  // remain reachable either way — a worker who prefers their password should
  // not be forced through a PIN, and vice versa.
  const [mode, setMode] = useState(isWorker ? "pin" : "password");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const go = (u) => navigate(u.role === "admin" ? "/admin" : "/dashboard");

  // Same normalisation as the registration screen: people type their number as
  // 01712345678 and the +880 is printed, not typed.
  const setPhoneDigits = (e) => {
    let d = e.target.value.replace(/\D/g, "");
    if (d.startsWith("880")) d = d.slice(3);
    if (d.startsWith("0")) d = d.slice(1);
    setPhone(d.slice(0, 10));
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "pin") {
        if (phone.length !== 10) {
          setError(t.badPhone);
          return;
        }
        if (!/^\d{4}$/.test(pin)) {
          setError(t.badPin);
          return;
        }
        go(await loginWithPin("+880" + phone, pin));
      } else {
        go(await login(username, password));
      }
    } catch (err) {
      // apiError surfaces the server's message, which now distinguishes a
      // pending or rejected account from a wrong password.
      setError(apiError(err, t.failed));
    } finally {
      setLoading(false);
    }
  };

  const inputCls =
    "w-full rounded-lg bg-white/10 px-4 py-3 text-sm text-white placeholder-white/40 outline-none ring-1 ring-white/15 focus:ring-cg-bright";
  const labelCls = "text-xs font-semibold uppercase tracking-wide text-cg-bright";

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10" style={bg}>
      <div className="w-full max-w-md">
        <div className="text-center text-white">
          <Link
            to="/"
            aria-label="Back to home"
            className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-cg-green/30 text-2xl text-cg-bright transition-transform hover:-translate-y-0.5"
          >
            <LuLeaf />
          </Link>
          <h1 className="mt-3 text-2xl font-extrabold">
            {isWorker ? "চা ঘর" : "Cha Ghor"}
          </h1>
          <p className="text-xs uppercase tracking-widest text-white/60">
            Tea Garden Management
          </p>
        </div>

        <div className="mt-6 rounded-3xl bg-white/5 p-8 text-white ring-1 ring-white/10">
          <h2 className="text-xl font-bold">{t.welcome}</h2>
          <p className="mt-1 text-sm text-white/60">{t.sub}</p>

          <form className="mt-6 space-y-4" onSubmit={submit}>
            {mode === "pin" ? (
              <>
                <label className="block">
                  <span className={labelCls}>{t.phone}</span>
                  <div className="mt-1 flex overflow-hidden rounded-lg bg-white/10 ring-1 ring-white/15 focus-within:ring-cg-bright">
                    <span className="grid shrink-0 place-items-center border-r border-white/15 bg-white/5 px-3 text-sm font-semibold text-white/70">
                      +880
                    </span>
                    <input
                      className="w-full bg-transparent px-4 py-3 text-sm text-white placeholder-white/40 outline-none"
                      value={phone}
                      onChange={setPhoneDigits}
                      placeholder="1712345678"
                      inputMode="numeric"
                      autoComplete="tel"
                    />
                  </div>
                </label>

                <label className="block">
                  <span className={labelCls}>{t.pin}</span>
                  <input
                    className={`${inputCls} mt-1 text-center text-2xl tracking-[0.6em]`}
                    value={pin}
                    onChange={(e) =>
                      setPin(e.target.value.replace(/\D/g, "").slice(0, 4))
                    }
                    placeholder="••••"
                    inputMode="numeric"
                    autoComplete="off"
                  />
                  <span className="mt-1 block text-[11px] text-white/45">
                    {t.pinHelp}
                  </span>
                </label>
              </>
            ) : (
              <>
                <label className="block">
                  <span className={labelCls}>{t.username}</span>
                  <input
                    className={`${inputCls} mt-1`}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                  />
                </label>

                <label className="block">
                  <span className={labelCls}>{t.password}</span>
                  <div className="relative mt-1">
                    <input
                      type={show ? "text" : "password"}
                      className={inputCls}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
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
                </label>
              </>
            )}

            {error && (
              <p className="rounded-lg bg-red-500/15 px-4 py-3 text-sm text-red-200 ring-1 ring-red-400/30">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-cg-bright py-3 text-sm font-bold text-[#16281c] transition hover:brightness-110 disabled:opacity-60"
            >
              {loading ? t.signingIn : t.signIn}
            </button>
          </form>

          <button
            type="button"
            onClick={() => {
              setMode((m) => (m === "pin" ? "password" : "pin"));
              setError("");
            }}
            className="mt-4 w-full text-center text-sm font-semibold text-cg-bright hover:underline"
          >
            {mode === "pin" ? t.usePassword : t.usePin}
          </button>

          <p className="mt-5 text-center text-sm text-white/60">
            {t.newHere}{" "}
            <Link
              to={`/register${isWorker ? "?role=worker" : ""}`}
              className="font-semibold text-cg-bright hover:underline"
            >
              {t.request}
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
