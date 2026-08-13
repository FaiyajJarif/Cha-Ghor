import { Link } from "react-router-dom";
import {
  CORE_FEATURES,
  SERVICES,
  AI_FEATURES,
  STATS,
  HERO_IMAGE,
  ABOUT_IMAGE,
} from "../lib/site";

// Soft green panel used for the hero + about imagery (original look).
const softPanel = {
  backgroundImage:
    "linear-gradient(135deg, rgba(63,143,67,.35), rgba(18,32,24,.45))",
};

// Placeholder shown under a core feature until you add a real image.
const imgPlaceholder = {
  backgroundImage: "linear-gradient(135deg, #3f8f43, #1c3a29)",
};

// Shared button motion — lift + shadow on hover, press down on click.
const btn =
  "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 active:shadow";

export default function Landing() {
  return (
    <main>
      {/* HERO */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-16 md:grid-cols-2">
        <div>
          <h1 className="text-5xl font-extrabold leading-tight text-cg-ink">
            Cha <span className="text-cg-green">Ghor</span>
          </h1>
          <p className="mt-4 max-w-md text-cg-ink/70">
            Smart Tea Garden Management System. Cultivating precision in every
            leaf through digital intelligence.
          </p>
          <div className="mt-6 flex gap-3">
            <Link
              to="/role"
              className={`rounded-full bg-cg-green px-6 py-3 font-semibold text-white shadow hover:bg-cg-green/90 ${btn}`}
            >
              Get Started
            </Link>
            <a
              href="#demo"
              className={`rounded-full border border-cg-green/40 px-6 py-3 font-semibold text-cg-green hover:bg-cg-green/10 ${btn}`}
            >
              Watch demo
            </a>
          </div>
          <p className="mt-6 text-xs font-medium text-cg-ink/60">
            Trusted by 20+ Estates
          </p>
        </div>
        {/* HERO IMAGE — set HERO_IMAGE in src/lib/site.js to replace this panel. */}
        {HERO_IMAGE ? (
          <img
            src={HERO_IMAGE}
            alt="Cha Ghor tea garden"
            className="h-72 w-full rounded-3xl object-cover shadow-xl"
          />
        ) : (
          <div
            className="flex h-72 items-center justify-center rounded-3xl text-sm font-medium text-white/85 shadow-xl"
            style={softPanel}
          >
            Add a hero image here
          </div>
        )}
      </section>

      {/* CORE FEATURES */}
      <section className="bg-cg-dark py-16 text-white">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-3xl font-extrabold">Core Features</h2>
              <p className="mt-1 text-white/70">
                Smart tools to simplify daily operations
              </p>
            </div>
            <Link
              to="/features"
              className={`rounded-full bg-cg-green px-4 py-2 text-sm font-semibold ${btn}`}
            >
              View All
            </Link>
          </div>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {CORE_FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.title}
                  className="overflow-hidden rounded-2xl bg-white/5 p-6 ring-1 ring-white/10 transition-all duration-200 hover:-translate-y-1 hover:bg-white/10 hover:ring-cg-bright/40"
                >
                  <div className="grid h-12 w-12 place-items-center rounded-xl bg-cg-green/20 text-2xl text-cg-bright">
                    <Icon />
                  </div>
                  <h3 className="mt-3 text-lg font-bold">{f.title}</h3>
                  <p className="mt-2 text-sm text-white/70">{f.text}</p>
                  {f.image ? (
                    <img
                      src={f.image}
                      alt={f.title}
                      className="mt-4 h-40 w-full rounded-xl object-cover"
                    />
                  ) : (
                    <div
                      className="mt-4 flex h-40 w-full items-center justify-center rounded-xl text-xs font-medium text-white/85"
                      style={imgPlaceholder}
                    >
                      Add an image here
                    </div>
                  )}
                  <Link
                    to="/features"
                    className={`mt-4 inline-block rounded-full bg-cg-green px-4 py-1.5 text-xs font-semibold ${btn}`}
                  >
                    Learn More
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* AI-EMBEDDED INTELLIGENCE */}
      <section className="py-16">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center">
            <span className="rounded-full bg-cg-green/15 px-3 py-1 text-xs font-semibold text-cg-green">
              Powered by AI
            </span>
            <h2 className="mt-3 text-3xl font-extrabold text-cg-ink">
              AI-Embedded Intelligence
            </h2>
            <p className="mx-auto mt-2 max-w-2xl text-cg-ink/70">
              One read-only, role-aware AI layer across every module — bilingual
              (English &amp; Bangla) and advisory only.
            </p>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {AI_FEATURES.map((a) => {
              const Icon = a.icon;
              return (
                <div
                  key={a.title}
                  className="rounded-2xl bg-cg-dark p-6 text-white shadow-lg ring-1 ring-white/5 transition-all duration-200 hover:-translate-y-1 hover:ring-cg-bright/40"
                >
                  <div className="grid h-11 w-11 place-items-center rounded-xl bg-cg-green/20 text-xl text-cg-bright">
                    <Icon />
                  </div>
                  <h3 className="mt-3 font-bold">{a.title}</h3>
                  <p className="mt-2 text-sm text-white/70">{a.text}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* SERVICES PREVIEW */}
      <section className="py-16">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-3xl font-extrabold text-cg-ink">
            Our Services
          </h2>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {SERVICES.map((s) => {
              const Icon = s.icon;
              return (
                <div
                  key={s.title}
                  className="rounded-2xl bg-cg-dark p-6 text-white shadow-lg transition-all duration-200 hover:-translate-y-1 hover:shadow-xl"
                >
                  <div className="grid h-12 w-12 place-items-center rounded-xl bg-cg-green/20 text-2xl text-cg-bright">
                    <Icon />
                  </div>
                  <h3 className="mt-3 font-bold">{s.title}</h3>
                  <p className="mt-2 text-sm text-white/70">{s.text}</p>
                </div>
              );
            })}
          </div>
          <div className="mt-8 text-center">
            <Link
              to="/services"
              className={`rounded-full border border-cg-green px-6 py-2 text-sm font-semibold text-cg-green hover:bg-cg-green/10 ${btn}`}
            >
              Explore More
            </Link>
          </div>
        </div>
      </section>

      {/* ABOUT + STATS */}
      <section id="about" className="bg-cg-dark py-16 text-white">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid items-center gap-10 md:grid-cols-2">
            <div>
              <h2 className="text-3xl font-extrabold">About Us</h2>
              <p className="mt-4 text-white/75">
                Cha Ghor brings a new level of efficiency and clarity to tea
                estate management — transforming traditional operations into an
                organized, reliable, forward-thinking approach.
              </p>
              <p className="mt-3 text-white/75">
                Our goal is to support better decision-making, reduce
                operational challenges, and create a smoother workflow by
                combining technology with real-world understanding of the tea
                industry.
              </p>
            </div>
            {/* ABOUT IMAGE — set ABOUT_IMAGE in src/lib/site.js to replace this panel. */}
            {ABOUT_IMAGE ? (
              <img
                src={ABOUT_IMAGE}
                alt="About Cha Ghor"
                className="h-64 w-full rounded-3xl object-cover"
              />
            ) : (
              <div
                className="flex h-64 items-center justify-center rounded-3xl text-sm font-medium text-white/85"
                style={softPanel}
              >
                Add an About image here
              </div>
            )}
          </div>
          <div className="mt-12">
            <h3 className="text-center text-xl font-bold">
              A platform you can trust
            </h3>
            <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-5">
              {STATS.map((s) => (
                <div
                  key={s.label}
                  className="rounded-2xl bg-white/5 p-5 text-center ring-1 ring-white/10"
                >
                  <div className="text-2xl font-extrabold text-cg-bright">
                    {s.value}
                  </div>
                  <div className="mt-1 text-xs text-white/70">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* TESTIMONIAL */}
      <section className="py-16">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <div className="text-2xl text-yellow-400">★★★★★</div>
          <h3 className="mt-3 text-2xl font-bold text-cg-ink">
            Here is what our clients say about Cha Ghor
          </h3>
          <blockquote className="mt-6 rounded-3xl bg-cg-green/15 p-8 text-cg-ink/80">
            &ldquo;Cha Ghor has completely transformed the way we manage our tea
            garden operations. From attendance to workforce management,
            everything is now smooth, fast, and far more organized.&rdquo;
            <footer className="mt-4 text-sm font-semibold text-cg-ink">
              Md. Shazan Mahmud Arpon — Manager, Kazi &amp; Kazi Tea Estate
            </footer>
          </blockquote>
        </div>
      </section>

      {/* CTA */}
      <section id="demo" className="bg-cg-dark py-16 text-center text-white">
        <div className="mx-auto max-w-3xl px-6">
          <h2 className="text-3xl font-extrabold">
            Manage smarter. Grow faster. Perform better.
          </h2>
          <p className="mt-3 text-white/75">
            Take full control of your tea garden with a powerful management
            system built to handle workforce, attendance, payroll, and
            operations — all in one place.
          </p>
          <Link
            to="/role"
            className={`mt-6 inline-block rounded-full bg-cg-bright px-8 py-3 font-semibold text-cg-darker ${btn}`}
          >
            Get Started
          </Link>
        </div>
      </section>

      {/* CONTACT */}
      <section id="contact" className="py-16">
        <div className="mx-auto max-w-3xl px-6">
          <h2 className="text-center text-3xl font-extrabold text-cg-ink">
            Have a question? We are here to help.
          </h2>
          <form className="mt-8 space-y-4" onSubmit={(e) => e.preventDefault()}>
            <input
              className="w-full rounded-lg bg-white/70 px-4 py-3 outline-none ring-1 ring-cg-green/20 focus:ring-cg-green"
              placeholder="Full name"
            />
            <input
              className="w-full rounded-lg bg-white/70 px-4 py-3 outline-none ring-1 ring-cg-green/20 focus:ring-cg-green"
              placeholder="Phone"
            />
            <input
              className="w-full rounded-lg bg-white/70 px-4 py-3 outline-none ring-1 ring-cg-green/20 focus:ring-cg-green"
              placeholder="Email"
            />
            <textarea
              rows={4}
              className="w-full rounded-lg bg-white/70 px-4 py-3 outline-none ring-1 ring-cg-green/20 focus:ring-cg-green"
              placeholder="Message"
            />
            <button
              className={`w-full rounded-lg bg-cg-green py-3 font-semibold text-white hover:bg-cg-green/90 ${btn}`}
            >
              Send
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
