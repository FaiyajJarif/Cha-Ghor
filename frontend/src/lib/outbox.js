/*
 * Offline write outbox (dependency-free, native IndexedDB).
 *
 * Purpose: on flaky/absent connectivity, field writes (attendance punches, leaf
 * weigh-ins) are stored locally and replayed automatically when the network
 * returns. Each entry carries a client_uuid so the backend can dedupe replays
 * (the V18 migration added client_uuid to attendance + leaf_collection).
 *
 * STATUS: this is infrastructure for the Supervisor/Worker capture screens.
 * The Admin console intentionally does NOT route money-mutating actions
 * (approve/pay/decide) through the outbox \u2014 those must not be blindly
 * replayed \u2014 so nothing on the admin side enqueues yet. Wire
 * `queueOrSend(...)` into the attendance/leaf forms when those phases land.
 */
// Same base URL as the axios client, so a queued write replays against the
// host the app is actually talking to. See src/lib/config.js.
import { API_BASE } from "./config";

const DB_NAME = "chaghor";
const STORE = "outbox";
const DB_VERSION = 1;
const SYNC_TAG = "chaghor-outbox";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, mode) {
  return db.transaction(STORE, mode).objectStore(STORE);
}

export async function enqueue(entry) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = tx(db, "readwrite").add({ createdAt: Date.now(), ...entry });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function all() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = tx(db, "readonly").getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function remove(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = tx(db, "readwrite").delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function count() {
  return (await all()).length;
}

async function sendOne(item) {
  const token = localStorage.getItem("token");
  const res = await fetch(API_BASE + item.path, {
    method: item.method || "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(item.headers || {}),
    },
    body: item.body != null ? JSON.stringify(item.body) : undefined,
  });
  // Three outcomes, not two:
  //   ok        -> the server took it
  //   permanent -> it will never be taken; stop retrying, but do NOT claim
  //                success to a caller that is online and waiting
  //   neither   -> transient; keep it queued
  //
  // The distinction matters because sendOne is used on BOTH paths. queueOrSend
  // calls it while the user is watching, where "the server rejected this" must
  // surface; flush() calls it later with nobody watching, where the only
  // question is whether to keep retrying forever.

  // 409 = the server already has this client_uuid. A dedupe, not a failure.
  if (res.ok || res.status === 409) return { ok: true };

  // A DELETE whose target is already gone HAS ACHIEVED WHAT IT ASKED FOR.
  // Without this the queue jams: flush() only removes what the server accepted,
  // so a replayed delete answering 404 would be retried on every sync forever.
  // The first delete having succeeded is the likeliest reason it is missing.
  const method = (item.method || "POST").toUpperCase();
  if (method === "DELETE" && (res.status === 404 || res.status === 410)) {
    return { ok: true };
  }

  // Retryable despite being 4xx:
  //   401 an expired token — the single most likely 4xx after a day offline,
  //       and dropping the entry would throw away the work it was holding
  //   403 a permission that may be granted, or a token not yet refreshed
  //   408/429 timeouts and rate limits, transient by definition
  if ([401, 403, 408, 429].includes(res.status)) return { ok: false };

  // Anything else in the 4xx range is the request itself being wrong — a
  // malformed body, a field that no longer exists. Retrying cannot fix it.
  if (res.status >= 400 && res.status < 500) {
    return { ok: false, permanent: true, status: res.status };
  }

  // 5xx: the server is having a bad time. Exactly what the queue is for.
  return { ok: false };
}

// Replay everything queued. Safe to call repeatedly; only removes entries the
// server accepted. Returns a small summary for the UI.
export async function flush() {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { sent: 0, failed: 0, skipped: true };
  }
  const items = await all();
  let sent = 0;
  let failed = 0;
  let dropped = 0;
  for (const item of items) {
    try {
      const res = await sendOne(item);
      if (res.ok) {
        await remove(item.id);
        sent += 1;
      } else if (res.permanent) {
        // Never going to succeed. Leaving it queued would mean retrying on
        // every sync for the life of the install, so it is removed -- but
        // loudly, because a write the user believed was saved has been lost.
        console.warn(
          `[outbox] giving up on ${item.method || "POST"} ${item.path} \u2014 server said ${res.status}`,
        );
        await remove(item.id);
        dropped += 1;
      } else {
        failed += 1;
      }
    } catch {
      failed += 1; // still offline / server unreachable \u2014 keep for next time
    }
  }
  return { sent, failed, dropped };
}

export async function registerSync() {
  try {
    const reg = await navigator.serviceWorker?.ready;
    if (reg && "sync" in reg) await reg.sync.register(SYNC_TAG);
  } catch {
    // Background Sync unsupported (e.g. Firefox/Safari) \u2014 flush() on the
    // window "online" event is the fallback path.
  }
}

// Convenience for capture forms: try to send immediately; if the network is
// down, queue it and ask the SW to replay via Background Sync.
export async function queueOrSend({ path, body, method = "POST", clientUuid }) {
  const entry = { path, body, method, clientUuid };
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    await enqueue(entry);
    await registerSync();
    return { queued: true };
  }
  try {
    const res = await sendOne(entry);
    if (res.ok) return { queued: false };
    // The server was reachable and rejected this outright. Queueing it would
    // tell the user "saved, will sync later" about something that is never
    // going to sync. Throw so the caller shows the real error.
    if (res.permanent) {
      const err = new Error(`Request rejected (${res.status})`);
      err.response = { status: res.status };
      throw err;
    }
    throw new Error("send failed");
  } catch (e) {
    if (e && e.response) throw e; // a real rejection, not a network problem
    await enqueue(entry);
    await registerSync();
    return { queued: true };
  }
}

export default { enqueue, all, remove, count, flush, registerSync, queueOrSend };
