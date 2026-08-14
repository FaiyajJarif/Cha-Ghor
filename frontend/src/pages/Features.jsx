import { Link } from "react-router-dom";
import { FEATURE_SECTIONS } from "../lib/site";

const panel = {
  backgroundImage:
    "linear-gradient(135deg, rgba(63,143,67,.35), rgba(18,32,24,.5))",
};

export default function Features() {
  return (
    <main>
      <section className="bg-cg-dark py-16 text-center text-white">
        <div className="mx-auto max-w-3xl px-6">
          <h1 className="text-4xl font-extrabold tracking-wide">FEATURES</h1>
          <p className="mt-4 text-white/75">
            Explore the complete set of tools designed to simplify tea garden
            management. From field tracking to workforce coordination and
            production insights — everything in one place.
          </p>
        </div>
      </section>

      <section className="py-14">
        <div className="mx-auto max-w-5xl space-y-6 px-6">
          {FEATURE_SECTIONS.map((f, i) => {
            const flip = i % 2 === 1;
            return (
              <div
                key={f.title}
                className="grid gap-6 rounded-3xl bg-cg-dark p-8 text-white md:grid-cols-2"
              >
                {f.image ? (
                  <img
                    src={f.image}
                    alt={f.title}
                    className={`h-full w-full rounded-2xl object-cover ${flip ? "md:order-2" : ""}`}
                  />
                ) : (
                  <div
                    className={`h-48 rounded-2xl ${flip ? "md:order-2" : ""}`}
                    style={panel}
                  />
                )}
                <div className={flip ? "md:order-1" : ""}>
                  <h2 className="text-2xl font-bold">{f.title}</h2>
                  <p className="mt-2 text-sm text-white/70">{f.intro}</p>
                  <p className="mt-4 text-sm font-semibold text-cg-bright">
                    Operations
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-white/80">
                    {f.ops.map((o) => (
                      <li key={o} className="flex gap-2">
                        <span className="text-cg-bright">✓</span>
                        {o}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="bg-cg-dark py-16 text-center text-white">
        <div className="mx-auto max-w-2xl px-6">
          <h2 className="text-3xl font-extrabold">
            The Future of Tea Starts Here
          </h2>
          <p className="mt-3 text-white/75">
            Join the elite league of Bangladesh tea estates transitioning to a
            data-first philosophy. Centralized control, decentralized
            productivity.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link
              to="/role"
              className="rounded-full bg-cg-bright px-6 py-3 font-semibold text-cg-darker"
            >
              Book a demo
            </Link>
            <a
              href="/#demo"
              className="rounded-full border border-white/40 px-6 py-3 font-semibold"
            >
              Watch demo
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
