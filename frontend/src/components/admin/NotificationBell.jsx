import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LuBell } from "react-icons/lu";
import { WS_BASE } from "../../lib/config";
import { closeSocket } from "../../lib/ws";

// Live notification bell in the header. It opens a WebSocket to the backend and
// prepends any message it receives. The socket URL comes from VITE_WS_URL and
// falls back to the local backend. If the socket can't connect, the bell still
// works (it just shows "Offline" and no live items) and it auto-reconnects.
// VITE_WS_URL still overrides if you need a different socket host; otherwise
// this follows VITE_API_URL, so one variable configures the whole app.
const WS_URL =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_WS_URL) ||
  `${WS_BASE}/ws/notifications`;

function timeAgo(ts) {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return s + "s ago";
  const m = Math.round(s / 60);
  if (m < 60) return m + "m ago";
  const h = Math.round(m / 60);
  return h + "h ago";
}

export default function NotificationBell() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const panelRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);

  useEffect(() => {
    let retry;
    let closedByUs = false;

    const push = (payload, raw) => {
      const n = payload || {};
      setItems((prev) =>
        [
          {
            id: n.id || Date.now(),
            title: n.title || "Notification",
            body: n.body || (payload ? "" : String(raw || "")),
            ts: n.ts || Date.now(),
            read: false,
          },
          ...prev,
        ].slice(0, 30),
      );
    };

    const connect = () => {
      let ws;
      try {
        ws = new WebSocket(WS_URL);
      } catch {
        return; // browser blocked the URL; stay offline
      }
      wsRef.current = ws;
      ws.onopen = () => setConnected(true);
      ws.onmessage = (e) => {
        try {
          push(JSON.parse(e.data), e.data);
        } catch {
          push(null, e.data);
        }
      };
      ws.onerror = () => ws.close();
      ws.onclose = () => {
        setConnected(false);
        if (!closedByUs) retry = setTimeout(connect, 5000);
      };
    };

    connect();
    return () => {
      closedByUs = true;
      clearTimeout(retry);
      closeSocket(wsRef.current);
    };
  }, []);

  const unread = items.filter((i) => !i.read).length;

  // CLOSE ON OUTSIDE TAP AND ON ESCAPE.
  //
  // There was no handler at all: once open, the only way to dismiss the panel
  // was to find the bell again and press it. On a phone the panel covers most
  // of the screen, so a tap anywhere else did nothing and the whole app felt
  // stuck. Everyone expects a dropdown to close when you tap away from it.
  //
  // pointerdown, not click: on touch it fires before the page has a chance to
  // treat the tap as a scroll, so dismissal feels immediate rather than lagging
  // a frame behind the finger.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      // Ignore taps INSIDE the bell or the panel -- the bell has its own
      // toggle, and closing on a tap inside would make the panel unusable.
      if (rootRef.current?.contains(e.target)) return;
      if (panelRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = () => {
    setOpen((o) => {
      const next = !o;
      if (next) setItems((prev) => prev.map((i) => ({ ...i, read: true })));
      return next;
    });
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={toggle}
        aria-label="Notifications"
        className="relative grid h-10 w-10 place-items-center rounded-full bg-white/60 text-cg-ink transition hover:bg-white"
      >
        <LuBell size={18} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-cg-dark px-1 text-[10px] font-bold text-white">
            {unread}
          </span>
        )}
      </button>

      {/* ================= WHY THIS IS FIXED, NOT ABSOLUTE =================
          The last attempt kept `absolute right-0` and capped the width to
          calc(100vw-2rem). That still overflowed, and the reason is that the
          bell is NOT at the right edge of the screen -- the avatar sits to its
          right. right-0 anchors to the BELL, roughly 60px in from the viewport
          edge, so a 328px panel extended to about -28px on a 360px screen.

          Anchoring to an element that is not at the edge cannot be made safe by
          adjusting the width. Below sm the panel is now positioned against the
          VIEWPORT instead, with an equal gutter on both sides. From sm up it
          goes back to the anchored dropdown, which is correct there. */}
      {/* ================= WHY THIS IS A PORTAL =================
          THE BACKDROP WAS THE BUG. It was rendered here, inside the same
          `relative` div that rootRef points at -- and it covers the entire
          screen. So every "outside" tap actually landed ON the backdrop, which
          IS a descendant of rootRef, so the guard

              if (rootRef.current?.contains(e.target)) return;

          returned early every single time. The panel could not be dismissed by
          tapping away from it at all, which is exactly the symptom.

          Portalling the backdrop and panel to document.body takes them out of
          rootRef entirely, so "inside the bell" and "inside the panel" are the
          only two things the guard protects -- which is what it was meant to
          mean. The backdrop also closes on its own click, so dismissal does not
          depend on the document listener firing at all. */}
      {open &&
        createPortal(
        <>
          <div
            className="fixed inset-0 z-[55] bg-black/20 sm:hidden"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
        {/* Fixed at BOTH sizes now. Once portalled to body, `absolute` would
            position against the page rather than the bell, so it is anchored to
            the viewport under the header on either side of the breakpoint. */}
        <div
          ref={panelRef}
          className="fixed left-3 right-3 top-16 z-[60] max-h-[70vh] overflow-y-auto rounded-2xl bg-white p-3 shadow-2xl ring-1 ring-cg-green/10 sm:left-auto sm:right-6 sm:w-80">
          <div className="flex items-center justify-between px-1 pb-2">
            <p className="font-bold text-cg-ink">Notifications</p>
            <span
              className={`flex items-center gap-1 text-[11px] font-semibold ${
                connected ? "text-cg-green" : "text-cg-ink/40"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${connected ? "bg-cg-green" : "bg-cg-ink/30"}`}
              />
              {connected ? "Live" : "Offline"}
            </span>
          </div>
          {items.length === 0 ? (
            <p className="px-1 py-6 text-center text-sm text-cg-ink/50">
              No notifications yet. Live updates will appear here in real time.
            </p>
          ) : (
            <ul className="max-h-80 space-y-1 overflow-y-auto">
              {items.map((n) => (
                <li
                  key={n.id}
                  className="rounded-lg px-2 py-2 hover:bg-cg-lime/40"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-cg-ink">
                      {n.title}
                    </p>
                    <span className="text-[10px] text-cg-ink/40">
                      {timeAgo(n.ts)}
                    </span>
                  </div>
                  {n.body && <p className="text-xs text-cg-ink/60">{n.body}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
        </>,
        document.body,
      )}
    </div>
  );
}
