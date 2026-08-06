import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import App from "./App";
import outbox from "./lib/outbox";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);

// --- PWA wiring ---------------------------------------------------------
// Register the service worker only in production builds. In dev, an active SW
// would cache Vite's HMR modules and serve stale bundles, so we skip it.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // registration failure shouldn't break the app
    });
  });

  // The SW (via Background Sync) can ask us to replay queued offline writes.
  // We do it here in the page, where the auth token is available.
  navigator.serviceWorker.addEventListener("message", (e) => {
    if (e.data && e.data.type === "chaghor-flush-outbox") outbox.flush();
  });
}

// Whenever connectivity returns, replay any writes queued while offline.
window.addEventListener("online", () => {
  outbox.flush();
});
