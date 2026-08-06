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
  // 2xx = accepted; 409 = server already has this client_uuid (idempotent dup).
  // Either way the entry is done and can be dropped from the queue.
  return res.ok || res.status === 409;
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
  for (const item of items) {
    try {
      if (await sendOne(item)) {
        await remove(item.id);
        sent += 1;
      } else {
        failed += 1;
      }
    } catch {
      failed += 1; // still offline / server unreachable \u2014 keep for next time
    }
  }
  return { sent, failed };
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
    if (await sendOne(entry)) return { queued: false };
    throw new Error("send failed");
  } catch {
    await enqueue(entry);
    await registerSync();
    return { queued: true };
  }
}

export default { enqueue, all, remove, count, flush, registerSync, queueOrSend };
