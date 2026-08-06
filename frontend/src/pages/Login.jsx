import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { LuLeaf, LuEye, LuEyeOff } from "react-icons/lu";
import { useAuth } from "../context/AuthContext";
import { apiError } from "../lib/apiError";

const bg = { backgroundImage: "linear-gradient(160deg, #16281c, #24422e)" };

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const role = params.get("role");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const u = await login(username, password);
      navigate(u.role === "admin" ? "/admin" : "/dashboard");
    } catch (err) {
      // apiError surfaces a clear message on 429 (rate limit); anything else
      // falls back to the generic invalid-credentials copy.
      setError(apiError(err, "Invalid username or password."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main
      className="grid min-h-screen place-items-center px-4 py-10"
      style={bg}
    >
      <div className="w-full max-w-md">
        <div className="text-center text-white">
          <Link
            to="/"
            aria-label="Back to home"
            className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-cg-green/30 text-2xl text-cg-bright transition-transform hover:-translate-y-0.5"
          >
            <LuLeaf />
          </Link>
          <h1 className="mt-3 text-2xl font-extrabold">Cha Ghor</h1>
          <p className="text-xs uppercase tracking-widest text-white/60">
            Tea Garden Management
          </p>
        </div>
        <div className="mt-6 rounded-3xl bg-white/5 p-8 text-white ring-1 ring-white/10">
          <h2 className="text-xl font-bold">Welcome back</h2>
          <p className="mt-1 text-sm text-white/60">
            Sign in to access Cha Ghor{role ? ` (${role})` : ""}.
          </p>
          <form className="mt-6 space-y-4" onSubmit={submit}>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-cg-bright">
                Username
              </label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                autoComplete="username"
                className="mt-1 w-full rounded-lg bg-white/10 px-4 py-3 text-sm outline-none ring-1 ring-white/15 transition focus:ring-cg-bright"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-cg-bright">
                Password
              </label>
              <div className="relative mt-1">
                <input
                  type={show ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  className="w-full rounded-lg bg-white/10 px-4 py-3 pr-11 text-sm outline-none ring-1 ring-white/15 transition focus:ring-cg-bright"
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
            {error && (
              <p className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-300">
                {error}
              </p>
            )}
            <button
              disabled={loading}
              className="w-full rounded-lg bg-cg-bright py-3 font-semibold text-cg-darker transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 disabled:opacity-60"
            >
              {loading ? "Signing in…" : "Log In"}
            </button>
          </form>
          <p className="mt-5 text-center text-sm text-white/60">
            New here?{" "}
            <Link
              to="/register"
              className="font-semibold text-cg-bright hover:underline"
            >
              Create new account
            </Link>
          </p>
          <p className="mt-2 text-center text-sm text-white/60">
            <Link
              to="/"
              className="font-semibold text-cg-bright hover:underline"
            >
              Back to home
            </Link>
          </p>
          <p className="mt-4 rounded-lg bg-white/5 px-3 py-2 text-center text-xs text-white/50">
            Demo logins — admin / admin123 · supervisor / super123 · worker /
            worker123
          </p>
        </div>
      </div>
    </main>
  );
}
