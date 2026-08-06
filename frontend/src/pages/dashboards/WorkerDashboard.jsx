import DashboardShell from "../../components/DashboardShell";
import RbacProbe from "../../components/RbacProbe";

export default function WorkerDashboard() {
  return (
    <DashboardShell
      title="Worker Dashboard"
      subtitle="Field level — your attendance, leaf collection and earnings."
    >
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {["My attendance", "My leaf collection", "My payslips"].map((t) => (
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
