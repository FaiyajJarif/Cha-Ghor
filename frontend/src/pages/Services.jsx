import { Link } from "react-router-dom";
import { SERVICES } from "../lib/site";

const btn =
  "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0";

export default function Services() {
  return (
    <main>
      <section className="bg-cg-dark py-16 text-center text-white">
        <div className="mx-auto max-w-3xl px-6">
          <h1 className="text-4xl font-extrabold tracking-wide">
            OUR SERVICES
          </h1>
          <p className="mt-4 text-white/75">
            End-to-end services that keep your tea estate running smoothly —
            from workforce and wages to supply chain and support.
          </p>
        </div>
      </section>

      <section className="py-16">
        <div className="mx-auto grid max-w-6xl gap-6 px-6 md:grid-cols-3">
          {SERVICES.map((s) => {
            const Icon = s.icon;
            return (
              <div
                key={s.title}
                className="rounded-2xl bg-cg-dark p-7 text-white shadow-lg transition-all duration-200 hover:-translate-y-1 hover:shadow-xl"
              >
                <div className="grid h-12 w-12 place-items-center rounded-xl bg-cg-green/20 text-2xl text-cg-bright">
                  <Icon />
                </div>
                <h3 className="mt-4 text-lg font-bold">{s.title}</h3>
                <p className="mt-2 text-sm text-white/70">{s.text}</p>
              </div>
            );
          })}
        </div>
        <div className="mt-10 text-center">
          <Link
            to="/role"
            className={`rounded-full bg-cg-green px-8 py-3 font-semibold text-white hover:bg-cg-green/90 ${btn}`}
          >
            Get Started
          </Link>
        </div>
      </section>
    </main>
  );
}
