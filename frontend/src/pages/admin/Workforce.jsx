import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import api from "../../api/client";
import Avatar from "../../components/admin/Avatar";
import {
  LuUserPlus,
  LuPhone,
  LuSearch,
  LuPencil,
  LuTrash2,
  LuX,
  LuUsers,
  LuUserCheck,
  LuGauge,
  LuClipboardList,
  LuFilter,
  LuCheck,
  LuDownload,
  LuCamera,
  LuSparkles,
  LuUpload,
  LuLeaf,
  LuMap,
} from "react-icons/lu";
import { BTN_DARK, BTN_GHOST } from "../../lib/ui";
import { apiError } from "../../lib/apiError";
import { WS_BASE } from "../../lib/config";
import { closeSocket } from "../../lib/ws";
import WorkerMonthModal from "../../components/supervisor/WorkerMonthModal";
import LeafReviewDrawer from "../../components/admin/LeafReviewDrawer";
import FieldManagerModal from "../../components/supervisor/FieldManagerModal";
import { WORKER_LEADERBOARD } from "../../lib/adminSample";
import ChaBot from "../../components/admin/ChaBot";
import { todayISO } from "../../lib/localDate";

const EMPTY = {
  id: null,
  fullName: "",
  nameBn: "",
  phone: "",
  nationalId: "",
  dob: "",
  zoneId: "",
  supervisorId: "",
  joinDate: "",
  dailyWage: 170,
  status: "active",
  jobRole: "plucker",
  createLogin: false,
  username: "",
  password: "",
};

const STATUSES = ["active", "on_leave", "inactive"];
const JOB_ROLES = [
  "plucker",
  "maintenance",
  "sprayer",
  "weeder",
  "factory",
  "other",
];
const ROLE_LABEL = {
  plucker: "Plucker",
  maintenance: "Maintenance",
  sprayer: "Sprayer",
  weeder: "Weeder",
  factory: "Factory",
  other: "Other",
};
const ROLE_PILL = {
  plucker: "bg-cg-lime text-cg-green",
  maintenance: "bg-emerald-100 text-emerald-700",
  sprayer: "bg-sky-100 text-sky-700",
  weeder: "bg-lime-100 text-lime-700",
  factory: "bg-violet-100 text-violet-700",
  other: "bg-gray-100 text-gray-600",
};
const roleLabel = (r) => ROLE_LABEL[r] || "Plucker";
const rolePill = (r) => ROLE_PILL[r] || ROLE_PILL.plucker;
const PAGE_SIZE = 8;

// Attendance pill colours (present / absent / leave).
const ATT_PILL = {
  present: "bg-green-100 text-green-700",
  absent: "bg-red-100 text-red-700",
  leave: "bg-amber-100 text-amber-700",
};
const ATT_CYCLE = { present: "absent", absent: "leave", leave: "present" };

const AVG_PERF = Math.round(
  WORKER_LEADERBOARD.reduce((s, w) => s + w.score, 0) /
    WORKER_LEADERBOARD.length,
);

const FIELD =
  "mt-1 w-full rounded-lg border border-cg-green/20 bg-cg-lime/30 px-3 py-2 text-sm outline-none focus:border-cg-green";

// apiError() is imported from ../../lib/apiError (shared, single source of truth).

function nowTime() {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function prettyDate(iso) {
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// Worker code shown in the sheet, e.g. CG042 (derived from the row id).
function workerCode(id) {
  return "CG" + String(id).padStart(3, "0");
}

function StatCard({ icon: Icon, label, value, sub }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow ring-1 ring-cg-green/10">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-cg-ink/60">{label}</p>
          <p className="mt-1 text-2xl font-extrabold text-cg-ink">{value}</p>
          <p className="mt-1 text-xs text-cg-green">{sub}</p>
        </div>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cg-lime text-cg-green">
          <Icon size={20} />
        </span>
      </div>
    </div>
  );
}

export default function Workforce() {
  const [workers, setWorkers] = useState([]);
  const [meta, setMeta] = useState({ supervisors: [], zones: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState("");
  const [photoPreview, setPhotoPreview] = useState("");
  // AI autofill status for the Add Worker form.
  const [autofill, setAutofill] = useState({ busy: false, msg: "" });

  // Directory filter: choose a field (name / phone / zone) and a value.
  const [filterField, setFilterField] = useState("name");
  const [filterValue, setFilterValue] = useState("");

  // Attendance sheet (right drawer) state.
  const [attOpen, setAttOpen] = useState(false);
  const [attDate, setAttDate] = useState(todayISO());
  const [att, setAtt] = useState({}); // workerId -> status
  const [checkIn, setCheckIn] = useState({}); // workerId -> "06:45 AM"
  const [attSearch, setAttSearch] = useState("");
  const [attZone, setAttZone] = useState("");
  const [attPage, setAttPage] = useState(1);
  const [attSaving, setAttSaving] = useState(false);
  const [attMsg, setAttMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get("/workers");
      setWorkers(data);
    } catch (err) {
      setError(
        apiError(
          err,
          "Could not load workers. Make sure the backend is running and you're signed in as admin or supervisor.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api
      .get("/workers/meta")
      .then(({ data }) => setMeta(data))
      .catch(() => {});
  }, []);

  // Client-side directory filtering by the chosen field.
  const filtered = useMemo(() => {
    const v = filterValue.trim().toLowerCase();
    if (!v) return workers;
    return workers.filter((w) => {
      if (filterField === "phone")
        return (w.phone || "").toLowerCase().includes(v);
      if (filterField === "zone")
        return (w.zoneName || "").toLowerCase().includes(v);
      return (w.fullName || "").toLowerCase().includes(v);
    });
  }, [workers, filterField, filterValue]);

  const openCreate = () => {
    setForm({ ...EMPTY });
    setFormErr("");
    setPhotoPreview("");
    setAutofill({ busy: false, msg: "" });
  };

  const openEdit = (w) => {
    setForm({
      ...EMPTY,
      id: w.id,
      fullName: w.fullName || "",
      nameBn: w.nameBn || "",
      phone: w.phone || "",
      nationalId: w.nationalId || "",
      dob: w.dob || "",
      zoneId: w.zoneId || "",
      supervisorId: w.supervisorId || "",
      joinDate: w.joinDate || "",
      dailyWage: w.dailyWage ?? 170,
      status: w.status || "active",
      jobRole: w.jobRole || "plucker",
    });
    setFormErr("");
    setPhotoPreview(w.photoUrl || "");
  };

  const close = () => {
    setForm(null);
    setPhotoPreview("");
    setAutofill({ busy: false, msg: "" });
  };

  // Local-only preview of the chosen profile photo (upload wiring lands with
  // the media/storage service; the picker + preview are ready now).
  const onPhoto = (e) => {
    const file = e.target.files?.[0];
    if (file) setPhotoPreview(URL.createObjectURL(file));
  };

  // AI autofill: send a PDF/photo of the worker's details to Cha Bot, which
  // reads it and pre-fills the form. The admin still reviews before saving.
  const onAutofill = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    setAutofill({ busy: true, msg: "Reading document\u2026" });
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/chatbot/extract-worker", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const f = data.fields || {};
      // Map an extracted zone name to a zone id from the dropdown, if we can.
      let zoneId = form.zoneId;
      if (f.zoneName) {
        const hit = meta.zones.find(
          (z) => z.label.toLowerCase() === String(f.zoneName).toLowerCase(),
        );
        if (hit) zoneId = hit.id;
      }
      const jobRole = JOB_ROLES.includes(f.jobRole) ? f.jobRole : form.jobRole;
      setForm((cur) => ({
        ...cur,
        fullName: f.fullName ?? cur.fullName,
        nameBn: f.nameBn ?? cur.nameBn,
        phone: f.phone ?? cur.phone,
        nationalId: f.nationalId ?? cur.nationalId,
        dob: f.dob ?? cur.dob,
        joinDate: f.joinDate ?? cur.joinDate,
        dailyWage: f.dailyWage ?? cur.dailyWage,
        zoneId,
        jobRole,
      }));
      const warn = (data.warnings || []).join(" ");
      setAutofill({
        busy: false,
        msg: `Filled from document \u2014 please review${warn ? ": " + warn : "."}`,
      });
    } catch (err) {
      setAutofill({
        busy: false,
        msg: apiError(
          err,
          "Could not read the document. Please fill the form manually.",
        ),
      });
    }
  };

  const set = (k) => (e) => {
    const v = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [k]: v }));
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormErr("");
    const body = {
      fullName: form.fullName,
      nameBn: form.nameBn || null,
      phone: form.phone || null,
      nationalId: form.nationalId || null,
      dob: form.dob || null,
      zoneId: form.zoneId ? Number(form.zoneId) : null,
      supervisorId: form.supervisorId ? Number(form.supervisorId) : null,
      joinDate: form.joinDate || null,
      dailyWage: form.dailyWage ? Number(form.dailyWage) : null,
      status: form.status,
      jobRole: form.jobRole,
      createLogin: !form.id && form.createLogin,
      username: form.username || null,
      password: form.password || null,
    };
    try {
      if (form.id) await api.put(`/workers/${form.id}`, body);
      else await api.post("/workers", body);
      close();
      load();
    } catch (err) {
      setFormErr(apiError(err, "Could not save the worker."));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (w) => {
    if (
      !window.confirm(
        `Remove ${w.fullName}? They will be archived (soft-deleted) and hidden from the workforce.`,
      )
    )
      return;
    try {
      await api.delete(`/workers/${w.id}`);
      load();
    } catch (err) {
      // With FK RESTRICT (Phase 0) a worker with linked payroll/loan/withdrawal
      // rows can't be deleted; surface a clear reason instead of a generic error.
      alert(
        apiError(
          err,
          "Could not remove this worker — they may have payroll, loan, or withdrawal records linked.",
        ),
      );
    }
  };

  // ---- Attendance sheet ----
  const openSheet = () => {
    setAttMsg("");
    setAttSearch("");
    setAttZone("");
    setAttPage(1);
    setAttOpen(true);
    loadAttendance(attDate);
  };

  // Live attendance.
  //
  // A supervisor marking the register in the field pushes an "attendance.saved"
  // frame; this board refetches so the admin sees it without reloading. Held in
  // a ref because loadAttendance is recreated whenever `workers` changes, and
  // depending on it directly would tear the socket down and rebuild it.
  const attRef = useRef(null);
  const [attLive, setAttLive] = useState(false);
  // Which worker's monthly attendance is open. Null = closed.
  const [monthFor, setMonthFor] = useState(null);
  // Admin review of the weigh-ins the payroll surplus is built from.
  const [leafOpen, setLeafOpen] = useState(false);
  // Field targets, names and retirement. Admin-only on the server, so this is
  // where it belongs — it was reachable only from the supervisor console,
  // which 403'd on every action.
  const [fieldsOpen, setFieldsOpen] = useState(false);

  useEffect(() => {
    let retry;
    let closedByUs = false;
    let ws;
    const url =
      (typeof import.meta !== "undefined" &&
        import.meta.env &&
        import.meta.env.VITE_WS_URL) ||
      `${WS_BASE}/ws/notifications`;

    const connect = () => {
      try {
        ws = new WebSocket(url);
      } catch {
        return; // blocked URL — the board still works, just not live
      }
      ws.onopen = () => setAttLive(true);
      ws.onmessage = (e) => {
        let kind = "";
        try {
          kind = JSON.parse(e.data)?.kind || "";
        } catch {
          return;
        }
        // Only attendance frames. Refetching on every unrelated notification
        // would hammer the API for nothing.
        if (kind === "attendance.saved" && attRef.current) {
          attRef.current();
        }
      };
      ws.onerror = () => ws.close();
      ws.onclose = () => {
        setAttLive(false);
        if (!closedByUs) retry = setTimeout(connect, 5000);
      };
    };
    connect();
    return () => {
      closedByUs = true;
      clearTimeout(retry);
      closeSocket(ws);
    };
  }, []);

  const loadAttendance = useCallback(
    async (date) => {
      // Default everyone to absent (matches the sheet's default), then apply
      // whatever was already saved for that day.
      const base = Object.fromEntries(workers.map((w) => [w.id, "absent"]));
      const times = {};
      try {
        const { data } = await api.get("/attendance", { params: { date } });
        for (const r of data) {
          base[r.workerId] = r.status;
          if (r.status === "present") times[r.workerId] = "—";
        }
      } catch {
        // no saved data yet (or endpoint unreachable) — start from all-absent
      }
      setAtt(base);
      setCheckIn(times);
    },
    [workers],
  );

  // Keep the socket handler pointed at the current loader and date without
  // making the socket itself depend on either.
  useEffect(() => {
    attRef.current = () => loadAttendance(attDate);
  }, [loadAttendance, attDate]);

  const setStatus = (id, status) => {
    setAtt((a) => ({ ...a, [id]: status }));
    setCheckIn((c) => {
      const next = { ...c };
      if (status === "present")
        next[id] = next[id] && next[id] !== "—" ? next[id] : nowTime();
      else delete next[id];
      return next;
    });
  };

  const cycleStatus = (id) => setStatus(id, ATT_CYCLE[att[id] || "absent"]);

  const markAllPresent = () => {
    setAtt(Object.fromEntries(workers.map((w) => [w.id, "present"])));
    setCheckIn(Object.fromEntries(workers.map((w) => [w.id, nowTime()])));
  };

  const countBy = (key) =>
    workers.filter((w) => (att[w.id] || "absent") === key).length;
  const presentCount = countBy("present");

  const attFiltered = useMemo(() => {
    const v = attSearch.trim().toLowerCase();
    return workers.filter((w) => {
      const matchesText =
        !v ||
        (w.fullName || "").toLowerCase().includes(v) ||
        workerCode(w.id).toLowerCase().includes(v);
      const matchesZone = !attZone || (w.zoneName || "") === attZone;
      return matchesText && matchesZone;
    });
  }, [workers, attSearch, attZone]);

  const attTotalPages = Math.max(1, Math.ceil(attFiltered.length / PAGE_SIZE));
  const attPageSafe = Math.min(attPage, attTotalPages);
  const attRows = attFiltered.slice(
    (attPageSafe - 1) * PAGE_SIZE,
    attPageSafe * PAGE_SIZE,
  );
  const attZones = useMemo(
    () => [...new Set(workers.map((w) => w.zoneName).filter(Boolean))].sort(),
    [workers],
  );

  const saveAttendance = async () => {
    setAttSaving(true);
    setAttMsg("");
    const entries = workers.map((w) => ({
      workerId: w.id,
      status: att[w.id] || "absent",
    }));
    try {
      await api.post("/attendance/bulk", { date: attDate, entries });
      setAttMsg("Attendance saved.");
    } catch (err) {
      setAttMsg(apiError(err, "Could not save attendance."));
    } finally {
      setAttSaving(false);
    }
  };

  const exportCsv = () => {
    const header = ["Code", "Name", "Role", "Zone", "Status", "Check-in"];
    const lines = [header];
    workers.forEach((w) => {
      const st = att[w.id] || "absent";
      lines.push([
        workerCode(w.id),
        w.fullName || "",
        roleLabel(w.jobRole),
        w.zoneName || "",
        st,
        st === "present" ? checkIn[w.id] || nowTime() : "",
      ]);
    });
    const csv = lines
      .map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance-${attDate}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const allPresent =
    workers.length > 0 && workers.every((w) => att[w.id] === "present");

  return (
    <div className="space-y-5">
      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          icon={LuUsers}
          label="Total workers"
          value={workers.length}
          sub="In the directory"
        />
        <StatCard
          icon={LuUserCheck}
          label="Active today"
          value={attOpen ? presentCount : "—"}
          sub={attOpen ? "Marked present" : "Open the sheet to mark"}
        />
        <StatCard
          icon={LuGauge}
          label="Avg performance"
          value={`${AVG_PERF} / 100`}
          sub="Blended score (sample)"
        />
      </div>

      {/* Worker directory: C0F28B header bar (title + filter) + table + D3FFAC footer bar */}
      <section className="overflow-hidden rounded-2xl bg-white shadow ring-1 ring-cg-green/10">
        <div className="flex flex-wrap items-center justify-between gap-3 bg-[#c0f28b] px-5 py-3">
          <div>
            <h2 className="font-bold text-cg-ink">Worker directory</h2>
            <p className="text-xs text-cg-ink/70">
              Live from the workers table — admin can add / edit, supervisors
              can view.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-lg bg-white/70 ring-1 ring-cg-dark/10">
              <span className="pl-2 text-cg-ink/50">
                <LuFilter size={15} />
              </span>
              <select
                value={filterField}
                onChange={(e) => {
                  setFilterField(e.target.value);
                  setFilterValue("");
                }}
                className="bg-transparent py-2 pl-1 pr-1 text-sm font-semibold text-cg-ink outline-none"
              >
                <option value="name">Name</option>
                <option value="phone">Phone</option>
                <option value="zone">Zone</option>
              </select>
              {filterField === "zone" ? (
                <select
                  value={filterValue}
                  onChange={(e) => setFilterValue(e.target.value)}
                  className="rounded-r-lg bg-transparent py-2 pl-2 pr-3 text-sm outline-none"
                >
                  <option value="">All zones</option>
                  {attZones.map((z) => (
                    <option key={z} value={z}>
                      {z}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={filterValue}
                  onChange={(e) => setFilterValue(e.target.value)}
                  placeholder={`Filter by ${filterField}…`}
                  className="w-44 rounded-r-lg bg-transparent py-2 pl-2 pr-3 text-sm outline-none"
                />
              )}
            </div>
            <button onClick={openSheet} className={BTN_DARK}>
              <LuClipboardList size={16} /> Attendance sheet
            </button>
            <button
              type="button"
              onClick={() => setLeafOpen(true)}
              className={BTN_GHOST}
              title="Review the weigh-ins that feed the payroll surplus"
            >
              <LuLeaf size={16} /> Leaf collection
            </button>
            <button
              type="button"
              onClick={() => setFieldsOpen(true)}
              className={BTN_GHOST}
              title="Add, rename or retire fields, and set each field's daily target"
            >
              <LuMap size={16} /> Fields & targets
            </button>
            <button onClick={openCreate} className={BTN_DARK}>
              <LuUserPlus size={16} /> Add worker
            </button>
          </div>
        </div>

        {error && (
          <p className="mx-5 mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
            {error}
          </p>
        )}

        <div className="overflow-x-auto px-5 pt-4">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-cg-green/10 text-cg-ink/60">
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Phone</th>
                <th className="py-2 pr-4">Zone</th>
                <th className="py-2 pr-4">Role</th>
                <th className="py-2 pr-4">Supervisor</th>
                <th className="py-2 pr-4">Daily wage</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-cg-ink/50">
                    Loading workers…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-cg-ink/50">
                    {workers.length === 0
                      ? "No workers yet. Click “Add worker” to create the first one."
                      : "No workers match this filter."}
                  </td>
                </tr>
              ) : (
                filtered.map((w) => (
                  <tr key={w.id} className="border-b border-cg-green/5">
                    <td className="py-2 pr-4 font-medium text-cg-ink">
                      {/* Opens this worker's month: present / late / absent,
                          and the days nobody marked at all. */}
                      <button
                        type="button"
                        onClick={() => setMonthFor({ id: w.id, name: w.fullName })}
                        title={`See ${w.fullName}'s attendance this month`}
                        className="underline decoration-cg-green/30 underline-offset-2 hover:decoration-cg-green"
                      >
                        {w.fullName}
                      </button>
                      {w.username && (
                        <span className="ml-2 rounded bg-cg-lime px-1.5 py-0.5 text-[10px] font-semibold text-cg-green">
                          @{w.username}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      {w.phone ? (
                        <span className="inline-flex items-center gap-1 text-cg-ink/80">
                          <LuPhone size={13} /> {w.phone}
                        </span>
                      ) : (
                        <span className="text-cg-ink/30">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      {w.zoneName || <span className="text-cg-ink/30">—</span>}
                    </td>
                    <td className="py-2 pr-4">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${rolePill(w.jobRole)}`}
                      >
                        {roleLabel(w.jobRole)}
                      </span>
                    </td>
                    <td className="py-2 pr-4">
                      {w.supervisorName || (
                        <span className="text-cg-ink/30">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-4">৳ {w.dailyWage}</td>
                    <td className="py-2 pr-4">
                      <span className="rounded-full bg-cg-lime px-2 py-0.5 text-xs font-semibold text-cg-green">
                        {w.status}
                      </span>
                    </td>
                    <td className="py-2 pr-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEdit(w)}
                          aria-label="Edit"
                          className="rounded-lg p-1.5 text-cg-ink/60 hover:bg-cg-lime hover:text-cg-green"
                        >
                          <LuPencil size={15} />
                        </button>
                        <button
                          onClick={() => remove(w)}
                          aria-label="Remove"
                          className="rounded-lg p-1.5 text-cg-ink/60 hover:bg-red-50 hover:text-red-600"
                        >
                          <LuTrash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between bg-[#d3ffac] px-5 py-2 text-sm text-cg-ink/70">
          <span>
            Showing <b className="text-cg-ink">{filtered.length}</b> of{" "}
            <b className="text-cg-ink">{workers.length}</b> workers
          </span>
          {filterValue && (
            <button
              onClick={() => setFilterValue("")}
              className="font-semibold text-cg-dark hover:underline"
            >
              Clear filter
            </button>
          )}
        </div>
      </section>

      {/* Create / edit worker modal (rendered in a portal) */}
      {form &&
        createPortal(
          <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/40 p-4">
            <div className="my-8 w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
              <div className="flex items-start justify-between gap-4 bg-cg-dark px-6 py-5 text-white">
                <div>
                  <h3 className="text-xl font-extrabold">
                    {form.id ? "Edit Worker" : "New Worker Enrollment"}
                  </h3>
                  <p className="mt-0.5 text-sm text-white/70">
                    {form.id
                      ? "Update this worker's profile and assignment"
                      : "Register a new member to the estate workforce"}
                  </p>
                </div>
                <button
                  onClick={close}
                  aria-label="Close"
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
                >
                  <LuX size={18} />
                </button>
              </div>

              <form
                onSubmit={save}
                className="grid gap-6 p-6 md:grid-cols-[190px,1fr]"
              >
                {/* Profile photo */}
                <div className="flex flex-col items-center gap-2 text-center">
                  <p className="text-sm font-bold text-cg-green">
                    Profile Photo
                  </p>
                  <label className="grid h-36 w-36 cursor-pointer place-items-center overflow-hidden rounded-full border-2 border-dashed border-cg-green/40 bg-cg-lime/30 text-cg-green transition hover:bg-cg-lime/60">
                    {photoPreview ? (
                      <img
                        src={photoPreview}
                        alt="Preview"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="flex flex-col items-center gap-1 px-3">
                        <LuCamera size={26} />
                        <span className="text-xs text-cg-ink/50">
                          Click or drag to upload
                        </span>
                      </span>
                    )}
                    <input
                      type="file"
                      accept="image/png,image/jpeg"
                      className="hidden"
                      onChange={onPhoto}
                    />
                  </label>
                  <p className="text-xs text-cg-ink/40">JPG or PNG, max 5MB</p>
                </div>

                {/* Fields */}
                <div className="grid gap-3 sm:grid-cols-2">
                  {!form.id && (
                    <div className="sm:col-span-2 rounded-xl border border-dashed border-cg-green/40 bg-cg-lime/20 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="flex items-center gap-1.5 text-sm font-bold text-cg-green">
                            <LuSparkles size={15} /> AI autofill
                          </p>
                          <p className="text-xs text-cg-ink/60">
                            Upload a PDF or photo of the worker's details — Cha
                            Bot fills the form, you review.
                          </p>
                        </div>
                        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-cg-dark px-3 py-2 text-sm font-semibold text-white hover:bg-cg-darker">
                          <LuUpload size={15} />
                          {autofill.busy ? "Reading\u2026" : "Upload document"}
                          <input
                            type="file"
                            accept="application/pdf,image/png,image/jpeg"
                            className="hidden"
                            disabled={autofill.busy}
                            onChange={onAutofill}
                          />
                        </label>
                      </div>
                      {autofill.msg && (
                        <p className="mt-2 rounded-lg bg-white/70 px-2.5 py-1.5 text-xs text-cg-ink/70">
                          {autofill.msg}
                        </p>
                      )}
                    </div>
                  )}
                  <label className="text-sm text-cg-ink/70">
                    Full name *
                    <input
                      value={form.fullName}
                      onChange={set("fullName")}
                      required
                      className={FIELD}
                    />
                  </label>
                  <label className="text-sm text-cg-ink/70">
                    Name (Bangla)
                    <input
                      value={form.nameBn}
                      onChange={set("nameBn")}
                      className={FIELD}
                    />
                  </label>
                  <label className="text-sm text-cg-ink/70">
                    Phone
                    <input
                      value={form.phone}
                      onChange={set("phone")}
                      placeholder="+8801XXXXXXXXX"
                      className={FIELD}
                    />
                  </label>
                  <label className="text-sm text-cg-ink/70">
                    National ID
                    <input
                      value={form.nationalId}
                      onChange={set("nationalId")}
                      className={FIELD}
                    />
                  </label>
                  <label className="text-sm text-cg-ink/70">
                    Zone
                    <select
                      value={form.zoneId}
                      onChange={set("zoneId")}
                      className={FIELD}
                    >
                      <option value="">— Unassigned —</option>
                      {meta.zones.map((z) => (
                        <option key={z.id} value={z.id}>
                          {z.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm text-cg-ink/70">
                    Supervisor
                    <select
                      value={form.supervisorId}
                      onChange={set("supervisorId")}
                      className={FIELD}
                    >
                      <option value="">— Unassigned —</option>
                      {meta.supervisors.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm text-cg-ink/70">
                    Date of birth
                    <input
                      type="date"
                      value={form.dob}
                      onChange={set("dob")}
                      className={FIELD}
                    />
                  </label>
                  <label className="text-sm text-cg-ink/70">
                    Join date
                    <input
                      type="date"
                      value={form.joinDate}
                      onChange={set("joinDate")}
                      className={FIELD}
                    />
                  </label>
                  <label className="text-sm text-cg-ink/70">
                    Daily wage (৳)
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={form.dailyWage}
                      onChange={set("dailyWage")}
                      className={FIELD}
                    />
                  </label>
                  <label className="text-sm text-cg-ink/70">
                    Status
                    <select
                      value={form.status}
                      onChange={set("status")}
                      className={FIELD}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm text-cg-ink/70">
                    Job role
                    <select
                      value={form.jobRole}
                      onChange={set("jobRole")}
                      className={FIELD}
                    >
                      {JOB_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </select>
                  </label>

                  {!form.id && (
                    <div className="rounded-xl bg-cg-lime/40 p-3 sm:col-span-2">
                      <label className="flex items-center gap-2 text-sm font-semibold text-cg-ink">
                        <input
                          type="checkbox"
                          checked={form.createLogin}
                          onChange={set("createLogin")}
                        />
                        Also create a worker login account
                      </label>
                      {form.createLogin && (
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <label className="text-sm text-cg-ink/70">
                            Login username
                            <input
                              value={form.username}
                              onChange={set("username")}
                              className={FIELD}
                            />
                          </label>
                          <label className="text-sm text-cg-ink/70">
                            Password (min 6)
                            <input
                              type="password"
                              value={form.password}
                              onChange={set("password")}
                              className={FIELD}
                            />
                          </label>
                        </div>
                      )}
                    </div>
                  )}

                  {formErr && (
                    <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200 sm:col-span-2">
                      {formErr}
                    </p>
                  )}
                </div>

                <div className="-mx-6 -mb-6 flex justify-end gap-2 border-t border-cg-green/10 px-6 py-4 md:col-span-2">
                  <button type="button" onClick={close} className={BTN_GHOST}>
                    Cancel
                  </button>
                  <button disabled={saving} className={BTN_DARK}>
                    {saving
                      ? "Saving…"
                      : form.id
                        ? "Save changes"
                        : "Add Worker"}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body,
        )}

      {/* Attendance sheet — full-height drawer from the right (portal => flush to top) */}
      {attOpen &&
        createPortal(
          <div className="fixed inset-0 z-[70] flex">
            <div
              className="flex-1 bg-black/40"
              onClick={() => setAttOpen(false)}
            />
            <div className="flex h-full w-full flex-col overflow-hidden rounded-l-2xl bg-white shadow-2xl md:w-[70%]">
              {/* Header */}
              <div className="flex shrink-0 items-center justify-between gap-3 px-6 py-4">
                <div>
                  <h3 className="flex flex-wrap items-center gap-2 text-xl font-extrabold text-cg-ink">
                    Daily Attendance
                    {/* Reflects the real socket. When it says Live, a mark made
                        by a supervisor in the field lands here on its own. */}
                    <span
                      title={
                        attLive
                          ? "Connected. Marks saved by supervisors appear here as they happen."
                          : "Not connected. The register is still correct, it just will not update on its own."
                      }
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                        attLive
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      <span
                        className={`h-2 w-2 rounded-full ${
                          attLive ? "animate-pulse bg-emerald-500" : "bg-slate-400"
                        }`}
                      />
                      {attLive ? "Live" : "Offline"}
                    </span>
                  </h3>
                  <p className="text-sm text-cg-ink/60">
                    {prettyDate(attDate)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={exportCsv}
                    disabled={workers.length === 0}
                    className={BTN_GHOST}
                  >
                    <LuDownload size={16} /> Export
                  </button>
                  <button
                    onClick={markAllPresent}
                    className="inline-flex items-center gap-2 rounded-lg bg-cg-lime px-4 py-2 text-sm font-semibold text-cg-ink transition hover:bg-cg-lime/70"
                  >
                    <LuCheck size={16} /> Mark All Present
                  </button>
                  <button
                    onClick={saveAttendance}
                    disabled={attSaving || workers.length === 0}
                    className={BTN_DARK}
                  >
                    {attSaving ? "Saving…" : "Save Attendance"}
                  </button>
                  <button
                    onClick={() => setAttOpen(false)}
                    aria-label="Close"
                    className="grid h-9 w-9 place-items-center rounded-full bg-cg-dark text-white transition hover:bg-cg-darker"
                  >
                    <LuX size={18} />
                  </button>
                </div>
              </div>

              {/* Filters */}
              <div className="flex shrink-0 flex-wrap items-center gap-3 px-6 pb-4">
                <div className="relative flex-1">
                  <LuSearch
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-cg-ink/40"
                    size={15}
                  />
                  <input
                    value={attSearch}
                    onChange={(e) => {
                      setAttSearch(e.target.value);
                      setAttPage(1);
                    }}
                    placeholder="Search workers…"
                    className="w-full rounded-lg bg-cg-lime/40 py-2 pl-9 pr-3 text-sm outline-none ring-1 ring-cg-green/20 focus:ring-cg-green"
                  />
                </div>
                <select
                  value={attZone}
                  onChange={(e) => {
                    setAttZone(e.target.value);
                    setAttPage(1);
                  }}
                  className="rounded-lg bg-cg-lime/40 px-3 py-2 text-sm outline-none ring-1 ring-cg-green/20 focus:ring-cg-green"
                >
                  <option value="">All Zones</option>
                  {attZones.map((z) => (
                    <option key={z} value={z}>
                      {z}
                    </option>
                  ))}
                </select>
                <div className="flex gap-3 text-sm text-cg-ink/70">
                  <span>
                    Present:{" "}
                    <b className="text-green-700">{countBy("present")}</b>
                  </span>
                  <span>
                    Absent: <b className="text-red-600">{countBy("absent")}</b>
                  </span>
                  <span>
                    Leave: <b className="text-amber-600">{countBy("leave")}</b>
                  </span>
                </div>
              </div>

              {/* Table */}
              <div className="flex-1 overflow-y-auto px-6">
                {workers.length === 0 ? (
                  <p className="py-10 text-center text-sm text-cg-ink/50">
                    No workers to mark yet.
                  </p>
                ) : (
                  <table className="w-full overflow-hidden rounded-xl text-left text-sm">
                    <thead>
                      <tr className="bg-cg-dark text-xs uppercase tracking-wide text-white">
                        <th className="w-10 py-3 pl-4">
                          <input
                            type="checkbox"
                            checked={allPresent}
                            onChange={(e) =>
                              e.target.checked
                                ? markAllPresent()
                                : setAtt(
                                    Object.fromEntries(
                                      workers.map((w) => [w.id, "absent"]),
                                    ),
                                  )
                            }
                          />
                        </th>
                        <th className="py-3 pr-4">Worker</th>
                        <th className="py-3 pr-4">Role</th>
                        <th className="py-3 pr-4">Zone</th>
                        <th className="py-3 pr-4">Status</th>
                        <th className="py-3 pr-4">Check-in Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attRows.map((w) => {
                        const st = att[w.id] || "absent";
                        return (
                          <tr
                            key={w.id}
                            className="border-b border-cg-green/10"
                          >
                            <td className="py-3 pl-4">
                              <input
                                type="checkbox"
                                checked={st === "present"}
                                onChange={(e) =>
                                  setStatus(
                                    w.id,
                                    e.target.checked ? "present" : "absent",
                                  )
                                }
                              />
                            </td>
                            <td className="py-3 pr-4">
                              <div className="flex items-center gap-3">
                                <Avatar name={w.fullName} size={34} />
                                <div className="leading-tight">
                                  <p className="font-semibold text-cg-ink">
                                    {w.fullName}
                                  </p>
                                  <p className="text-xs text-cg-ink/50">
                                    {workerCode(w.id)}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 pr-4">
                              <span
                                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${rolePill(w.jobRole)}`}
                              >
                                {roleLabel(w.jobRole)}
                              </span>
                            </td>
                            <td className="py-3 pr-4 text-cg-ink/70">
                              {w.zoneName || "—"}
                            </td>
                            <td className="py-3 pr-4">
                              <button
                                onClick={() => cycleStatus(w.id)}
                                title="Click to change status"
                                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${ATT_PILL[st]}`}
                              >
                                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                                {st.toUpperCase()}
                              </button>
                            </td>
                            <td className="py-3 pr-4 text-cg-ink/70">
                              {st === "present"
                                ? checkIn[w.id] || nowTime()
                                : "—"}
                            </td>
                          </tr>
                        );
                      })}
                      {attRows.length === 0 && (
                        <tr>
                          <td
                            colSpan={6}
                            className="py-8 text-center text-cg-ink/50"
                          >
                            No workers match this filter.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}
                {attMsg && (
                  <p className="my-3 rounded-lg bg-cg-lime/50 px-3 py-2 text-sm text-cg-ink/80">
                    {attMsg}
                  </p>
                )}
              </div>

              {/* Footer / pagination bar */}
              <div className="flex shrink-0 items-center justify-between bg-cg-dark px-6 py-3 text-sm text-white">
                <span className="text-white/70">
                  {attFiltered.length} worker
                  {attFiltered.length === 1 ? "" : "s"}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setAttPage((p) => Math.max(1, p - 1))}
                    disabled={attPageSafe <= 1}
                    className="grid h-8 w-8 place-items-center rounded-md bg-white/10 disabled:opacity-40"
                  >
                    ‹
                  </button>
                  {Array.from({ length: attTotalPages }, (_, i) => i + 1).map(
                    (p) => (
                      <button
                        key={p}
                        onClick={() => setAttPage(p)}
                        className={`grid h-8 w-8 place-items-center rounded-md text-sm font-semibold ${
                          p === attPageSafe
                            ? "bg-white text-cg-dark"
                            : "bg-white/10 text-white"
                        }`}
                      >
                        {p}
                      </button>
                    ),
                  )}
                  <button
                    onClick={() =>
                      setAttPage((p) => Math.min(attTotalPages, p + 1))
                    }
                    disabled={attPageSafe >= attTotalPages}
                    className="grid h-8 w-8 place-items-center rounded-md bg-white/10 disabled:opacity-40"
                  >
                    ›
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}

      <FieldManagerModal
        // This page is behind an admin route, and the daily target is an admin
        // decision. The prop defaults to false so the supervisor's copy of this
        // modal cannot show an input that would 403 on save.
        canSetTarget
        open={fieldsOpen}
        onClose={() => setFieldsOpen(false)}
        onChanged={load}
      />

      <LeafReviewDrawer open={leafOpen} onClose={() => setLeafOpen(false)} />

      <WorkerMonthModal
        open={!!monthFor}
        workerId={monthFor?.id}
        workerName={monthFor?.name}
        onClose={() => setMonthFor(null)}
      />
    </div>
  );
}
