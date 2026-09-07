import { useEffect, useRef, useState } from "react";
import { LuWifiOff, LuRefreshCw } from "react-icons/lu";
import useOnlineStatus from "../lib/useOnlineStatus";

// A small floating pill that surfaces connectivity state to the user. When
// offline it stays visible ("showing last synced data"); when the connection
// returns it shows a brief "syncing" confirmation, then hides itself.
export default function OfflineBanner() {
  const online = useOnlineStatus();
  const [showBack, setShowBack] = useState(false);
  const was = useRef(online);

  useEffect(() => {
    if (!was.current && online) {
      setShowBack(true);
      const t = setTimeout(() => setShowBack(false), 3000);
      was.current = online;
      return () => clearTimeout(t);
    }
    was.current = online;
  }, [online]);

  if (online && !showBack) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex justify-center px-4">
      <div
        className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold shadow-lg ${
          online ? "bg-cg-green text-white" : "bg-amber-500 text-white"
        }`}
        role="status"
        aria-live="polite"
      >
        {online ? (
          <>
            <LuRefreshCw className="animate-spin" />
            Back online &mdash; syncing changes&hellip;
          </>
        ) : (
          <>
            <LuWifiOff />
            You&rsquo;re offline &mdash; showing last synced data
          </>
        )}
      </div>
    </div>
  );
}
