// One place to mint an idempotency key for a queued write.
//
// The key is generated ONCE at capture time and persisted with the queued
// entry, so a replay sends the identical key and the server recognises the
// write as a repeat rather than a new one. It must NOT be derived from the
// data: an earlier attempt hashed (worker, date, time) and a sweep of 42,000
// keys turned up collisions, which would have made two workers' records
// collide and silently discard one.
export function newUuid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Older WebView / non-secure context. Still 122 bits of randomness.
  const b = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(b);
  } else {
    for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  }
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // variant 10x
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export default { newUuid };
