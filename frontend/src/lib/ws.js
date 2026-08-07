// Closing a WebSocket without the console warning.
//
// THE PROBLEM: React.StrictMode (dev only) deliberately runs every effect
// twice — mount, clean up, mount again — to surface effects that are not
// idempotent. A socket effect therefore does:
//
//     new WebSocket(url)      // readyState = CONNECTING
//     ws.close()              // cleanup fires before the handshake finishes
//     new WebSocket(url)      // the one that actually lives
//
// Calling close() on a CONNECTING socket is what produces
// "WebSocket is closed before the connection is established" in the console.
// The connection is not broken — the second socket connects fine — but the
// warning is indistinguishable from a real failure, which is worse than
// useless when you are trying to tell whether live updates are working.
//
// THE FIX: never close a socket mid-handshake. If it is still CONNECTING, wait
// for it to open and close it then. That is a clean close, and it is silent.
export function closeSocket(ws) {
  if (!ws) return;
  try {
    if (ws.readyState === WebSocket.CONNECTING) {
      // Closing now would abort the handshake. Let it finish, then hang up.
      ws.addEventListener("open", () => {
        try {
          ws.close();
        } catch {
          // already gone
        }
      });
      return;
    }
    if (ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
    // CLOSING / CLOSED need nothing.
  } catch {
    // A socket that cannot be closed is already dead.
  }
}

export default { closeSocket };
