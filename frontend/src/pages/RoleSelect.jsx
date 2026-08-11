import { useNavigate } from "react-router-dom";
import { ROLES } from "../lib/site";

const bg = {
  backgroundImage:
    "linear-gradient(rgba(16,32,22,.55), rgba(16,32,22,.8)), radial-gradient(circle at 30% 20%, #2f5a3a, #142a1e)",
};

export default function RoleSelect() {
  const navigate = useNavigate();
  return (
    <main
      className="grid min-h-screen place-items-center px-4 py-10"
      style={bg}
    >
      <div className="w-full max-w-4xl rounded-3xl bg-white/10 p-10 text-white backdrop-blur-md ring-1 ring-white/15">
        <h1 className="text-center text-4xl font-extrabold">
          Welcome to Cha Ghor
        </h1>
        <p className="mt-2 text-center text-white/70">
          Select your role to access the tea garden management system
        </p>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {ROLES.map((r) => {
            const Icon = r.icon;
            return (
              <button
                key={r.key}
                onClick={() => navigate(`/login?role=${r.key}`)}
                className="group rounded-2xl bg-white/5 p-6 text-left ring-1 ring-white/15 transition-all duration-200 hover:-translate-y-1 hover:bg-cg-green/20 hover:ring-2 hover:ring-cg-bright/60"
              >
                <div className="grid h-12 w-12 place-items-center rounded-xl bg-cg-green/25 text-2xl text-cg-bright transition-colors group-hover:bg-cg-bright/30">
                  <Icon />
                </div>
                <p className="mt-4 text-xs font-semibold uppercase tracking-widest text-cg-bright">
                  {r.level}
                </p>
                <h3 className="mt-1 text-xl font-bold">{r.title}</h3>
                <p className="mt-2 text-sm text-white/70">{r.text}</p>
              </button>
            );
          })}
        </div>
        <p className="mt-8 border-t border-white/10 pt-5 text-center text-sm text-white/60">
          New to Cha Ghor?{" "}
          <button
            onClick={() => navigate("/register")}
            className="font-semibold text-cg-bright hover:underline"
          >
            Request an account
          </button>
          <span className="px-2 text-white/30">|</span>
          Need assistance?{" "}
          <a
            className="font-semibold text-cg-bright hover:underline"
            href="/#contact"
          >
            Contact Support
          </a>
        </p>
      </div>
    </main>
  );
}
