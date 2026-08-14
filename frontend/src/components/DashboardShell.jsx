import { Link } from "react-router-dom";
import { LuLeaf, LuLogOut } from "react-icons/lu";
import { useAuth } from "../context/AuthContext";

// Shared chrome for the role dashboards: top bar with logo, who's signed in,
// and a log-out button.
export default function DashboardShell({ title, subtitle, children }) {
  const { user, logout } = useAuth();
  return (
    <div className="min-h-screen bg-cg-lime">
      <header className="flex items-center justify-between bg-cg-header px-6 py-3 shadow-sm">
        <Link
          to="/"
          className="flex items-center gap-2 font-extrabold text-cg-ink"
        >
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-cg-green/20 text-cg-green">
            <LuLeaf />
          </span>
          Cha Ghor
        </Link>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-cg-ink/70">
            {user?.username} · <b className="text-cg-green">{user?.role}</b>
          </span>
          <button
            onClick={logout}
            className="inline-flex items-center gap-1 rounded-full bg-cg-green px-4 py-1.5 font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
          >
            <LuLogOut /> Log out
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="text-2xl font-extrabold text-cg-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-cg-ink/60">{subtitle}</p>}
        {children}
      </main>
    </div>
  );
}
