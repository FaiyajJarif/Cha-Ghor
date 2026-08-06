// Shared UI helpers. BTN_DARK is the single "primary button" style used across
// the admin console (same dark green as the Logout button) so every action
// button stays visually consistent.
export const BTN_DARK =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-cg-dark px-4 py-2 text-sm font-semibold text-white transition hover:bg-cg-darker disabled:cursor-not-allowed disabled:opacity-60";

// Neutral / secondary button (e.g. Cancel).
export const BTN_GHOST =
  "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-cg-ink/70 transition hover:bg-cg-lime";
