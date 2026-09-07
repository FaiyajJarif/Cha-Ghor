import { useState } from "react";
import api from "../../api/client";
import DashboardShell from "../../components/DashboardShell";
import RbacProbe from "../../components/RbacProbe";

const empty = { username: "", email: "", password: "", role: "worker" };

export default function AdminDashboard() {
  const [form, setForm] = useState(empty);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setMsg(null);
    setBusy(true);
    try {
      const { data } = await api.post("/auth/register", form);
      setMsg({ ok: true, text: `Created ${data.username} (${data.role}).` });
      setForm(empty);
    } catch (err) {
      const code = err?.response?.status;
      setMsg({
        ok: false,
        text:
          code === 400
            ? "That username already exists."
            : code === 403
              ? "Only an admin can create accounts."
              : "Could not create the account.",
      });
    } finally {
      setBusy(false);
    }
  };

  const field =
    "mt-1 w-full rounded-lg border border-cg-green/20 px-3 py-2 text-sm outline-none focus:border-cg-green";

  return (
    <DashboardShell
      title="Admin Dashboard"
      subtitle="Estate level — full control over accounts, operations and analytics."
    >
      <section className="mt-6 rounded-2xl bg-white p-6 shadow ring-1 ring-cg-green/10">
        <h2 className="font-bold text-cg-ink">Create an account</h2>
        <p className="text-sm text-cg-ink/60">
          Admin-only. Sends POST /auth/register with your admin token — creates
          the login row in the users table.
        </p>
        <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2">
          <input
            value={form.username}
            onChange={set("username")}
            placeholder="Username"
            required
            className={field}
          />
          <input
            type="email"
            value={form.email}
            onChange={set("email")}
            placeholder="Email"
            className={field}
          />
          <input
            type="password"
            value={form.password}
            onChange={set("password")}
            placeholder="Password (min 6)"
            required
            className={field}
          />
          <select value={form.role} onChange={set("role")} className={field}>
            <option value="admin">Admin</option>
            <option value="supervisor">Supervisor</option>
            <option value="worker">Worker</option>
          </select>
          <div className="sm:col-span-2">
            <button
              disabled={busy}
              className="rounded-full bg-cg-green px-5 py-2 font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-60"
            >
              {busy ? "Creating…" : "Create account"}
            </button>
            {msg && (
              <span
                className={`ml-3 text-sm font-semibold ${msg.ok ? "text-green-600" : "text-red-600"}`}
              >
                {msg.text}
              </span>
            )}
          </div>
        </form>
      </section>
      <RbacProbe />
    </DashboardShell>
  );
}
