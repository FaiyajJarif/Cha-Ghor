import { useCallback, useEffect, useRef, useState } from "react";
import { LuMegaphone, LuTriangleAlert, LuMapPin } from "react-icons/lu";
import api from "../../api/client";
import { WS_BASE } from "../../lib/config";
import { closeSocket } from "../../lib/ws";

// আজকের খবর — what the estate has told everyone.
//
// WHY THIS EXISTS
//   A supervisor could broadcast "heavy rain tomorrow, start early" and a
//   worker opening the app saw nothing whatsoever. The message reached admin's
//   console and any browser already open on the supervisor board; the people it
//   was about had no way to read it. The SMS added later reaches their phone,
//   but only where a gateway is configured.
//
// WHAT IT SHOWS, AND WHAT IT MUST NEVER SHOW
//   REPORT cases only — estate notices. COMPLAINT cases are other workers'
//   grievances, frequently about a supervisor and sometimes confidential. One
//   of those surfacing on a colleague's home screen would end the grievance
//   channel for good, so the filter lives on the server and this component
//   could not show one even if it tried.
//
// NO SPEECH ON THIS SCREEN. An earlier version read urgent notices aloud the
// moment the page opened, and put a speaker button on every row. Both are gone.
//
// A notice board is READ, at the worker's own pace, and it refreshes over a
// socket -- so a phone that announces itself unprompted does it in the middle of
// a shift, in front of other people, for a message the worker may already have
// seen. The report screen is different: there the worker has tapped something
// and is waiting to be told what it was. Speech belongs there, not here.

const CARD = "rounded-2xl bg-white shadow ring-1 ring-[#13483B]/10";

const BN = "০১২৩৪৫৬৭৮৯";
const bn = (s) => String(s).replace(/[0-9]/g, (d) => BN[+d]);
const MONTHS_BN = [
  "জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন",
  "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর",
];
const when = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 60) return `${bn(Math.max(1, mins))} মিনিট আগে`;
  if (mins < 1440) return `${bn(Math.round(mins / 60))} ঘণ্টা আগে`;
  return `${bn(d.getDate())} ${MONTHS_BN[d.getMonth()]}`;
};

export default function NoticeBoard({ showEmpty = false }) {
  const [notices, setNotices] = useState([]);

  const load = useCallback(async () => {
    const { data } = await api.get("/me/worker/notices");
    setNotices(data || []);
  }, []);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  // Live, because a notice a worker reads an hour late is often a notice that
  // did not work.
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);

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
        return;
      }
      ws.onmessage = (e) => {
        let kind = "";
        try {
          kind = JSON.parse(e.data)?.kind || "";
        } catch {
          return;
        }
        if (
          (kind === "case.created" || kind === "case.status") &&
          loadRef.current
        ) {
          loadRef.current().catch(() => {});
        }
      };
      ws.onerror = () => ws.close();
      ws.onclose = () => {
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

  // On its own page an empty board must say so; embedded in another screen it
  // should simply not take up room.
  if (notices.length === 0) {
    if (!showEmpty) return null;
    return (
      <div className={`${CARD} px-5 py-12 text-center`}>
        <LuMegaphone size={40} strokeWidth={1.5} className="mx-auto text-[#14493B]/25" />
        <p className="mt-3 text-sm text-[#14493B]/55">
          এখন কোনো খবর নেই।
        </p>
        <p className="mt-1 text-xs text-[#14493B]/40">
          সুপারভাইজার বা অফিস কিছু জানালে এখানে দেখতে পাবেন।
        </p>
      </div>
    );
  }

  // The worker's own field first, then urgency, then recency.
  const sorted = [...notices].sort((a, b) => {
    if (a.mine !== b.mine) return a.mine ? -1 : 1;
    const u = (n) => (n.priority === "URGENT" ? 0 : n.priority === "HIGH" ? 1 : 2);
    return u(a) - u(b);
  });

  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="flex flex-wrap items-center justify-between gap-2 bg-[#C0F28B] px-5 py-3">
        <h2 className="flex items-center gap-2 font-bold text-[#14493B]">
          <LuMegaphone size={17} /> আজকের খবর
        </h2>
        <span className="text-[11px] font-semibold text-[#14493B]/60">
          সুপারভাইজার ও অফিস থেকে
        </span>
      </div>

      <ul className="divide-y divide-[#13483B]/8">
        {sorted.map((n) => {
          const urgent = n.priority === "URGENT";
          return (
            <li
              key={n.id}
              className={`px-5 py-4 ${urgent ? "bg-rose-50" : ""}`}
            >
              <div className="min-w-0">
                  <p
                    className={`flex items-center gap-1.5 font-bold ${
                      urgent ? "text-rose-800" : "text-[#14493B]"
                    }`}
                  >
                    {urgent && <LuTriangleAlert size={15} className="shrink-0" />}
                    {n.title}
                  </p>
                  {n.body && (
                    <p className="mt-1 text-sm leading-relaxed text-[#14493B]/75">
                      {n.body}
                    </p>
                  )}
                  <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-[#14493B]/50">
                    {n.mine && n.zone && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#F4FFE9] px-2 py-0.5 font-bold text-[#14493B] ring-1 ring-[#13483B]/15">
                        <LuMapPin size={10} /> আপনার ক্ষেত্র
                      </span>
                    )}
                    {n.zone && !n.mine && <span>{n.zone}</span>}
                    {n.from && <span>{n.from}</span>}
                    <span>{when(n.createdAt)}</span>
                  </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
