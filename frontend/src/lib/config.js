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

// NO .env NEEDED FOR PHONE TESTING, and that is deliberate.
//
// The old fallback was a hardcoded "http://localhost:8080/api/v1". On a laptop
// that is right. On a phone it is catastrophically wrong in a way that looks
// like a backend problem: the handset resolves `localhost` to ITSELF, finds
// nothing on port 8080, and every request fails with a network error that says
// nothing about the real cause.
//
// So when VITE_API_URL is not set, the backend host is taken from whatever
// address the page was loaded from. Open the app at
// http://192.168.1.20:5173 and it calls http://192.168.1.20:8080/api/v1 by
// itself — no file to edit, and nothing to re-edit when the router hands out a
// different address tomorrow.
//
// An explicit VITE_API_URL still wins, for the case where the backend genuinely
// lives somewhere other than the machine serving the frontend.
function defaultApiBase() {
  // Guard for a non-browser context (a test runner, SSR): there is no window,
  // so fall back to the loopback address rather than throwing at import time.
  if (typeof window === "undefined" || !window.location) {
    return "http://localhost:8080/api/v1";
  }
  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:8080/api/v1`;
}

export const API_BASE = import.meta.env.VITE_API_URL || defaultApiBase();

// The WebSocket origin is derived from API_BASE so there is only one thing to
// configure: strip the /api/v1 suffix and swap http -> ws (https -> wss).
export const WS_BASE = API_BASE.replace(/\/api\/v1\/?$/, "").replace(
  /^http/,
  "ws",
);

export default { API_BASE, WS_BASE };
