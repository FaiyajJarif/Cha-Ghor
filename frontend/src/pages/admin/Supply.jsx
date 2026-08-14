import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  LuTruck,
  LuBoxes,
  LuCheckCheck,
  LuTrendingUp,
  LuReceipt,
  LuCalendarCheck,
  LuPlus,
  LuLandmark,
  LuCopy,
  LuPencil,
  LuTrash2,
  LuMapPin,
  LuX,
} from "react-icons/lu";
import api from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { BTN_DARK, BTN_GHOST } from "../../lib/ui";
import InfoTip from "../../components/admin/InfoTip";
import ErrorBoundary from "../../components/ErrorBoundary";
import { WS_BASE } from "../../lib/config";

// The live map touches Leaflet (window/document) + a CSS side-effect import, so
// it is lazy-loaded behind an ErrorBoundary. If the dependency isn't installed
// yet (npm i leaflet react-leaflet) the board still renders and the map area
// shows an install hint instead of crashing.
const ShipmentMap = lazy(() => import("../../components/admin/ShipmentMap"));

function MapLoading() {
  return (
    <div className="grid h-full place-items-center text-sm text-cg-dark/40">
      Loading map…
    </div>
  );
}

function MapFallback() {
  return (
    <div className="grid h-full place-items-center p-4 text-center text-sm text-cg-dark/50">
      Live map unavailable — run: npm i leaflet react-leaflet
    </div>
  );
}

// Supply Chain Overview - real-time logistics for the estate: outbound shipment
// tracking (live tracker + active routes), warehouse stock distribution, the
// dispatch-readiness quality gate, and the sales transaction ledger. Every KPI
// and the warehouse bars are computed live on the backend from the shipment /
// tea_batch / sales tables (GET /supply/*). Admins can dispatch new shipments.

const PAGE_SIZE = 10;
const ROUTE_PAGE_SIZE = 3;
const BATCH_PAGE_SIZE = 3;
const SHIP_PAGE_SIZE = 8;

// Shared section-card chrome: a lime (#C0F28B) header bar and a pale (#D3FFAC)
// footer bar, matching the Workforce / Finance / Inventory boards.
const CARD =
  "flex flex-col overflow-hidden rounded-2xl border border-cg-lime/60 bg-white shadow-sm";
const HEADER_BAR =
  "flex items-center justify-between gap-2 bg-[#C0F28B] px-5 py-3";
const FOOTER_BAR =
  "flex flex-wrap items-center justify-between gap-2 bg-[#D3FFAC] px-5 py-2.5";

const TRACKER_STEPS = [
  { key: "LOADING", label: "Loading", icon: LuBoxes },
  { key: "IN_TRANSIT", label: "In Transit", icon: LuTruck },
  { key: "AT_WEIGH_IN", label: "At Weigh-In", icon: LuLandmark },
  { key: "DELIVERED", label: "Delivered", icon: LuCheckCheck },
];
const STEP_ORDER = TRACKER_STEPS.map((s) => s.key);

const STOCK_BAR = {
  READY_FOR_DISPATCH: "bg-cg-green",
  PROCESSING: "bg-indigo-500",
  RAW_LEAF: "bg-amber-500",
};
const STOCK_CHIP = {
  READY_FOR_DISPATCH: "bg-emerald-100 text-emerald-700",
  PROCESSING: "bg-indigo-100 text-indigo-700",
  RAW_LEAF: "bg-amber-100 text-amber-700",
};
const READINESS_BADGE = {
  PASSED: "bg-emerald-100 text-emerald-700",
  PENDING: "bg-amber-100 text-amber-700",
};
const PAY_BADGE = {
  PAID: "bg-emerald-100 text-emerald-700",
  PENDING: "bg-amber-100 text-amber-700",
};
const SHIP_BADGE = {
  DELIVERED: "bg-emerald-100 text-emerald-700",
  IN_TRANSIT: "bg-sky-100 text-sky-700",
  PENDING: "bg-slate-100 text-slate-600",
};
const SHIP_STATUS_BADGE = {
  LOADING: "bg-amber-100 text-amber-700",
  IN_TRANSIT: "bg-sky-100 text-sky-700",
  AT_WEIGH_IN: "bg-indigo-100 text-indigo-700",
  DELIVERED: "bg-emerald-100 text-emerald-700",
};

const INPUT =
  "rounded-xl border border-cg-lime/70 bg-white px-3 py-2 text-sm text-cg-dark focus:border-cg-green focus:outline-none";

function num(n) {
  return Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
}
function kg(n) {
  return `${num(n)} kg`;
}
function taka(n) {
  return `৳${Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
function shortDate(d) {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function StatCard({ icon: Icon, label, value, unit, hint }) {
  return (
    <div className="rounded-2xl border border-cg-lime/60 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-cg-dark/60">
          {label}
        </p>
        <span className="grid h-7 w-7 place-items-center rounded-full bg-cg-lime text-cg-green">
          <Icon size={16} />
        </span>
      </div>
      <p className="mt-2 text-2xl font-bold text-cg-darker">
        {value}
        {unit ? (
          <span className="ml-1 text-sm font-semibold text-cg-dark/50">
            {unit}
          </span>
        ) : null}
      </p>
      {hint ? <p className="mt-1 text-xs text-cg-dark/50">{hint}</p> : null}
    </div>
  );
}

function Badge({ map, value }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        map[value] || "bg-slate-100 text-slate-600"
      }`}
    >
      {(value || "").replace(/_/g, " ")}
    </span>
  );
}

// Reusable footer pager (client-side): shows the range + page and Prev/Next.
function Pager({ page, totalPages, total, size, count, noun, onPrev, onNext }) {
  const from = total === 0 ? 0 : page * size + 1;
  const to = page * size + count;
  return (
    <>
      <span className="text-xs text-cg-dark/60">
        {total === 0
          ? `No ${noun}`
          : `Showing ${from}–${to} of ${num(total)} ${noun}`}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={page <= 0}
          onClick={onPrev}
          className={`${BTN_GHOST} disabled:opacity-40`}
        >
          Previous
        </button>
        <span className="text-xs font-semibold text-cg-dark/60">
          Page {page + 1} of {Math.max(1, totalPages)}
        </span>
        <button
          type="button"
          disabled={page + 1 >= totalPages}
          onClick={onNext}
          className={`${BTN_GHOST} disabled:opacity-40`}
        >
          Next
        </button>
      </div>
    </>
  );
}

const EMPTY_FORM = {
  code: "",
  vehicle: "",
  origin: "",
  destination: "",
  weightKg: "",
  etaText: "",
};

// Dark modal header, matching the Inventory "Add item" popup chrome.
function ModalHeader({ title, subtitle, onClose }) {
  return (
    <div className="flex items-start justify-between gap-3 bg-cg-dark px-6 py-4">
      <div>
        <h3 className="text-base font-bold text-white">{title}</h3>
        {subtitle ? (
          <p className="mt-0.5 text-xs text-white/70">{subtitle}</p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="rounded-lg p-1 text-white/80 transition hover:bg-white/10 hover:text-white"
      >
        <LuX size={18} />
      </button>
    </div>
  );
}

// Popup used for BOTH dispatching a new shipment and editing an existing one,
// so an admin can run several shipments at once without leaving the board.
function ShipmentFormModal({ mode, initial, busy, error, onCancel, onSubmit }) {
  const [form, setForm] = useState(initial);
  useEffect(() => setForm(initial), [initial]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const isEdit = mode === "edit";
  return createPortal(
    <div className="fixed inset-0 z-[1200] grid place-items-center bg-black/40 p-4">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-xl">
        <ModalHeader
          title={isEdit ? "Edit shipment" : "Dispatch a new shipment"}
          subtitle={
            isEdit
              ? "Update the route, vehicle, weight or ETA. Status is managed separately."
              : "Create an outbound shipment. It starts at Loading with a fresh driver link."
          }
          onClose={onCancel}
        />
        <div className="space-y-3 p-6">
          {error ? (
            <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          ) : null}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              className={INPUT}
              placeholder="Origin (e.g. Srimangal)"
              value={form.origin}
              onChange={set("origin")}
            />
            <input
              className={INPUT}
              placeholder="Destination (e.g. Dhaka)"
              value={form.destination}
              onChange={set("destination")}
            />
            <input
              className={INPUT}
              placeholder="Vehicle (e.g. TR-449)"
              value={form.vehicle}
              onChange={set("vehicle")}
            />
            <input
              className={INPUT}
              placeholder="Shipment code (optional)"
              value={form.code}
              onChange={set("code")}
            />
            <input
              className={INPUT}
              type="number"
              placeholder="Weight (kg)"
              value={form.weightKg}
              onChange={set("weightKg")}
            />
            <input
              className={INPUT}
              placeholder="ETA (e.g. 2h 45m rem.)"
              value={form.etaText}
              onChange={set("etaText")}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-cg-lime/50 px-6 py-4">
          <button
            type="button"
            className={BTN_GHOST}
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className={`${BTN_DARK} disabled:opacity-50`}
            onClick={() => onSubmit(form)}
            disabled={busy}
          >
            {busy ? "Saving\u2026" : isEdit ? "Save changes" : "Dispatch"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// Popup for relocating the estate warehouse marker shown on the live map.
function WarehouseModal({ initial, busy, error, onCancel, onSubmit }) {
  const [form, setForm] = useState(initial);
  useEffect(() => setForm(initial), [initial]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return createPortal(
    <div className="fixed inset-0 z-[1200] grid place-items-center bg-black/40 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl">
        <ModalHeader
          title="Edit warehouse location"
          subtitle="Moves the warehouse marker on the live map and every driver tracking page."
          onClose={onCancel}
        />
        <div className="space-y-3 p-6">
          {error ? (
            <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          ) : null}
          <label className="block text-xs font-semibold text-cg-dark/70">
            Warehouse name
            <input
              className={`${INPUT} mt-1 w-full`}
              placeholder="Warehouse name"
              value={form.name}
              onChange={set("name")}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-semibold text-cg-dark/70">
              Latitude
              <input
                className={`${INPUT} mt-1 w-full`}
                type="number"
                step="0.000001"
                placeholder="24.3065"
                value={form.lat}
                onChange={set("lat")}
              />
            </label>
            <label className="block text-xs font-semibold text-cg-dark/70">
              Longitude
              <input
                className={`${INPUT} mt-1 w-full`}
                type="number"
                step="0.000001"
                placeholder="91.7296"
                value={form.lng}
                onChange={set("lng")}
              />
            </label>
          </div>
          <p className="text-xs text-cg-dark/50">
            Tip: right-click a spot in Google Maps to copy its latitude,
            longitude.
          </p>
        </div>
        <div className="flex justify-end gap-2 border-t border-cg-lime/50 px-6 py-4">
          <button
            type="button"
            className={BTN_GHOST}
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className={`${BTN_DARK} disabled:opacity-50`}
            onClick={() => onSubmit(form)}
            disabled={busy}
          >
            {busy ? "Saving\u2026" : "Save location"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// Live Supply board WebSocket endpoint. Falls back to the local backend; can be
// overridden with VITE_SUPPLY_WS_URL for other environments.
// VITE_SUPPLY_WS_URL still overrides if you need a different socket host;
// otherwise this follows VITE_API_URL, so one variable configures everything.
const SUPPLY_WS_URL =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_SUPPLY_WS_URL) ||
  `${WS_BASE}/ws/supply`;

// Generic confirm dialog (same chrome as the other popups) used for
// destructive actions like deleting a shipment.
function ConfirmModal({
  title,
  message,
  confirmLabel = "Delete",
  busy,
  error,
  onCancel,
  onConfirm,
}) {
  return createPortal(
    <div className="fixed inset-0 z-[1200] grid place-items-center bg-black/40 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl">
        <ModalHeader title={title} onClose={onCancel} />
        <div className="space-y-3 p-6">
          {error ? (
            <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          ) : null}
          <p className="text-sm leading-relaxed text-cg-dark/80">{message}</p>
        </div>
        <div className="flex justify-end gap-2 border-t border-cg-lime/50 px-6 py-4">
          <button
            type="button"
            className={BTN_GHOST}
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-50"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "Deleting\u2026" : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// Small auto-dismissing success popup (bottom-center) for confirmations like
// "Shipment deleted".
function Toast({ message, onClose }) {
  const cbRef = useRef(onClose);
  cbRef.current = onClose;
  useEffect(() => {
    if (!message) return undefined;
    const id = setTimeout(() => cbRef.current(), 2500);
    return () => clearTimeout(id);
  }, [message]);
  if (!message) return null;
  return createPortal(
    <div className="fixed bottom-6 left-1/2 z-[1210] -translate-x-1/2">
      <div className="flex items-center gap-2 rounded-full bg-cg-dark px-4 py-2 text-sm font-semibold text-white shadow-lg">
        <LuCheckCheck size={16} className="text-cg-lime" />
        {message}
      </div>
    </div>,
    document.body,
  );
}

export default function Supply() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [summary, setSummary] = useState(null);
  const [shipments, setShipments] = useState([]);
  const [stock, setStock] = useState([]);
  const [batches, setBatches] = useState([]);
  const [sales, setSales] = useState(null);
  const [salesPage, setSalesPage] = useState(0);
  const [routePage, setRoutePage] = useState(0);
  const [batchPage, setBatchPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [warehouse, setWarehouse] = useState(null);
  const [copied, setCopied] = useState(false);

  const [showDispatch, setShowDispatch] = useState(false);
  const [busy, setBusy] = useState(false);

  const [editing, setEditing] = useState(null);
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState("");

  const [showWarehouse, setShowWarehouse] = useState(false);
  const [whBusy, setWhBusy] = useState(false);
  const [whError, setWhError] = useState("");

  const [selectedId, setSelectedId] = useState(null);
  const [shipPage, setShipPage] = useState(0);

  const [deleting, setDeleting] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [toast, setToast] = useState("");

  const loadBoard = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [s, sh, st, b, wh] = await Promise.all([
        api.get("/supply/summary"),
        api.get("/supply/shipments"),
        api.get("/supply/stock"),
        api.get("/supply/batches"),
        api.get("/supply/warehouse"),
      ]);
      setSummary(s.data);
      setShipments(sh.data);
      setStock(st.data);
      setBatches(b.data);
      setWarehouse(wh.data);
      setRoutePage(0);
      setBatchPage(0);
    } catch {
      setError("Could not load the supply chain board. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSales = useCallback(async (page) => {
    try {
      const { data } = await api.get("/supply/sales", {
        params: { page, size: PAGE_SIZE },
      });
      setSales(data);
    } catch {
      setSales(null);
    }
  }, []);

  useEffect(() => {
    loadBoard();
  }, [loadBoard]);

  useEffect(() => {
    loadSales(salesPage);
  }, [salesPage, loadSales]);

  // Refresh live positions + KPIs WITHOUT resetting the route/batch pagination,
  // so the map and tracker stay fresh while an admin is browsing.
  const refreshLive = useCallback(async () => {
    try {
      const [s, sh] = await Promise.all([
        api.get("/supply/summary"),
        api.get("/supply/shipments"),
      ]);
      setSummary(s.data);
      setShipments(sh.data);
    } catch {
      /* keep the last good data on transient errors */
    }
  }, []);

  // Fallback safety-net poll. The live WebSocket below is what makes the board
  // update in real time; this slower interval only guarantees the data still
  // recovers if the socket happens to be disconnected.
  useEffect(() => {
    const id = setInterval(refreshLive, 12000);
    return () => clearInterval(id);
  }, [refreshLive]);

  // Keep the long-lived WebSocket handler pointed at the latest loaders without
  // forcing a reconnect on every render.
  const refreshLiveRef = useRef(refreshLive);
  const loadSalesRef = useRef(loadSales);
  const salesPageRef = useRef(salesPage);
  refreshLiveRef.current = refreshLive;
  loadSalesRef.current = loadSales;
  salesPageRef.current = salesPage;

  const [wsLive, setWsLive] = useState(false);

  // Live Supply board over WebSocket (ws://.../ws/supply). The backend pushes a
  // tiny {channel:"supply",scope} signal on every GPS ping / shipment /
  // warehouse change; we react by re-fetching the affected slice, so KPIs,
  // shipments, the map and the sales ledger all update within a fraction of a
  // second instead of waiting for the poll. Auto-reconnects every 5s; while it
  // is offline the fallback poll above keeps the data fresh.
  useEffect(() => {
    let retry;
    let closedByUs = false;
    let ws;

    const handle = (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }
      if (!msg || msg.channel !== "supply") return;
      // Any signal refreshes live positions + KPIs; a board-level change also
      // refreshes the current page of the sales ledger.
      refreshLiveRef.current();
      if (msg.scope === "board") {
        loadSalesRef.current(salesPageRef.current);
      }
    };

    const connect = () => {
      try {
        ws = new WebSocket(SUPPLY_WS_URL);
      } catch {
        return; // browser blocked the URL; stay on the fallback poll
      }
      ws.onopen = () => setWsLive(true);
      ws.onmessage = (e) => handle(e.data);
      ws.onerror = () => ws.close();
      ws.onclose = () => {
        setWsLive(false);
        if (!closedByUs) retry = setTimeout(connect, 5000);
      };
    };

    connect();
    return () => {
      closedByUs = true;
      clearTimeout(retry);
      if (ws) ws.close();
    };
  }, []);

  const dispatchShipment = async (values) => {
    if (!values.origin.trim() || !values.destination.trim()) {
      setError("Origin and destination are required to dispatch.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.post("/supply/shipments", {
        code: values.code.trim(),
        vehicle: values.vehicle.trim(),
        origin: values.origin.trim(),
        destination: values.destination.trim(),
        weightKg: values.weightKg ? Number(values.weightKg) : 0,
        etaText: values.etaText.trim(),
        status: "LOADING",
      });
      setShowDispatch(false);
      loadBoard();
    } catch {
      setError("Could not dispatch the shipment.");
    } finally {
      setBusy(false);
    }
  };

  const openEdit = (s) => {
    setEditError("");
    setEditing(s);
  };

  const saveEdit = async (values) => {
    if (!editing) return;
    if (!values.origin.trim() || !values.destination.trim()) {
      setEditError("Origin and destination are required.");
      return;
    }
    setEditBusy(true);
    setEditError("");
    try {
      await api.put(`/supply/shipments/${editing.id}`, {
        code: values.code.trim(),
        vehicle: values.vehicle.trim(),
        origin: values.origin.trim(),
        destination: values.destination.trim(),
        weightKg: values.weightKg ? Number(values.weightKg) : 0,
        etaText: values.etaText.trim(),
      });
      setEditing(null);
      loadBoard();
    } catch {
      setEditError("Could not save the shipment changes.");
    } finally {
      setEditBusy(false);
    }
  };

  const changeStatus = async (shipment, status) => {
    if (!shipment || shipment.status === status) return;
    setError("");
    try {
      await api.patch(`/supply/shipments/${shipment.id}/status`, { status });
      refreshLive();
    } catch {
      setError("Could not update the shipment status.");
    }
  };

  // Deletion is confirmed through a styled popup (see ConfirmModal) rather than
  // the browser's window.confirm, and reports success via a toast.
  const removeShipment = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError("");
    const code = deleting.code;
    try {
      await api.delete(`/supply/shipments/${deleting.id}`);
      if (selectedId === deleting.id) setSelectedId(null);
      setDeleting(null);
      setToast(`Shipment ${code} deleted`);
      loadBoard();
    } catch {
      setDeleteError("Could not delete the shipment.");
    } finally {
      setDeleteBusy(false);
    }
  };

  const saveWarehouse = async (values) => {
    if (!values.name.trim()) {
      setWhError("Warehouse name is required.");
      return;
    }
    const lat = Number(values.lat);
    const lng = Number(values.lng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      setWhError("Latitude and longitude must be valid numbers.");
      return;
    }
    setWhBusy(true);
    setWhError("");
    try {
      const { data } = await api.put("/supply/warehouse", {
        name: values.name.trim(),
        lat,
        lng,
      });
      setWarehouse(data);
      setShowWarehouse(false);
    } catch {
      setWhError("Could not update the warehouse location.");
    } finally {
      setWhBusy(false);
    }
  };

  const activeShipment =
    (selectedId != null && shipments.find((s) => s.id === selectedId)) ||
    shipments.find((s) => s.status === "IN_TRANSIT") ||
    shipments.find((s) => s.status !== "DELIVERED") ||
    shipments[0] ||
    null;
  const activeStep = activeShipment
    ? STEP_ORDER.indexOf(activeShipment.status)
    : -1;

  const allRoutes = shipments.filter((s) => s.status !== "DELIVERED");
  const trucks = shipments
    .filter((s) => s.live && s.currentLat != null && s.currentLng != null)
    .map((s) => ({
      id: s.id,
      code: s.code,
      vehicle: s.vehicle,
      speedKmh: s.speedKmh,
      origin: s.origin,
      destination: s.destination,
      lat: s.currentLat,
      lng: s.currentLng,
    }));
  const driverLink = activeShipment?.trackToken
    ? `${window.location.origin}/track/${activeShipment.trackToken}`
    : "";

  const copyDriverLink = async () => {
    if (!driverLink) return;
    try {
      await navigator.clipboard.writeText(driverLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const routeTotalPages = Math.max(
    1,
    Math.ceil(allRoutes.length / ROUTE_PAGE_SIZE),
  );
  const routeStart = routePage * ROUTE_PAGE_SIZE;
  const routeSlice = allRoutes.slice(routeStart, routeStart + ROUTE_PAGE_SIZE);

  const batchTotalPages = Math.max(
    1,
    Math.ceil(batches.length / BATCH_PAGE_SIZE),
  );
  const batchStart = batchPage * BATCH_PAGE_SIZE;
  const batchSlice = batches.slice(batchStart, batchStart + BATCH_PAGE_SIZE);

  const shipTotalPages = Math.max(
    1,
    Math.ceil(shipments.length / SHIP_PAGE_SIZE),
  );
  const safeShipPage = Math.min(shipPage, shipTotalPages - 1);
  const shipStart = safeShipPage * SHIP_PAGE_SIZE;
  const shipSlice = shipments.slice(shipStart, shipStart + SHIP_PAGE_SIZE);

  const editInitial = editing
    ? {
        code: editing.code || "",
        vehicle: editing.vehicle || "",
        origin: editing.origin || "",
        destination: editing.destination || "",
        weightKg: editing.weightKg != null ? String(editing.weightKg) : "",
        etaText: editing.etaText || "",
      }
    : EMPTY_FORM;

  const whInitial = warehouse
    ? {
        name: warehouse.name || "",
        lat: warehouse.lat != null ? String(warehouse.lat) : "",
        lng: warehouse.lng != null ? String(warehouse.lng) : "",
      }
    : { name: "", lat: "", lng: "" };

  const maxStock = stock.reduce(
    (m, x) => Math.max(m, Number(x.weightKg || 0)),
    0,
  );
  const totalStock = stock.reduce((sum, x) => sum + Number(x.weightKg || 0), 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-cg-darker">
              Supply Chain Overview
            </h1>
            <InfoTip text="Outbound logistics for the estate: shipment tracking, warehouse stock, dispatch readiness and the sales ledger. KPIs are computed live from current data." />
            <span
              title={
                wsLive
                  ? "Live: the board updates in real time over a WebSocket."
                  : "Offline: reconnecting\u2026 the board is refreshing on the fallback timer."
              }
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                wsLive
                  ? "bg-cg-lime/40 text-cg-green"
                  : "bg-cg-dark/5 text-cg-dark/40"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  wsLive ? "bg-cg-green" : "bg-cg-dark/30"
                }`}
              />
              {wsLive ? "Live" : "Offline"}
            </span>
          </div>
          <p className="text-sm text-cg-dark/60">
            Real time logistics tracking
          </p>
        </div>
        {isAdmin ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setWhError("");
                setShowWarehouse(true);
              }}
              className={`${BTN_GHOST} inline-flex items-center gap-1`}
            >
              <LuMapPin size={16} /> Edit warehouse
            </button>
            <button
              type="button"
              onClick={() => {
                setError("");
                setShowDispatch(true);
              }}
              className={`${BTN_DARK} inline-flex items-center gap-1`}
            >
              <LuPlus size={16} /> Dispatch Shipment
            </button>
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {/* Dispatch / edit / warehouse popups render at the end of the component. */}

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          icon={LuBoxes}
          label="Tea in Stock"
          value={num(summary?.teaInStockKg)}
          unit="kg"
        />
        <StatCard
          icon={LuTruck}
          label="In Transit"
          value={num(summary?.inTransitKg)}
          unit="kg"
        />
        <StatCard
          icon={LuCheckCheck}
          label="Delivered"
          value={num(summary?.deliveredKg)}
          unit="kg"
        />
        <StatCard
          icon={LuTrendingUp}
          label="Volume Sold"
          value={num(summary?.volumeSoldKg)}
          unit="kg"
        />
        <StatCard
          icon={LuReceipt}
          label="Active Shipments"
          value={
            summary ? String(summary.activeShipments).padStart(2, "0") : "—"
          }
        />
        <StatCard
          icon={LuCalendarCheck}
          label="Pending Orders"
          value={summary ? String(summary.pendingOrders).padStart(2, "0") : "—"}
        />
      </div>

      {/* Live tracker + active routes */}
      <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-[1fr_minmax(0,340px)]">
        <div className={`${CARD} h-full`}>
          <div className={HEADER_BAR}>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-cg-darker">
                Live Shipment Tracker
              </h2>
              <InfoTip text="Follows the current outbound shipment through Loading → In Transit → At Weigh-In → Delivered, with a live GPS map fed by the driver's phone." />
            </div>
            {activeShipment ? (
              <div className="flex items-center gap-2">
                {isAdmin && driverLink ? (
                  <button
                    type="button"
                    onClick={copyDriverLink}
                    title="Copy the public tracking link to send to the driver"
                    className="inline-flex items-center gap-1 rounded-full bg-white/70 px-3 py-1 text-xs font-semibold text-cg-green hover:bg-white"
                  >
                    <LuCopy size={13} />
                    {copied ? "Link copied!" : "Copy driver link"}
                  </button>
                ) : null}
                <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-semibold text-cg-green">
                  ACTIVE: {activeShipment.code}
                </span>
              </div>
            ) : null}
          </div>

          {activeShipment ? (
            <>
              <div className="flex flex-1 flex-col p-5">
                <div className="flex items-center">
                  {TRACKER_STEPS.map((step, i) => {
                    const Icon = step.icon;
                    const done = activeStep >= 0 && i <= activeStep;
                    return (
                      <div
                        key={step.key}
                        className="flex flex-1 items-center last:flex-none"
                      >
                        <div className="flex flex-col items-center">
                          <span
                            className={`grid h-10 w-10 place-items-center rounded-full ${
                              done
                                ? "bg-cg-green text-white"
                                : "bg-cg-lime/40 text-cg-dark/40"
                            }`}
                          >
                            <Icon size={18} />
                          </span>
                          <span
                            className={`mt-1 text-[11px] font-semibold ${
                              done ? "text-cg-darker" : "text-cg-dark/40"
                            }`}
                          >
                            {step.label}
                          </span>
                        </div>
                        {i < TRACKER_STEPS.length - 1 ? (
                          <div
                            className={`mx-1 h-0.5 flex-1 ${
                              i < activeStep ? "bg-cg-green" : "bg-cg-lime/50"
                            }`}
                          />
                        ) : null}
                      </div>
                    );
                  })}
                </div>

                {isAdmin ? (
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-cg-dark/50">
                      Set status
                    </span>
                    {TRACKER_STEPS.map((step) => {
                      const current = activeShipment.status === step.key;
                      return (
                        <button
                          key={step.key}
                          type="button"
                          onClick={() => changeStatus(activeShipment, step.key)}
                          className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${
                            current
                              ? "bg-cg-green text-white"
                              : "bg-cg-lime/40 text-cg-dark/70 hover:bg-cg-lime"
                          }`}
                        >
                          {step.label}
                        </button>
                      );
                    })}
                  </div>
                ) : null}

                <div className="relative mt-4 min-h-[16rem] flex-1 overflow-hidden rounded-xl border border-cg-lime">
                  <ErrorBoundary fallback={<MapFallback />}>
                    <Suspense fallback={<MapLoading />}>
                      <ShipmentMap
                        warehouse={warehouse}
                        trucks={trucks}
                        focus={
                          activeShipment && activeShipment.currentLat != null
                            ? {
                                lat: activeShipment.currentLat,
                                lng: activeShipment.currentLng,
                              }
                            : null
                        }
                      />
                    </Suspense>
                  </ErrorBoundary>
                  <div className="pointer-events-none absolute bottom-2 left-2 z-[500] rounded-lg bg-white/90 px-2.5 py-1 text-xs shadow">
                    {activeShipment.live ? (
                      <span className="font-semibold text-cg-green">
                        ● Live · Vehicle {activeShipment.vehicle || "—"} ·{" "}
                        {activeShipment.speedKmh ?? 0} km/h
                      </span>
                    ) : (
                      <span className="font-semibold text-cg-dark/50">
                        Awaiting driver location · Vehicle{" "}
                        {activeShipment.vehicle || "—"}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className={FOOTER_BAR}>
                <span className="text-xs font-semibold text-cg-dark/70">
                  {activeShipment.origin} → {activeShipment.destination}
                </span>
                <span className="text-xs text-cg-dark/60">
                  {activeShipment.etaText || "ETA —"}
                </span>
              </div>
            </>
          ) : (
            <div className="flex-1 p-5">
              <p className="text-sm text-cg-dark/50">
                No active shipments right now.
              </p>
            </div>
          )}
        </div>

        <div className={`${CARD} h-full`}>
          <div className={HEADER_BAR}>
            <h2 className="text-base font-bold text-cg-darker">
              Active Routes
            </h2>
            <span className="text-xs font-semibold text-cg-dark/60">
              {allRoutes.length} live
            </span>
          </div>
          <div className="flex-1 p-4">
            {allRoutes.length === 0 ? (
              <p className="text-sm text-cg-dark/50">No routes in progress.</p>
            ) : (
              <div className="flex h-full flex-col gap-2">
                {routeSlice.map((r) => (
                  <div
                    key={r.id}
                    className="flex flex-1 flex-col justify-center rounded-xl border border-cg-lime/60 bg-cg-lime/10 p-3"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-cg-darker">
                        {r.origin} → {r.destination}
                      </p>
                      <span
                        className={`text-[11px] font-semibold ${
                          r.onTime ? "text-emerald-600" : "text-rose-600"
                        }`}
                      >
                        {r.onTime ? "ON TIME" : "DELAYED"}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs text-cg-dark/50">
                      <span>
                        {r.code} · {num(r.weightKg)} kg
                      </span>
                      <span>{r.etaText || ""}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className={FOOTER_BAR}>
            <Pager
              page={routePage}
              totalPages={routeTotalPages}
              total={allRoutes.length}
              size={ROUTE_PAGE_SIZE}
              count={routeSlice.length}
              noun="routes"
              onPrev={() => setRoutePage((p) => Math.max(0, p - 1))}
              onNext={() =>
                setRoutePage((p) => Math.min(routeTotalPages - 1, p + 1))
              }
            />
          </div>
        </div>
      </div>

      {/* Manage shipments — focus on map, manual status, edit, delete */}
      <div className={CARD}>
        <div className={HEADER_BAR}>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-cg-darker">
              Manage Shipments
            </h2>
            <InfoTip text="Every shipment, including delivered ones. Focus one on the live map, set its status by hand, edit its details, or delete old rows to keep the database lean." />
          </div>
          <span className="text-xs font-semibold text-cg-dark/60">
            {shipments.length} total
          </span>
        </div>
        {shipments.length === 0 ? (
          <p className="p-5 text-sm text-cg-dark/50">No shipments yet.</p>
        ) : (
          <>
            <div className="flex-1 overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead>
                  <tr className="bg-[#D3FFAC] text-[11px] uppercase tracking-wide text-cg-dark/60">
                    <th className="px-5 py-2.5">Code</th>
                    <th className="py-2.5 pr-3">Route</th>
                    <th className="py-2.5 pr-3">Vehicle</th>
                    <th className="py-2.5 pr-3 text-right">Weight</th>
                    <th className="py-2.5 pr-3">Status</th>
                    <th className="py-2.5 pr-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {shipSlice.map((s) => (
                    <tr
                      key={s.id}
                      className={`border-b border-cg-lime/30 ${
                        s.id === activeShipment?.id ? "bg-cg-lime/10" : ""
                      }`}
                    >
                      <td className="px-5 py-2.5 font-semibold text-cg-darker">
                        {s.code}
                        {s.live ? (
                          <span className="ml-1 text-[10px] font-semibold text-cg-green">
                            ● live
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2.5 pr-3 text-cg-dark/70">
                        {s.origin} → {s.destination}
                      </td>
                      <td className="py-2.5 pr-3 text-cg-dark/70">
                        {s.vehicle || "—"}
                      </td>
                      <td className="py-2.5 pr-3 text-right text-cg-dark/70">
                        {num(s.weightKg)} kg
                      </td>
                      <td className="py-2.5 pr-3">
                        {isAdmin ? (
                          <select
                            className="rounded-lg border border-cg-lime/70 bg-white px-2 py-1 text-xs font-semibold text-cg-dark focus:border-cg-green focus:outline-none"
                            value={s.status}
                            onChange={(e) => changeStatus(s, e.target.value)}
                          >
                            {STEP_ORDER.map((st) => (
                              <option key={st} value={st}>
                                {st.replace(/_/g, " ")}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <Badge map={SHIP_STATUS_BADGE} value={s.status} />
                        )}
                      </td>
                      <td className="py-2.5 pr-5">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            title="Focus on the live map"
                            onClick={() => setSelectedId(s.id)}
                            className={`rounded-lg p-1.5 transition hover:bg-cg-lime ${
                              s.id === activeShipment?.id
                                ? "text-cg-green"
                                : "text-cg-dark/60"
                            }`}
                          >
                            <LuMapPin size={15} />
                          </button>
                          {isAdmin ? (
                            <>
                              <button
                                type="button"
                                title="Edit shipment"
                                onClick={() => openEdit(s)}
                                className="rounded-lg p-1.5 text-cg-dark/60 transition hover:bg-cg-lime"
                              >
                                <LuPencil size={15} />
                              </button>
                              <button
                                type="button"
                                title="Delete shipment"
                                onClick={() => {
                                  setDeleteError("");
                                  setDeleting(s);
                                }}
                                className="rounded-lg p-1.5 text-rose-500 transition hover:bg-rose-50"
                              >
                                <LuTrash2 size={15} />
                              </button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className={FOOTER_BAR}>
              <Pager
                page={safeShipPage}
                totalPages={shipTotalPages}
                total={shipments.length}
                size={SHIP_PAGE_SIZE}
                count={shipSlice.length}
                noun="shipments"
                onPrev={() => setShipPage(Math.max(0, safeShipPage - 1))}
                onNext={() =>
                  setShipPage(Math.min(shipTotalPages - 1, safeShipPage + 1))
                }
              />
            </div>
          </>
        )}
      </div>

      {/* Warehouse distribution + dispatch readiness */}
      <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-2">
        <div className={`${CARD} h-full`}>
          <div className={HEADER_BAR}>
            <h2 className="text-base font-bold text-cg-darker">
              Warehouse Stock Distribution
            </h2>
            <InfoTip text="How the warehouse tonnage splits across processing stages, each bar sized against the largest bucket." />
          </div>
          <div className="flex-1 p-5">
            {stock.length === 0 ? (
              <p className="text-sm text-cg-dark/50">No stock recorded.</p>
            ) : (
              <div className="flex h-full flex-col justify-between gap-4">
                {stock.map((b) => {
                  const pct =
                    maxStock > 0
                      ? Math.round((Number(b.weightKg || 0) / maxStock) * 100)
                      : 0;
                  return (
                    <div
                      key={b.stage}
                      className="flex flex-1 flex-col justify-center"
                    >
                      <div className="mb-1 flex items-center justify-between">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            STOCK_CHIP[b.stage] || "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {b.label}
                        </span>
                        <span className="text-sm font-bold text-cg-darker">
                          {kg(b.weightKg)}
                        </span>
                      </div>
                      <div className="h-4 w-full rounded-full bg-cg-lime/30">
                        <div
                          className={`h-4 rounded-full ${
                            STOCK_BAR[b.stage] || "bg-cg-green"
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className={FOOTER_BAR}>
            <span className="text-xs text-cg-dark/60">
              {stock.length} stages
            </span>
            <span className="text-xs font-semibold text-cg-dark/70">
              Total {kg(totalStock)}
            </span>
          </div>
        </div>

        <div className={`${CARD} h-full`}>
          <div className={HEADER_BAR}>
            <h2 className="text-base font-bold text-cg-darker">
              Dispatch Readiness
            </h2>
            <InfoTip text="Batches queued for dispatch and whether they've cleared the quality gate." />
          </div>
          <div className="flex-1 p-4">
            {batches.length === 0 ? (
              <p className="text-sm text-cg-dark/50">
                No batches in the warehouse.
              </p>
            ) : (
              <div className="flex h-full flex-col gap-2">
                {batchSlice.map((b) => (
                  <div
                    key={b.id}
                    className="flex flex-1 items-center justify-between rounded-xl border border-cg-lime/60 bg-cg-lime/10 p-3"
                  >
                    <div>
                      <p className="text-sm font-semibold text-cg-darker">
                        Batch #{b.batchCode} · Grade {b.grade}
                      </p>
                      <p className="text-xs text-cg-dark/50">
                        Quality:{" "}
                        {b.qualityPct != null
                          ? `${num(b.qualityPct)}%`
                          : "Pending Lab Report"}
                        {b.qualityNote ? ` (${b.qualityNote})` : ""} ·{" "}
                        {num(b.weightKg)} kg available
                      </p>
                    </div>
                    <Badge map={READINESS_BADGE} value={b.readiness} />
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className={FOOTER_BAR}>
            <Pager
              page={batchPage}
              totalPages={batchTotalPages}
              total={batches.length}
              size={BATCH_PAGE_SIZE}
              count={batchSlice.length}
              noun="batches"
              onPrev={() => setBatchPage((p) => Math.max(0, p - 1))}
              onNext={() =>
                setBatchPage((p) => Math.min(batchTotalPages - 1, p + 1))
              }
            />
          </div>
        </div>
      </div>

      {/* Sales transaction ledger */}
      <div className={CARD}>
        <div className={HEADER_BAR}>
          <h2 className="text-base font-bold text-cg-darker">
            Sales Transaction Ledger
          </h2>
          <InfoTip text="Every completed sale with its buyer, volume, rate and settlement status. Paginated on the server." />
        </div>
        {loading && !sales ? (
          <p className="p-5 text-sm text-cg-dark/50">Loading…</p>
        ) : !sales || sales.items.length === 0 ? (
          <p className="p-5 text-sm text-cg-dark/50">
            No transactions recorded.
          </p>
        ) : (
          <>
            <div className="flex-1 overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="bg-[#D3FFAC] text-[11px] uppercase tracking-wide text-cg-dark/60">
                    <th className="px-5 py-2.5">TRX ID</th>
                    <th className="py-2.5 pr-3">Date</th>
                    <th className="py-2.5 pr-3">Grade / Batch</th>
                    <th className="py-2.5 pr-3">Buyer</th>
                    <th className="py-2.5 pr-3 text-right">Volume</th>
                    <th className="py-2.5 pr-3 text-right">Rate/kg</th>
                    <th className="py-2.5 pr-3 text-right">Net Revenue</th>
                    <th className="py-2.5 pr-3">Pay</th>
                    <th className="py-2.5 pr-5">Ship</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.items.map((t) => (
                    <tr key={t.id} className="border-b border-cg-lime/30">
                      <td className="px-5 py-2.5 font-semibold text-cg-darker">
                        {t.trxId}
                      </td>
                      <td className="py-2.5 pr-3 text-cg-dark/70">
                        {shortDate(t.txnDate)}
                      </td>
                      <td className="py-2.5 pr-3 text-cg-dark/70">
                        <span className="font-medium text-cg-darker">
                          {t.grade}
                        </span>
                        {t.batchCode ? (
                          <span className="block text-[11px] text-cg-dark/40">
                            {t.batchCode}
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2.5 pr-3 text-cg-dark/70">{t.buyer}</td>
                      <td className="py-2.5 pr-3 text-right text-cg-dark/70">
                        {num(t.volumeKg)} kg
                      </td>
                      <td className="py-2.5 pr-3 text-right text-cg-dark/70">
                        {taka(t.ratePerKg)}
                      </td>
                      <td className="py-2.5 pr-3 text-right font-semibold text-cg-darker">
                        {taka(t.netRevenue)}
                      </td>
                      <td className="py-2.5 pr-3">
                        <Badge map={PAY_BADGE} value={t.payStatus} />
                      </td>
                      <td className="py-2.5 pr-5">
                        <Badge map={SHIP_BADGE} value={t.shipStatus} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className={FOOTER_BAR}>
              <span className="text-xs text-cg-dark/60">
                Showing {sales.page * sales.size + 1}–
                {sales.page * sales.size + sales.items.length} of{" "}
                {num(sales.total)} transactions
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={sales.page <= 0}
                  onClick={() => setSalesPage((p) => Math.max(0, p - 1))}
                  className={`${BTN_GHOST} disabled:opacity-40`}
                >
                  Previous
                </button>
                <span className="text-xs font-semibold text-cg-dark/60">
                  Page {sales.page + 1} of {Math.max(1, sales.totalPages)}
                </span>
                <button
                  type="button"
                  disabled={sales.page + 1 >= sales.totalPages}
                  onClick={() => setSalesPage((p) => p + 1)}
                  className={`${BTN_GHOST} disabled:opacity-40`}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {isAdmin && showDispatch ? (
        <ShipmentFormModal
          mode="dispatch"
          initial={EMPTY_FORM}
          busy={busy}
          error={error}
          onCancel={() => setShowDispatch(false)}
          onSubmit={dispatchShipment}
        />
      ) : null}

      {isAdmin && editing ? (
        <ShipmentFormModal
          mode="edit"
          initial={editInitial}
          busy={editBusy}
          error={editError}
          onCancel={() => setEditing(null)}
          onSubmit={saveEdit}
        />
      ) : null}

      {isAdmin && showWarehouse ? (
        <WarehouseModal
          initial={whInitial}
          busy={whBusy}
          error={whError}
          onCancel={() => setShowWarehouse(false)}
          onSubmit={saveWarehouse}
        />
      ) : null}

      {isAdmin && deleting ? (
        <ConfirmModal
          title="Delete shipment"
          message={`Are you sure you want to delete shipment ${deleting.code}? This permanently removes it from the database and cannot be undone.`}
          confirmLabel="Delete shipment"
          busy={deleteBusy}
          error={deleteError}
          onCancel={() => setDeleting(null)}
          onConfirm={removeShipment}
        />
      ) : null}

      <Toast message={toast} onClose={() => setToast("")} />
    </div>
  );
}
