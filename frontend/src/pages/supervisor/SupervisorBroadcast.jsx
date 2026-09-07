import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  LuMessageSquare,
  LuMailOpen,
  LuTriangleAlert,
  LuCircleCheck,
  LuCheckCheck,
  LuHistory,
  LuBellRing,
  LuPlus,
  LuSearch,
  LuChevronLeft,
  LuChevronRight,
  LuUser,
} from "react-icons/lu";
import api from "../../api/client";
import { apiError } from "../../lib/apiError";
import { BTN_DARK } from "../../lib/ui";
import { WS_BASE } from "../../lib/config";
import { closeSocket } from "../../lib/ws";
import InfoTip from "../../components/admin/InfoTip";
import BroadcastComposer from "../../components/supervisor/BroadcastComposer";

// Same socket the notification bell uses. One endpoint, so there is nothing
// extra to configure or deploy; frames are discriminated by `kind`.
const WS_URL =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_WS_URL) ||
  `${WS_BASE}/ws/notifications`;

// Broadcast — one shared feed for everything the estate needs to know.
//
// Backed by the live FieldCase module: GET /complaints for the feed, and
// POST /complaints to send. Both already allow supervisors, so this screen
// needed no permission change and no migration.
//
// Anything sent here is readable by every supervisor and by the admin, which is
// the point — a field condition entered once reaches everyone, instead of
// living in one person's head or one WhatsApp thread.
//
// UNREAD is tracked in this browser, not on the server. There is no read-receipt
// table, so "unread" means "arrived since you last opened this screen on this
// device". The tooltip says so rather than implying a synced inbox.

const CARD_STROKE = "ring-1 ring-[#13483B59]";
const CARD = `rounded-2xl bg-white p-5 shadow ${CARD_STROKE}`;
const PAGE_SIZE = 6;
const SEEN_KEY = "chaghor.broadcast.lastOpened";

const PRIORITY_PILL = {
  URGENT: "bg-rose-100 text-rose-700",
  HIGH: "bg-amber-100 text-amber-800",
  MEDIUM: "bg-sky-100 text-sky-700",
  LOW: "bg-emerald-100 text-emerald-700",
};

const STATUS_PILL = {
  OPEN: "bg-rose-50 text-rose-700 ring-1 ring-rose-200",
  IN_PROGRESS: "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
  RESOLVED: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  REJECTED: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
};

const TYPE_PILL = {
  COMPLAINT: "bg-rose-100 text-rose-700",
  REPORT: "bg-cg-lime text-cg-green",
};

function ago(iso) {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const mins = Math.floor((Date.now() - t) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days < 30 ? `${days}d ago` : new Date(iso).toLocaleDateString("en-GB");
}

function stamp(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Kpi({ icon: Icon, label, value, pill, pillTone, sub }) {
  return (
    <div className={CARD}>
      <div className="flex items-start justify-between">
        <p className="max-w-[8rem] text-xs font-bold uppercase leading-tight tracking-wide text-cg-ink/50">
          {label}
        </p>
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-cg-lime text-cg-green">
          <Icon size={18} />
        </span>
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <p className="text-3xl font-extrabold text-cg-ink">{value}</p>
        {pill ? (
          <span
            className={`mb-1 rounded-full px-2.5 py-1 text-[10px] font-bold ${
              pillTone || "bg-cg-lime text-cg-green"
            }`}
          >
            {pill}
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-cg-ink/50">{sub || " "}</p>
    </div>
  );
}

function Empty({ children, height = 200 }) {
  return (
    <div
      className="grid place-items-center rounded-xl border border-dashed border-[#13483B59] px-6 text-center text-sm text-cg-ink/50"
      style={{ minHeight: height }}
    >
      {children}
    </div>
  );
}

export default function SupervisorBroadcast() {
  const navigate = useNavigate();
  const location = useLocation();

  const [cases, setCases] = useState([]);
  const [summary, setSummary] = useState(null);
  const [zones, setZones] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("all"); // all | report | complaint | urgent
  const [page, setPage] = useState(0);
  const [composeOpen, setComposeOpen] = useState(false);
  const [prefill, setPrefill] = useState(null);
  const [dismissed, setDismissed] = useState([]);
  const [live, setLive] = useState(false);

  // "Unread" baseline for this browser. Read once on mount so the count does
  // not drop to zero the instant the page paints.
  const [seenAt, setSeenAt] = useState(() => {
    try {
      return Number(window.localStorage.getItem(SEEN_KEY)) || 0;
    } catch {
      return 0; // private mode / storage disabled — everything reads as unread
    }
  });

  const load = useCallback(async () => {
    const [list, sum, zn] = await Promise.all([
      api.get("/complaints"),
      api.get("/complaints/summary"),
      api.get("/zones").catch(() => ({ data: [] })),
    ]);
    setCases(list.data || []);
    setSummary(sum.data || null);
    setZones(zn.data || []);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    load()
      .catch(
        (err) => active && setError(apiError(err, "Could not load the messages.")),
      )
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [load]);

  // Live updates.
  //
  // The socket is long-lived but `load` is recreated on every render, so the
  // handler reads it from a ref. Without this the connection would be torn down
  // and rebuilt on each render, which is how you get a reconnect loop.
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => {
    let retry;
    let closedByUs = false;
    let ws;

    const connect = () => {
      try {
        ws = new WebSocket(WS_URL);
      } catch {
        return; // blocked URL — the page still works, just not live
      }
      ws.onopen = () => setLive(true);
      ws.onmessage = (e) => {
        let kind = "";
        try {
          kind = JSON.parse(e.data)?.kind || "";
        } catch {
          return; // not JSON we understand
        }
        // Only refetch for frames about cases. Anything else on this socket --
        // a payroll notice, a supply update -- is none of this board's business
        // and refetching on it would hammer the API for nothing.
        if (kind.startsWith("case.")) {
          loadRef.current().catch(() => {
            // A dropped refresh is not worth an error banner; the next frame
            // or a manual reload recovers it.
          });
        }
      };
      ws.onerror = () => ws.close();
      ws.onclose = () => {
        setLive(false);
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

  // The weather screen navigates here with a prefilled message. Consume it once
  // and clear it from history, so a refresh does not reopen the composer.
  useEffect(() => {
    const incoming = location.state?.compose;
    if (!incoming) return;
    setPrefill(incoming);
    setComposeOpen(true);
    navigate(location.pathname, { replace: true, state: null });
  }, [location, navigate]);

  // Load the detail thread for whichever message is open.
  useEffect(() => {
    if (!selected) {
      setDetail(null);
      return undefined;
    }
    let active = true;
    setDetail(null);
    api
      .get(`/complaints/${selected}`)
      .then((r) => active && setDetail(r.data))
      .catch((err) => active && setError(apiError(err, "Could not open that message.")));
    return () => {
      active = false;
    };
  }, [selected]);

  const isUnread = useCallback(
    (c) => {
      const t = new Date(c.createdAt).getTime();
      return !Number.isNaN(t) && t > seenAt;
    },
    [seenAt],
  );

  const markAllRead = () => {
    const now = Date.now();
    try {
      window.localStorage.setItem(SEEN_KEY, String(now));
    } catch {
      // Storage unavailable — the count still clears for this session.
    }
    setSeenAt(now);
  };

  const unreadCount = useMemo(() => cases.filter(isUnread).length, [cases, isUnread]);
  const urgentOpen = useMemo(
    () =>
      cases.filter(
        (c) => c.priority === "URGENT" && c.status !== "RESOLVED" && c.status !== "REJECTED",
      ),
    [cases],
  );
  const highOpen = useMemo(
    () =>
      cases.filter(
        (c) => c.priority === "HIGH" && c.status !== "RESOLVED" && c.status !== "REJECTED",
      ),
    [cases],
  );

  const banner = urgentOpen.find((c) => !dismissed.includes(c.id));

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return cases.filter((c) => {
      if (tab === "report" && c.caseType !== "REPORT") return false;
      if (tab === "complaint" && c.caseType !== "COMPLAINT") return false;
      if (tab === "urgent" && c.priority !== "URGENT") return false;
      if (!s) return true;
      return (
        (c.title || "").toLowerCase().includes(s) ||
        (c.preview || "").toLowerCase().includes(s) ||
        (c.submitterName || "").toLowerCase().includes(s) ||
        (c.category || "").toLowerCase().includes(s)
      );
    });
  }, [cases, q, tab]);

  useEffect(() => setPage(0), [q, tab]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const openCompose = (pre) => {
    setPrefill(pre || null);
    setComposeOpen(true);
  };

  const onSent = async (created) => {
    try {
      await load();
    } catch {
      // The message was created; a failed refresh should not look like failure.
    }
    if (created?.id) setSelected(created.id);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-extrabold text-cg-ink">Broadcast</h1>
            {/* Honest connection state. "Live" is a claim the user can check,
                so it reflects the actual socket rather than being decoration. */}
            <span
              title={
                live
                  ? "Connected. New messages appear here the moment they are sent."
                  : "Not connected. The list is still correct, it just will not update on its own — reopen the page to refresh."
              }
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                live
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-slate-100 text-slate-500"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  live ? "animate-pulse bg-emerald-500" : "bg-slate-400"
                }`}
              />
              {live ? "Live" : "Offline"}
            </span>
          </div>
          <p className="text-sm text-cg-ink/60">
            Shared feed for critical issues and actions requiring attention
          </p>
        </div>
        <button type="button" onClick={() => openCompose(null)} className={BTN_DARK}>
          <LuPlus size={16} /> New broadcast
        </button>
      </div>

      {error && (
        <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">
          {error}
        </p>
      )}

      {/* KPIs */}
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          icon={LuMessageSquare}
          label="Total messages"
          value={cases.length}
          sub={
            summary
              ? `${summary.resolvedCount} resolved of ${summary.totalCount}`
              : " "
          }
        />
        <Kpi
          icon={LuMailOpen}
          label="Unread messages"
          value={unreadCount}
          pill={unreadCount > 0 ? "Action required" : null}
          pillTone="bg-rose-100 text-rose-700"
          sub="Since you last opened this, on this device"
        />
        <Kpi
          icon={LuTriangleAlert}
          label="Emergency alerts"
          value={urgentOpen.length}
          pill={urgentOpen.length > 0 ? "Urgent" : null}
          pillTone="bg-rose-100 text-rose-700"
          sub={`${highOpen.length} more marked high`}
        />
        <Kpi
          icon={LuCircleCheck}
          label="Active cases"
          value={summary ? summary.activeCount : 0}
          pill={summary?.complianceStatus === "at-risk" ? "At risk" : "Stable"}
          pillTone={
            summary?.complianceStatus === "at-risk"
              ? "bg-amber-100 text-amber-800"
              : "bg-emerald-100 text-emerald-700"
          }
          sub={
            summary
              ? `Avg first reply ${Number(summary.avgResponseHours).toFixed(1)}h`
              : " "
          }
        />
      </div>

      {/* Emergency banner */}
      {banner && (
        <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-rose-50 px-5 py-4 ring-1 ring-rose-200">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-rose-100 text-rose-600">
            <LuBellRing size={20} />
          </span>
          <div className="min-w-[14rem] flex-1">
            <p className="text-sm font-extrabold text-rose-700">
              Emergency alert: {banner.title}
            </p>
            <p className="text-sm text-rose-800">{banner.preview}</p>
            <p className="mt-0.5 text-xs text-rose-700/60">
              {banner.submitterName}
              {banner.zone ? ` · ${banner.zone}` : ""} · {ago(banner.createdAt)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelected(banner.id)}
              className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white transition hover:brightness-110"
            >
              Open
            </button>
            <button
              type="button"
              onClick={() => setDismissed((d) => [...d, banner.id])}
              className="rounded-xl px-3 py-2 text-sm font-bold text-rose-700 transition hover:bg-rose-100"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Feed */}
        <div className={`overflow-hidden rounded-2xl bg-white shadow ${CARD_STROKE}`}>
          <div className="flex flex-wrap items-center justify-between gap-2 bg-[#C0F28B] px-5 py-3">
            <h2 className="text-sm font-extrabold uppercase tracking-wide text-cg-ink">
              Recent messages
            </h2>
            <InfoTip text="Every message here is a FieldCase. Anything you send is readable by every supervisor and by the admin straight away. Unread is tracked in this browser only — there is no read-receipt table on the server, so reading on your phone will not clear the count here." />
          </div>

          <div className="flex flex-wrap items-center gap-2 border-b border-[#13483B]/10 px-5 py-3">
            <label className="relative flex min-w-[11rem] flex-1 items-center">
              <LuSearch
                size={15}
                className="pointer-events-none absolute left-3 text-cg-ink/40"
              />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search messages…"
                className="w-full rounded-xl border border-[#13483B59] bg-cg-lime/20 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-cg-green"
              />
            </label>
            {[
              ["all", "All"],
              ["report", "Reports"],
              ["complaint", "Complaints"],
              ["urgent", "Urgent"],
            ].map(([k, l]) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={`rounded-xl px-3 py-2 text-xs font-bold transition ${
                  tab === k
                    ? "bg-cg-dark text-white"
                    : "bg-cg-lime/40 text-cg-ink hover:bg-cg-lime"
                }`}
              >
                {l}
              </button>
            ))}
          </div>

          <div className="min-h-[420px] space-y-3 px-5 py-4">
            {loading ? (
              <Empty height={380}>Loading…</Empty>
            ) : pageRows.length === 0 ? (
              <Empty height={380}>
                {cases.length === 0
                  ? "Nothing has been broadcast yet. Press New broadcast and it appears here for every supervisor."
                  : "No message matches that search."}
              </Empty>
            ) : (
              pageRows.map((c) => {
                const unread = isUnread(c);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelected(c.id)}
                    className={`w-full rounded-2xl border px-4 py-3 text-left transition hover:bg-cg-lime/20 ${
                      selected === c.id
                        ? "border-cg-dark bg-cg-lime/20"
                        : unread
                          ? "border-[#13483B] bg-white"
                          : "border-[#13483B]/15 bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                            TYPE_PILL[c.caseType] || TYPE_PILL.REPORT
                          }`}
                        >
                          {c.caseType === "COMPLAINT" ? "Complaint" : c.category || "Report"}
                        </span>
                        {c.priority !== "MEDIUM" && c.priority !== "LOW" && (
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                              PRIORITY_PILL[c.priority]
                            }`}
                          >
                            {c.priority === "URGENT" ? "Urgent" : "High"}
                          </span>
                        )}
                        {unread && (
                          <span className="h-2 w-2 rounded-full bg-rose-500" title="Unread" />
                        )}
                      </div>
                      <span className="shrink-0 text-xs text-cg-ink/50">
                        {ago(c.createdAt)}
                      </span>
                    </div>
                    <p className="mt-2 font-extrabold leading-snug text-cg-ink">
                      {c.title}
                    </p>
                    <p className="mt-1 line-clamp-2 text-sm text-cg-ink/60">
                      {c.preview}
                    </p>
                    <p className="mt-2 border-t border-[#13483B]/10 pt-2 text-xs text-cg-ink/50">
                      {c.submitterName}
                      {c.submitterRole ? `, ${c.submitterRole}` : ""}
                      {c.zone ? ` · ${c.zone}` : ""}
                    </p>
                  </button>
                );
              })
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 bg-[#D3FFAC] px-5 py-3">
            <span className="text-xs font-bold uppercase tracking-wide text-cg-ink/60">
              Showing {pageRows.length} of {filtered.length}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                aria-label="Previous page"
                className="grid h-8 w-8 place-items-center rounded-lg bg-white text-cg-ink disabled:opacity-40"
              >
                <LuChevronLeft size={15} />
              </button>
              <span className="px-2 text-xs font-bold text-cg-ink">
                {page + 1} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                aria-label="Next page"
                className="grid h-8 w-8 place-items-center rounded-lg bg-white text-cg-ink disabled:opacity-40"
              >
                <LuChevronRight size={15} />
              </button>
            </div>
          </div>
        </div>

        {/* Detail + quick actions */}
        <div className="space-y-5">
          <div className={`${CARD} min-h-[420px]`}>
            {!selected ? (
              <Empty height={380}>
                Pick a message on the left to read it in full.
              </Empty>
            ) : !detail ? (
              <Empty height={380}>Opening…</Empty>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-3 py-1 text-[11px] font-bold ${
                      PRIORITY_PILL[detail.priority]
                    }`}
                  >
                    {detail.priority === "URGENT"
                      ? "High priority"
                      : `${detail.priority.charAt(0)}${detail.priority.slice(1).toLowerCase()} priority`}
                  </span>
                  <span
                    className={`rounded-full px-3 py-1 text-[11px] font-bold ${
                      STATUS_PILL[detail.status]
                    }`}
                  >
                    {detail.status.replace("_", " ").toLowerCase()}
                  </span>
                  {detail.category && (
                    <span className="rounded-full bg-cg-lime px-3 py-1 text-[11px] font-bold text-cg-green">
                      {detail.category}
                    </span>
                  )}
                </div>

                <h2 className="mt-3 text-2xl font-extrabold leading-tight text-cg-ink">
                  {detail.title}
                </h2>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-b border-[#13483B]/10 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-cg-lime text-cg-green">
                      <LuUser size={16} />
                    </span>
                    <div>
                      <p className="text-sm font-bold text-cg-ink">
                        {detail.submitterName}
                      </p>
                      <p className="text-xs text-cg-ink/50">
                        {detail.submitterRole}
                        {detail.zone ? ` · ${detail.zone}` : " · whole estate"}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs text-cg-ink/50">
                    {stamp(detail.createdAt)}
                  </span>
                </div>

                <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-cg-ink">
                  {detail.body}
                </p>

                {detail.replies?.length > 0 && (
                  <div className="mt-5 border-t border-[#13483B]/10 pt-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-cg-ink/50">
                      Replies
                    </p>
                    <ul className="mt-2 space-y-3">
                      {detail.replies.map((r) => (
                        <li key={r.id} className="rounded-xl bg-cg-lime/25 px-4 py-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-bold text-cg-ink">
                              {r.authorName}
                              <span className="ml-1 font-normal text-cg-ink/50">
                                {r.authorRole}
                              </span>
                            </p>
                            <span className="text-xs text-cg-ink/50">
                              {ago(r.createdAt)}
                            </span>
                          </div>
                          <p className="mt-1 whitespace-pre-wrap text-sm text-cg-ink/80">
                            {r.body}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Replying is admin-only on the server, so a supervisor gets no
                    reply box here rather than a button that 403s. */}
                <p className="mt-5 text-[11px] text-cg-ink/40">
                  Replies are posted by the admin. You will see them here when
                  they arrive.
                </p>
              </>
            )}
          </div>

          <div className={CARD}>
            <h2 className="text-lg font-extrabold text-cg-ink">Quick actions</h2>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={markAllRead}
                disabled={unreadCount === 0}
                className="flex min-h-[86px] flex-col items-center justify-center gap-2 rounded-2xl bg-[#C0F28B] px-3 py-4 text-center text-xs font-bold text-cg-ink transition hover:brightness-95 disabled:opacity-50"
              >
                <LuCheckCheck size={20} />
                Mark all read
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab("urgent");
                  setPage(0);
                }}
                className="flex min-h-[86px] flex-col items-center justify-center gap-2 rounded-2xl bg-[#C0F28B] px-3 py-4 text-center text-xs font-bold text-cg-ink transition hover:brightness-95"
              >
                <LuTriangleAlert size={20} />
                View emergency
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab("all");
                  setQ("");
                  setPage(0);
                  setSelected(null);
                }}
                className="flex min-h-[86px] flex-col items-center justify-center gap-2 rounded-2xl bg-[#C0F28B] px-3 py-4 text-center text-xs font-bold text-cg-ink transition hover:brightness-95"
              >
                <LuHistory size={20} />
                Recent history
              </button>
            </div>
          </div>
        </div>
      </div>

      <BroadcastComposer
        open={composeOpen}
        prefill={prefill}
        zones={zones}
        onSent={onSent}
        onClose={() => {
          setComposeOpen(false);
          setPrefill(null);
        }}
      />
    </div>
  );
}
