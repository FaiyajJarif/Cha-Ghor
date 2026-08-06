import DashboardShell from "../../components/DashboardShell";
import RbacProbe from "../../components/RbacProbe";

export default function SupervisorDashboard() {
  return (
    <DashboardShell
      title="Supervisor Dashboard"
      subtitle="Division level — daily operations, attendance and quality control."
    >
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {[
          "Mark attendance",
          "Record leaf collection",
          "Review requisitions",
        ].map((t) => (
          <div
            key={t}
            className="rounded-2xl bg-white p-5 font-semibold text-cg-ink shadow ring-1 ring-cg-green/10"
          >
            {t}
            <p className="mt-1 text-xs font-normal text-cg-ink/50">
              Coming in a later slice.
            </p>
          </div>
        ))}
      </div>
      <RbacProbe />
    </DashboardShell>
  );
}
