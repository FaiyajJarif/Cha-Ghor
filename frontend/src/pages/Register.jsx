import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  LuLeaf,
  LuUser,
  LuBadgeCheck,
  LuMail,
  LuPhone,
  LuLock,
  LuEye,
  LuEyeOff,
} from "react-icons/lu";

const bg = { backgroundImage: "linear-gradient(160deg, #16281c, #24422e)" };
const labelCls = "text-xs font-semibold uppercase tracking-wide text-cg-bright";
const inputCls =
  "w-full rounded-lg bg-white/10 py-3 pl-10 pr-4 text-sm text-white placeholder-white/40 outline-none ring-1 ring-white/15 transition focus:ring-cg-bright";
const iconCls =
  "pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40";

export default function Register() {
  const [params] = useSearchParams();
  const [form, setForm] = useState({
    fullName: "",
    username: "",
    email: "",
    phone: "+8801",
    role: params.get("role") || "worker",
    locale: "en",
    password: "",
    confirm: "",
  });
  const [show, setShow] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = (e) => {
    e.preventDefault();
    if (form.password !== form.confirm) {
      alert("Passwords do not match.");
      return;
    }
    // TODO (after the Auth backend is wired): POST /auth/register (admin-only).
    //   Maps to the `users` table (+ `workers` row when role === "worker").
    alert(
      `Account request for ${form.username} as ${form.role}. Wire this to POST /auth/register next.`,
    );
  };

  return (
    <main
      className="grid min-h-screen place-items-center px-4 py-10"
      style={bg}
    >
      <div className="w-full max-w-lg">
        <div className="text-center text-white">
          <Link
            to="/"
            aria-label="Back to home"
            className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-cg-green/30 text-2xl text-cg-bright transition-transform hover:-translate-y-0.5"
          >
            <LuLeaf />
          </Link>
          <h1 className="mt-3 text-2xl font-extrabold">Create your account</h1>
          <p className="text-xs uppercase tracking-widest text-white/60">
            Cha Ghor — Tea Garden Management
          </p>
        </div>

        <form
          onSubmit={submit}
          className="mt-6 space-y-4 rounded-3xl bg-white/5 p-8 text-white ring-1 ring-white/10"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Full name</label>
              <div className="relative mt-1">
                <LuUser className={iconCls} />
                <input
                  value={form.fullName}
                  onChange={set("fullName")}
                  placeholder="Abdul Karim"
                  className={inputCls}
                  required
                />
              </div>
            </div>
            <div>
              <label className={labelCls}>Username</label>
              <div className="relative mt-1">
                <LuBadgeCheck className={iconCls} />
                <input
                  value={form.username}
                  onChange={set("username")}
                  placeholder="akarim"
                  className={inputCls}
                  required
                />
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Email address</label>
              <div className="relative mt-1">
                <LuMail className={iconCls} />
                <input
                  type="email"
                  value={form.email}
                  onChange={set("email")}
                  placeholder="you@chaghor.com"
                  className={inputCls}
                />
              </div>
            </div>
            <div>
              <label className={labelCls}>Phone number</label>
              <div className="relative mt-1">
                <LuPhone className={iconCls} />
                <input
                  value={form.phone}
                  onChange={set("phone")}
                  placeholder="+8801XXXXXXXXX"
                  className={inputCls}
                  required
                />
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Role</label>
              <select
                value={form.role}
                onChange={set("role")}
                className="mt-1 w-full rounded-lg bg-white/10 px-4 py-3 text-sm text-white outline-none ring-1 ring-white/15 transition focus:ring-cg-bright"
              >
                <option value="admin">Admin</option>
                <option value="supervisor">Supervisor</option>
                <option value="worker">Worker</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Preferred language</label>
              <select
                value={form.locale}
                onChange={set("locale")}
                className="mt-1 w-full rounded-lg bg-white/10 px-4 py-3 text-sm text-white outline-none ring-1 ring-white/15 transition focus:ring-cg-bright"
              >
                <option value="en">English</option>
                <option value="bn">Bangla</option>
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Password</label>
              <div className="relative mt-1">
                <LuLock className={iconCls} />
                <input
                  type={show ? "text" : "password"}
                  value={form.password}
                  onChange={set("password")}
                  placeholder="Create a password"
                  className="w-full rounded-lg bg-white/10 py-3 pl-10 pr-11 text-sm text-white placeholder-white/40 outline-none ring-1 ring-white/15 transition focus:ring-cg-bright"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60 transition hover:text-cg-bright"
                  aria-label={show ? "Hide password" : "Show password"}
                >
                  {show ? <LuEyeOff /> : <LuEye />}
                </button>
              </div>
            </div>
            <div>
              <label className={labelCls}>Confirm password</label>
              <div className="relative mt-1">
                <LuLock className={iconCls} />
                <input
                  type={show ? "text" : "password"}
                  value={form.confirm}
                  onChange={set("confirm")}
                  placeholder="Re-enter password"
                  className={inputCls}
                  required
                />
              </div>
            </div>
          </div>

          <button className="w-full rounded-lg bg-cg-bright py-3 font-semibold text-cg-darker transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0">
            Create account
          </button>
          <p className="text-center text-xs text-white/45">
            Accounts are provisioned by an estate admin. This form is a preview
            until the Auth backend (POST /auth/register) is wired.
          </p>
        </form>

        <p className="mt-5 text-center text-sm text-white/60">
          Already have an account?{" "}
          <Link
            to="/login"
            className="font-semibold text-cg-bright hover:underline"
          >
            Log in
          </Link>
        </p>
        <p className="mt-2 text-center text-sm text-white/60">
          <Link to="/" className="font-semibold text-cg-bright hover:underline">
            Back to home
          </Link>
        </p>
      </div>
    </main>
  );
}
