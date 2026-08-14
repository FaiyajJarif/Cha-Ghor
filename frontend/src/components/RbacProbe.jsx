import { useEffect, useState } from "react";
import api from "../api/client";

// Live proof that the token + RBAC work: loads GET /me, and lets you hit the
// role-protected ping endpoints to see allow (✓) vs. forbidden (✗ 403).
export default function RbacProbe() {
  const [me, setMe] = useState(null);
  const [meErr, setMeErr] = useState("");
  const [probe, setProbe] = useState({});

  useEffect(() => {
    api
      .get("/me")
      .then((r) => setMe(r.data))
      .catch(() => setMeErr("Failed to load /me"));
  }, []);

  const test = (key, path) => async () => {
    setProbe((p) => ({ ...p, [key]: { status: "loading" } }));
    try {
      const { data } = await api.get(path);
      setProbe((p) => ({ ...p, [key]: { status: "ok", text: String(data) } }));
    } catch (e) {
      setProbe((p) => ({
        ...p,
        [key]: { status: "denied", text: `HTTP ${e?.response?.status ?? "?"}` },
      }));
    }
  };

  const badge = (r) => {
    if (!r) return <span className="text-cg-ink/40">not tested</span>;
    if (r.status === "loading")
      return <span className="text-cg-ink/50">…</span>;
    if (r.status === "ok")
      return <span className="font-semibold text-green-600">✓ {r.text}</span>;
    return <span className="font-semibold text-red-600">✗ {r.text}</span>;
  };

  const Btn = ({ onClick, children }) => (
    <button
      onClick={onClick}
      className="rounded-full bg-cg-green px-4 py-1.5 font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow"
    >
      {children}
    </button>
  );

  return (
    <section className="mt-6 rounded-2xl bg-white p-6 shadow ring-1 ring-cg-green/10">
      <h2 className="font-bold text-cg-ink">Your identity — GET /me</h2>
      {me && (
        <pre className="mt-2 overflow-auto rounded-lg bg-cg-dark p-4 text-xs text-white">
          {JSON.stringify(me, null, 2)}
        </pre>
      )}
      {meErr && <p className="mt-2 text-sm text-red-600">{meErr}</p>}

      <h2 className="mt-6 font-bold text-cg-ink">RBAC test</h2>
      <p className="text-sm text-cg-ink/60">
        Call role-protected endpoints with your token. Admin passes all three;
        supervisor passes supervisor + worker; worker passes worker only.
      </p>
      <div className="mt-3 space-y-2 text-sm">
        <div className="flex items-center gap-3">
          <Btn onClick={test("admin", "/admin/ping")}>GET /admin/ping</Btn>
          {badge(probe.admin)}
        </div>
        <div className="flex items-center gap-3">
          <Btn onClick={test("sup", "/supervisor/ping")}>
            GET /supervisor/ping
          </Btn>
          {badge(probe.sup)}
        </div>
        <div className="flex items-center gap-3">
          <Btn onClick={test("worker", "/worker/ping")}>GET /worker/ping</Btn>
          {badge(probe.worker)}
        </div>
      </div>
    </section>
  );
}
