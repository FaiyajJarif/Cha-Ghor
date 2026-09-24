import { useCallback, useEffect, useRef, useState } from "react";
import { LuBanknote, LuCircleCheck, LuClock } from "react-icons/lu";
import api from "../../api/client";
import { WS_BASE } from "../../lib/config";

// টাকার খবর — the estate telling this worker about his own money.
//
// WHY IT IS SEPARATE FROM THE NOTICE BOARD
//   A notice is the estate talking to EVERYONE: rain tomorrow, start early.
//   This is the estate talking to ONE person about money that has moved. Mixed
//   into the same list, "আপনার বিকাশ নম্বরে ২০ টাকা পাঠানো হয়েছে" sits between
//   two field bulletins and reads like another announcement. It is the single
//   most important message this app ever shows a worker, and it gets its own
//   card at the top of the page.
//
// WHERE THE ROWS COME FROM
//   /me/worker/payments reads the worker's own sms_log rows. That is
//   deliberate: the notification and the text on their handset are then the
//   same record and cannot disagree. It also means this works when SMS is
//   switched off -- app_setting.sms_enabled defaults to false, and a dispatch
//   with the transport disabled still writes a log row -- so the worker is told
//   he was paid even though no text left the building, which is the normal case
//   on a demo estate.
//
// LIVE, over the existing notifications socket.
//
// The first version of this component loaded once on mount and stopped, on the
// reasoning that a payment happens a few times a month. That was wrong about
// the moment that matters: the worker is very often looking at this screen
// WHILE the office pays him, having been told the money is coming. A card that
// only updates on a manual refresh shows him nothing at the one instant he
// cares about, and he concludes he has not been paid.
//
// WithdrawalService already pushes `withdrawal.decided` on the notifications
// socket the moment a payment commits -- that frame existed before this
// component did. Listening for it costs one refetch per payment.

const CARD = "min-w-0 rounded-2xl bg-white shadow ring-1 ring-[#13483B]/10";

const BN = "০১২৩৪৫৬৭৮৯";
const bn = (s) => String(s).replace(/[0-9]/g, (d) => BN[+d]);
const MONTHS_BN = [
  "জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন",
  "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর",
];

// Same relative-time wording as NoticeBoard, so the two lists on one page do
// not describe the same moment two different ways.
const when = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 60) return `${bn(Math.max(1, mins))} মিনিট আগে`;
  if (mins < 1440) return `${bn(Math.round(mins / 60))} ঘণ্টা আগে`;
  return `${bn(d.getDate())} ${MONTHS_BN[d.getMonth()]}`;
};

export default function PaymentNotices({ showEmpty = false }) {
  const [rows, setRows] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    const { data } = await api.get("/me/worker/payments");
    // Money messages only. The endpoint returns every message this worker was
    // sent, including estate-wide broadcasts, and those already have their own
    // board below -- showing them twice on one screen makes both look like
    // noise.
    setRows((data || []).filter((r) => r.category === "withdrawal" || r.category === "payroll"));
    setFailed(false);
  }, []);

  useEffect(() => {
    load()
      // FAILING VISIBLY. The first version swallowed the error and rendered
      // nothing, so a backend that had not been restarted -- and was therefore
      // 404ing on this endpoint -- looked exactly like a worker who had never
      // been paid. That is the worst possible confusion on a money screen, and
      // it cost an afternoon.
      .catch(() => setFailed(true))
      .finally(() => setLoaded(true));
  }, [load]);

  // Refetch when the estate says a withdrawal was decided.
  //
  // loadRef, not `load` in the dependency array: re-running this effect would
  // tear down and rebuild the socket on every render that changed `load`, and
  // a reconnect loop on a phone on estate wifi is worse than no live update at
  // all. Same shape as NoticeBoard, deliberately.
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
        // `withdrawal.decided` is pushed by WithdrawalService.decide, which is
        // what sendBatch calls per worker. The frame carries no worker id, so
        // every open worker session refetches -- and each one only ever sees
        // its OWN messages, because /me/worker/payments resolves the worker
        // from the JWT and takes no id from the client.
        if (kind === "withdrawal.decided" && loadRef.current) {
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
      try {
        ws?.close();
      } catch {
        /* already gone */
      }
    };
  }, []);

  if (!loaded) return null;

  if (failed) {
    return (
      <section className={CARD}>
        <div className="flex items-center gap-2 rounded-t-2xl bg-[#C0F28B] px-4 py-3">
          <LuBanknote size={18} className="text-[#14493B]" />
          <h2 className="font-bold text-[#14493B]">টাকার খবর</h2>
        </div>
        <p className="px-4 py-6 text-center text-sm text-[#14493B]/60">
          টাকার খবর এখন আনা যাচ্ছে না। একটু পরে আবার দেখুন।
        </p>
      </section>
    );
  }

  if (rows.length === 0 && !showEmpty) return null;

  return (
    <section className={CARD}>
      <div className="flex items-center gap-2 rounded-t-2xl bg-[#C0F28B] px-4 py-3">
        <LuBanknote size={18} className="text-[#14493B]" />
        <h2 className="font-bold text-[#14493B]">টাকার খবর</h2>
      </div>

      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-[#14493B]/50">
          এখনও কোনো টাকার খবর নেই।
        </p>
      ) : (
        <ul className="divide-y divide-[#13483B]/10">
          {rows.map((r) => (
            <li key={r.id} className="flex items-start gap-3 px-4 py-3">
              <span
                className={`mt-0.5 shrink-0 rounded-full p-1.5 ${
                  r.delivered ? "bg-[#E6F6ED] text-[#1a7f4f]" : "bg-[#F1F5F0] text-[#5b6b60]"
                }`}
              >
                {r.delivered ? <LuCircleCheck size={15} /> : <LuClock size={15} />}
              </span>
              <div className="min-w-0">
                <p className="text-sm leading-snug text-[#14493B]">{r.message}</p>
                <p className="mt-0.5 text-[11px] text-[#14493B]/50">
                  {when(r.sentAt)}
                  {/* `mock` means the row was written but nothing was
                      transmitted, because the estate has SMS switched off.
                      Said plainly: a worker told "we texted you" who never got
                      a text stops trusting the next message too. */}
                  {r.delivered ? "" : " · ফোনে এসএমএস যায়নি"}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
