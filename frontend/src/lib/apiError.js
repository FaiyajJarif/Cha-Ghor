// Single source of truth for turning an Axios error into a user-facing message.
//
// Keep ALL API error copy here so the whole admin app stays in sync. Previously
// this function was duplicated in Finance.jsx, Loans.jsx and Workforce.jsx; if
// you change error handling, change it here only.
//
// Handles (in order):
//   429 -> login/rate-limit throttle (reads Retry-After seconds if present)
//   string body
//   { error, fields } -> Bean Validation shape from the backend
//                        GlobalExceptionHandler (Phase 1)
//   { message } / { error } -> other structured error bodies
//   403 / 401 -> auth
//   otherwise -> the caller's fallback string
export function apiError(err, fallback) {
  const code = err?.response?.status;
  const body = err?.response?.data;

  // Rate limiting (Phase 1 login throttle; safe to handle everywhere).
  if (code === 429) {
    const secs = body?.retryAfterSeconds;
    return secs
      ? `Too many attempts. Please wait ${secs}s and try again.`
      : "Too many attempts. Please wait a minute and try again.";
  }

  // Plain string body.
  if (typeof body === "string" && body) return body;

  // Bean Validation shape: { error: "Validation failed", fields: { amount: "..." } }.
  // Surface the first specific field message so the user sees what to fix.
  if (body?.fields && typeof body.fields === "object") {
    const first = Object.values(body.fields).find(Boolean);
    if (first) return first;
  }

  // Other structured messages.
  if (body?.message) return body.message;
  if (body?.error) return body.error;

  if (code === 403) return "Only an admin can do that.";
  if (code === 401) return "Please sign in again.";
  return fallback;
}
