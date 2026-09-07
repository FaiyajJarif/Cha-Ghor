import { LuWrench } from "react-icons/lu";

// Reusable placeholder for admin modules we haven't fleshed out yet. Keeps the
// full console navigable and states what each module + its embedded AI will do,
// so we can flesh them out one by one in the agile build.
export default function ModulePlaceholder({ title, description, ai, planned }) {
  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-white p-6 shadow ring-1 ring-cg-green/10">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-cg-lime text-cg-green">
            <LuWrench size={22} />
          </span>
          <div>
            <h2 className="text-lg font-extrabold text-cg-ink">{title}</h2>
            <p className="text-sm text-cg-ink/60">{description}</p>
          </div>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl bg-white p-5 shadow ring-1 ring-cg-green/10">
          <h3 className="font-bold text-cg-ink">Planned in this module</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-cg-ink/70">
            {planned.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl bg-cg-dark p-5 text-white shadow">
          <h3 className="font-bold">🤖 Embedded AI</h3>
          <p className="mt-2 text-sm text-white/80">{ai}</p>
        </div>
      </div>
    </div>
  );
}
