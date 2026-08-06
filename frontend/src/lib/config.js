// Single source of truth for where the backend lives.
//
// Previously the host was hardcoded in four places -- the axios client, the
// offline outbox, and two WebSocket URLs -- so the app only worked when the
// backend was on localhost. Demoing from a second machine, or from anyone
// else's laptop, failed silently with no obvious cause.
//
// Set VITE_API_URL in frontend/.env to point somewhere else, e.g.
//   VITE_API_URL=http://192.168.1.20:8080/api/v1
// Vite only exposes variables prefixed with VITE_, and inlines them at build
// time, so this must be read at module scope rather than inside a function.
//
// The localhost fallback keeps `npm run dev` working with no .env at all.

export const API_BASE =
  import.meta.env.VITE_API_URL || "http://localhost:8080/api/v1";

// The WebSocket origin is derived from API_BASE so there is only one thing to
// configure: strip the /api/v1 suffix and swap http -> ws (https -> wss).
export const WS_BASE = API_BASE.replace(/\/api\/v1\/?$/, "").replace(
  /^http/,
  "ws",
);

export default { API_BASE, WS_BASE };
