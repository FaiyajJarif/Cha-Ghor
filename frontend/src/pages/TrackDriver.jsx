import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useParams } from "react-router-dom";
import api from "../api/client";
import ErrorBoundary from "../components/ErrorBoundary";

// PUBLIC driver page (no login) reached via /track/:token. The token is an
// unguessable per-shipment string generated at dispatch, so it doubles as the
// authorization — matching our auth model where drivers are NOT user accounts.
// The driver taps "Share my location" and the browser streams GPS fixes to the
// backend via watchPosition; admins watch the truck move on the Supply board.

const ShipmentMap = lazy(() => import("../components/admin/ShipmentMap"));

export default function TrackDriver() {
  const { token } = useParams();
  const [track, setTrack] = useState(null);
  const [error, setError] = useState("");
  const [sharing, setSharing] = useState(false);
  const [note, setNote] = useState("");
  const watchId = useRef(null);

  const loadTrack = useCallback(async () => {
    try {
      const { data } = await api.get(`/supply/track/${token}`);
      setTrack(data);
      setError("");
    } catch {
      setError("This tracking link is invalid or has expired.");
    }
  }, [token]);

  // Refresh the route view every 15s (covers a recipient watching without being
  // the one sharing location).
  useEffect(() => {
    loadTrack();
    const id = setInterval(loadTrack, 15000);
    return () => clearInterval(id);
  }, [loadTrack]);

  const sendPing = useCallback(
    async (pos) => {
      const { latitude, longitude, speed, heading } = pos.coords;
      try {
        const { data } = await api.post(`/supply/track/${token}/location`, {
          lat: latitude,
          lng: longitude,
          speedKmh:
            speed != null && !Number.isNaN(speed)
              ? Math.round(speed * 3.6)
              : null,
          headingDeg:
            heading != null && !Number.isNaN(heading) ? heading : null,
        });
        setTrack(data);
        setNote(`Location shared at ${new Date().toLocaleTimeString()}`);
      } catch {
        setNote("Could not send the last location update.");
      }
    },
    [token],
  );

  const startSharing = () => {
    if (!("geolocation" in navigator)) {
      setNote("Geolocation is not supported on this device.");
      return;
    }
    setSharing(true);
    setNote("Getting your location…");
    watchId.current = navigator.geolocation.watchPosition(
      sendPing,
      () => setNote("Location permission denied."),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
  };

  const stopSharing = useCallback(() => {
    if (watchId.current != null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    setSharing(false);
  }, []);

  // Always clear the geolocation watcher when leaving the page.
  useEffect(() => stopSharing, [stopSharing]);

  const warehouse =
    track && track.warehouseLat != null
      ? {
          name: track.warehouseName,
          lat: track.warehouseLat,
          lng: track.warehouseLng,
        }
      : null;
  const trucks =
    track && track.currentLat != null
      ? [
          {
            id: token,
            code: track.code,
            vehicle: track.vehicle,
            speedKmh: track.speedKmh,
            origin: track.origin,
            destination: track.destination,
            lat: track.currentLat,
            lng: track.currentLng,
          },
        ]
      : [];

  return (
    <div className="min-h-screen bg-cg-lime/10 p-4 sm:p-6">
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="rounded-2xl border border-cg-lime/60 bg-white p-5 shadow-sm">
          <h1 className="text-xl font-bold text-cg-darker">
            Cha-Ghor · Shipment tracking
          </h1>
          {error ? (
            <p className="mt-2 text-sm text-rose-600">{error}</p>
          ) : track ? (
            <>
              <p className="mt-1 text-sm text-cg-dark/70">
                {track.code} · {track.origin} → {track.destination}
              </p>
              <p className="mt-0.5 text-xs text-cg-dark/50">
                Vehicle {track.vehicle || "—"} ·{" "}
                {(track.status || "").replace(/_/g, " ")}
                {track.live ? " · LIVE" : ""}
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-cg-dark/50">Loading…</p>
          )}
        </div>

        {track ? (
          <div className="overflow-hidden rounded-2xl border border-cg-lime/60 bg-white shadow-sm">
            <div className="h-80">
              <ErrorBoundary
                fallback={
                  <div className="grid h-full place-items-center p-4 text-center text-sm text-cg-dark/50">
                    Map unavailable. Run: npm i leaflet react-leaflet
                  </div>
                }
              >
                <Suspense
                  fallback={
                    <div className="grid h-full place-items-center text-sm text-cg-dark/40">
                      Loading map…
                    </div>
                  }
                >
                  <ShipmentMap warehouse={warehouse} trucks={trucks} />
                </Suspense>
              </ErrorBoundary>
            </div>
          </div>
        ) : null}

        {track ? (
          <div className="rounded-2xl border border-cg-lime/60 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-cg-darker">
              Driver location sharing
            </p>
            <p className="mt-1 text-xs text-cg-dark/50">
              Tap the button below and keep this page open. Your live location
              is shared with the Cha-Ghor logistics team while you're on the
              road.
            </p>
            <div className="mt-3 flex gap-2">
              {sharing ? (
                <button
                  type="button"
                  onClick={stopSharing}
                  className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white"
                >
                  Stop sharing
                </button>
              ) : (
                <button
                  type="button"
                  onClick={startSharing}
                  className="rounded-xl bg-cg-green px-4 py-2 text-sm font-semibold text-white"
                >
                  Share my location
                </button>
              )}
            </div>
            {note ? (
              <p className="mt-2 text-xs text-cg-dark/50">{note}</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
