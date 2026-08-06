import { Link, NavLink } from "react-router-dom";
import Logo from "./Logo";
import { NAV } from "../lib/site";

export default function Navbar() {
  const linkClass = ({ isActive }) =>
    `text-sm font-medium transition-colors hover:text-cg-green ${
      isActive ? "text-cg-green" : "text-cg-ink/80"
    }`;

  return (
    <header className="sticky top-0 z-40 border-b border-black/5 bg-cg-header/90 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Link to="/" className="transition-transform hover:-translate-y-0.5">
          <Logo />
        </Link>
        <div className="hidden items-center gap-7 md:flex">
          {NAV.map((n) => (
            <NavLink
              key={n.label}
              to={n.to}
              className={linkClass}
              end={n.to === "/"}
            >
              {n.label}
            </NavLink>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/login"
            className="text-sm font-semibold text-cg-ink transition-colors hover:text-cg-green"
          >
            Log In
          </Link>
          <Link
            to="/role"
            className="rounded-full bg-cg-green px-4 py-2 text-sm font-semibold text-white shadow transition-all duration-200 hover:-translate-y-0.5 hover:bg-cg-green/90 hover:shadow-lg active:translate-y-0"
          >
            Get Started
          </Link>
        </div>
      </nav>
    </header>
  );
}
