import { useCallback, useEffect, useState } from "react";
import {
  LuCalendarCheck,
  LuReceipt,
  LuCheckCheck,
  LuTrendingUp,
  LuTrash2,
  LuFileText,
  LuUsers,
} from "react-icons/lu";
import api from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { BTN_DARK, BTN_GHOST } from "../../lib/ui";
import InfoTip from "../../components/admin/InfoTip";
import CaseEvidence from "../../components/admin/CaseEvidence";
import CaseReviewPanel from "../../components/admin/CaseReviewPanel";

// Reports & Complaints — the field-issue inbox. Workers and supervisors submit
// complaints / field reports; the admin reviews, replies and resolves them.
// KPIs (avg response, active count, resolution rate, compliance) come from
// GET /complaints/summary and are computed live on the backend.
const TABS = [
  { key: "all", label: "All" },
  { key: "complaint", label: "Complaints" },
  { key: "report", label: "Reports" },
];

// Show at most this many case cards per page in the left list, so the list
// column stays balanced with the detail panel on the right.
const PAGE_SIZE = 4;

function timeAgo(iso) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

function fmt(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function StatCard({ icon: Icon, label, value, hint }) {
  return (
    <div className="rounded-2xl border border-cg-lime/60 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-cg-dark/60">
          {label}
        </p>
        <span className="grid h-7 w-7 place-items-center rounded-full bg-cg-lime text-cg-green">
          <Icon size={16} />
        </span>
      </div>
      <p className="mt-2 text-2xl font-bold capitalize text-cg-darker">
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-cg-dark/50">{hint}</p> : null}
    </div>
  );
}

const TYPE_BADGE = {
  COMPLAINT: "bg-rose-100 text-rose-700",
  REPORT: "bg-emerald-100 text-emerald-700",
};
const PRIORITY_BADGE = {
  LOW: "bg-slate-100 text-slate-600",
  MEDIUM: "bg-amber-100 text-amber-700",
  HIGH: "bg-orange-100 text-orange-700",
  URGENT: "bg-rose-100 text-rose-700",
};
const STATUS_BADGE = {
  OPEN: "bg-sky-100 text-sky-700",
  IN_PROGRESS: "bg-indigo-100 text-indigo-700",
  RESOLVED: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-slate-200 text-slate-600",
};

function Pill({ map, value }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        map[value] || "bg-slate-100 text-slate-600"
      }`}
    >
      {(value || "").replace("_", " ")}
    </span>
  );
}

export default function Complaints() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [summary, setSummary] = useState(null);
  const [tab, setTab] = useState("all");
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);

  const loadSummary = useCallback(async () => {
    try {
      const { data } = await api.get("/complaints/summary");
      setSummary(data);
    } catch {
      // A KPI failure shouldn't block the inbox itself.
    }
  }, []);

  const loadList = useCallback(async (which) => {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get("/complaints", {
        params: { type: which },
      });
      setItems(data);
      setSelectedId((prev) => {
        if (prev && data.some((d) => d.id === prev)) return prev;
        return data.length ? data[0].id : null;
      });
    } catch {
      setError("Could not load cases. Please try again.");
      setItems([]);
      setSelectedId(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (id) => {
    if (!id) {
      setDetail(null);
      return;
    }
    try {
      const { data } = await api.get(`/complaints/${id}`);
      setDetail(data);
    } catch {
      setDetail(null);
    }
  }, []);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    loadList(tab);
  }, [tab, loadList]);

  useEffect(() => {
    loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  // Reset to the first page whenever the tab changes.
  useEffect(() => {
    setPage(1);
  }, [tab]);

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = items.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  const sendReply = async () => {
    if (!reply.trim() || !selectedId) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/complaints/${selectedId}/replies`, {
        body: reply.trim(),
      });
      setDetail(data);
      setReply("");
      loadSummary();
      loadList(tab);
    } catch {
      setError("Could not send reply.");
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (status) => {
    if (!selectedId) return;
    setBusy(true);
    try {
      const { data } = await api.patch(`/complaints/${selectedId}/status`, {
        status,
      });
      setDetail(data);
      loadSummary();
      loadList(tab);
    } catch {
      setError("Could not update status.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!selectedId) return;
    setBusy(true);
    try {
      await api.delete(`/complaints/${selectedId}`);
      setSelectedId(null);
      setDetail(null);
      loadSummary();
      loadList(tab);
    } catch {
      setError("Could not delete case.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-cg-darker">
            Reports &amp; Complaints
          </h1>
          <InfoTip text="Field issues raised by workers and supervisors. Admins reply and resolve. KPIs are computed live from response and resolution times." />
        </div>
        <p className="text-sm text-cg-dark/60">
          Manage field issues, worker complaints and compliance in one
          centralized system.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={LuCalendarCheck}
          label="Avg Response Time"
          value={summary ? `${summary.avgResponseHours} h` : "—"}
          hint="Submission to first reply"
        />
        <StatCard
          icon={LuReceipt}
          label="Active Issue Count"
          value={summary ? String(summary.activeCount).padStart(2, "0") : "—"}
          hint="Open + in progress"
        />
        <StatCard
          icon={LuCheckCheck}
          label="Resolution Rate"
          value={summary ? `${summary.resolutionRate}%` : "—"}
          hint={
            summary
              ? `${summary.resolvedCount}/${summary.totalCount} resolved`
              : ""
          }
        />
        <StatCard
          icon={LuTrendingUp}
          label="Compliance Status"
          value={summary ? summary.complianceStatus : "—"}
          hint="Based on SLA breaches"
        />
      </div>

      <div className="flex flex-wrap items-start gap-2 rounded-xl border border-dashed border-cg-green/40 bg-cg-lime/20 px-4 py-3 text-sm text-cg-dark/70">
        <span className="font-semibold text-cg-green">
          AI report validation
        </span>
        <span>
          Open any case and use <span className="font-semibold">Review this
          case</span> for auto-triage, duplicate detection, a Bangla/English
          summary and a suggested reply draft.
        </span>
      </div>

      {error ? (
        <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="flex gap-6 border-b border-cg-lime/60">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 pb-2 text-sm font-semibold transition ${
              tab === t.key
                ? "border-cg-green text-cg-darker"
                : "border-transparent text-cg-dark/50 hover:text-cg-dark"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,360px)_1fr]">
        <div className="space-y-3">
          {loading ? (
            <p className="text-sm text-cg-dark/50">Loading…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-cg-dark/50">
              No cases in this view yet.
            </p>
          ) : (
            <>
              {pageItems.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  className={`w-full rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:border-cg-green ${
                    selectedId === c.id
                      ? "border-cg-green ring-1 ring-cg-green/30"
                      : "border-cg-lime/60"
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <Pill map={TYPE_BADGE} value={c.caseType} />
                    <span className="text-[11px] text-cg-dark/40">
                      {timeAgo(c.createdAt)}
                    </span>
                  </div>
                  <p className="line-clamp-2 text-sm font-semibold text-cg-darker">
                    {c.title}
                  </p>
                  {c.preview ? (
                    <p className="mt-1 line-clamp-2 text-xs text-cg-dark/60">
                      {c.preview}
                    </p>
                  ) : null}
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-cg-dark/50">
                      {c.submitterName}
                      {c.submitterRole ? ` · ${c.submitterRole}` : ""}
                    </span>
                    <Pill map={PRIORITY_BADGE} value={c.priority} />
                  </div>
                </button>
              ))}
              {totalPages > 1 ? (
                <div className="mt-1 flex items-center justify-between rounded-xl border border-cg-lime/60 bg-cg-lime/10 px-3 py-2">
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setPage(currentPage - 1)}
                    className={`${BTN_GHOST} disabled:opacity-40`}
                  >
                    Previous
                  </button>
                  <span className="text-xs font-semibold text-cg-dark/60">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() => setPage(currentPage + 1)}
                    className={`${BTN_GHOST} disabled:opacity-40`}
                  >
                    Next
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className="rounded-2xl border border-cg-lime/60 bg-white p-5 shadow-sm">
          {!detail ? (
            <p className="text-sm text-cg-dark/50">
              Select a case to view details.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-cg-lime text-cg-green">
                    <LuUsers size={18} />
                  </span>
                  <div>
                    <p className="font-semibold text-cg-darker">
                      {detail.submitterName || "Unknown"}
                    </p>
                    <p className="text-xs text-cg-dark/50">
                      {[
                        detail.submitterRole,
                        detail.zone ? `Zone ${detail.zone}` : null,
                        detail.workerCode ? `ID ${detail.workerCode}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-1.5">
                  <Pill map={TYPE_BADGE} value={detail.caseType} />
                  <Pill map={PRIORITY_BADGE} value={detail.priority} />
                  <Pill map={STATUS_BADGE} value={detail.status} />
                </div>
              </div>

              <div>
                <h2 className="text-lg font-bold text-cg-darker">
                  {detail.title}
                </h2>
                {detail.category ? (
                  <p className="text-xs text-cg-dark/50">{detail.category}</p>
                ) : null}
              </div>

              <div>
                <p className="mb-1 flex items-center gap-1 text-sm font-semibold text-cg-dark">
                  <LuFileText size={15} /> Issue Summary
                </p>
                <div className="whitespace-pre-wrap rounded-xl bg-cg-lime/20 p-3 text-sm leading-relaxed text-cg-dark/80">
                  {detail.body || "—"}
                </div>
              </div>

              <CaseEvidence
                caseId={detail.id}
                evidenceUrl={detail.evidenceUrl}
                canEdit={isAdmin}
                onChanged={() => loadDetail(detail.id)}
              />

              {isAdmin ? <CaseReviewPanel caseId={detail.id} /> : null}

              <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-cg-dark/50">
                <span>Submitted: {fmt(detail.createdAt)}</span>
                <span>First response: {fmt(detail.firstResponseAt)}</span>
                {detail.status === "RESOLVED" ? (
                  <span>Resolved: {fmt(detail.resolvedAt)}</span>
                ) : null}
              </div>

              <div>
                <p className="mb-2 text-sm font-semibold text-cg-dark">
                  Responses
                </p>
                {detail.replies && detail.replies.length ? (
                  <div className="space-y-2">
                    {detail.replies.map((r) => (
                      <div
                        key={r.id}
                        className="rounded-xl border border-cg-lime/60 bg-cg-lime/10 p-3"
                      >
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-xs font-semibold text-cg-darker">
                            {r.authorName}
                            {r.authorRole ? ` · ${r.authorRole}` : ""}
                          </span>
                          <span className="text-[11px] text-cg-dark/40">
                            {timeAgo(r.createdAt)}
                          </span>
                        </div>
                        <p className="whitespace-pre-wrap text-sm text-cg-dark/80">
                          {r.body}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-cg-dark/40">No responses yet.</p>
                )}
              </div>

              {isAdmin ? (
                <div className="space-y-2 border-t border-cg-lime/60 pt-3">
                  <textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    rows={3}
                    placeholder="Write a response to the worker / supervisor…"
                    className="w-full rounded-xl border border-cg-lime/70 bg-white p-3 text-sm text-cg-dark focus:border-cg-green focus:outline-none"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={busy || !reply.trim()}
                      onClick={sendReply}
                      className={`${BTN_DARK} disabled:opacity-50`}
                    >
                      Send reply
                    </button>
                    <button
                      type="button"
                      disabled={busy || detail.status === "RESOLVED"}
                      onClick={() => setStatus("RESOLVED")}
                      className={`${BTN_GHOST} inline-flex items-center gap-1 disabled:opacity-50`}
                    >
                      <LuCheckCheck size={15} /> Mark resolved
                    </button>
                    {detail.status === "RESOLVED" ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setStatus("IN_PROGRESS")}
                        className={`${BTN_GHOST} disabled:opacity-50`}
                      >
                        Reopen
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setStatus("REJECTED")}
                        className={`${BTN_GHOST} disabled:opacity-50`}
                      >
                        Reject
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={remove}
                      className="ml-auto inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
                    >
                      <LuTrash2 size={15} /> Delete
                    </button>
                  </div>
                </div>
              ) : (
                <p className="border-t border-cg-lime/60 pt-3 text-xs text-cg-dark/40">
                  Only admins can respond to and resolve cases.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
