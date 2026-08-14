import { useEffect, useRef } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Circle,
  Polyline,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Presentational Leaflet map for the Supply Chain board and the public driver
// page. Renders the estate warehouse (with a 2 km radius ring) and a live truck
// marker for every shipment that has reported a GPS position. All data arrives
// through props so this can be lazy-loaded behind an ErrorBoundary — Leaflet
// touches window/document and must never run during the first paint.
//
// We use emoji divIcons instead of the default Leaflet marker so we don't have
// to ship / rewrite the marker image assets that Vite otherwise breaks.

const SRIMANGAL = [24.3065, 91.7296];

const warehouseIcon = L.divIcon({
  className: "cg-map-icon",
  html: '<div style="font-size:26px;line-height:26px">🏭</div>',
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});

const truckIcon = L.divIcon({
  className: "cg-map-icon",
  html: '<div style="font-size:24px;line-height:24px">🚚</div>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

// Recenters the map only when the admin picks a DIFFERENT target (focusId),
// never on every GPS poll — otherwise the view would keep snapping back to the
// truck and you could never pan around or jump to the warehouse. MapContainer's
// `center` prop is only the INITIAL center, so we nudge the view imperatively.
function Recenter({ point, focusId }) {
  const map = useMap();
  const pointRef = useRef(point);
  pointRef.current = point;
  useEffect(() => {
    const p = pointRef.current;
    if (p && p[0] != null && p[1] != null) {
      map.setView(p, Math.max(map.getZoom(), 11));
    }
  }, [focusId, map]);
  return null;
}

// On-map control strip (top-right): one tap to jump to the warehouse or to any
// live truck, so you can swap between shipments in transit and always find your
// way back to the estate. Talks to the Leaflet map directly so it never fights
// the React render / polling cycle.
function MapControls({ warehouse, trucks }) {
  const map = useMap();
  const boxRef = useRef(null);
  useEffect(() => {
    if (boxRef.current) {
      L.DomEvent.disableClickPropagation(boxRef.current);
      L.DomEvent.disableScrollPropagation(boxRef.current);
    }
  }, []);
  const go = (lat, lng) => {
    if (lat == null || lng == null) return;
    map.flyTo([Number(lat), Number(lng)], Math.max(map.getZoom(), 12), {
      duration: 0.6,
    });
  };
  if (!warehouse && trucks.length === 0) return null;
  const btnStyle = {
    display: "block",
    width: "100%",
    textAlign: "left",
    whiteSpace: "nowrap",
    border: "none",
    background: "transparent",
    borderRadius: "6px",
    padding: "4px 8px",
    fontSize: "12px",
    fontWeight: 600,
    color: "#1f2a1a",
    cursor: "pointer",
  };
  return (
    <div className="leaflet-top leaflet-right">
      <div
        ref={boxRef}
        className="leaflet-control"
        style={{
          margin: "10px",
          background: "white",
          borderRadius: "10px",
          boxShadow: "0 1px 5px rgba(0,0,0,0.3)",
          padding: "6px",
          maxHeight: "190px",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            fontSize: "10px",
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "#6b7280",
            padding: "2px 8px 4px",
          }}
        >
          Jump to
        </div>
        {warehouse ? (
          <button
            type="button"
            onClick={() => go(warehouse.lat, warehouse.lng)}
            style={btnStyle}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#eef7e2")}
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = "transparent")
            }
          >
            🏭 {warehouse.name || "Warehouse"}
          </button>
        ) : null}
        {trucks.map((t) => (
          <button
            key={t.id ?? t.code}
            type="button"
            onClick={() => go(t.lat, t.lng)}
            style={btnStyle}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#eef7e2")}
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = "transparent")
            }
          >
            🚚 {t.code}
            {t.speedKmh != null ? ` · ${t.speedKmh} km/h` : ""}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ShipmentMap({
  warehouse,
  trucks = [],
  focus = null,
  focusId = null,
  height = "100%",
}) {
  const focusPoint =
    focus && focus.lat != null && focus.lng != null
      ? [Number(focus.lat), Number(focus.lng)]
      : null;
  const center = focusPoint
    ? focusPoint
    : warehouse
      ? [Number(warehouse.lat), Number(warehouse.lng)]
      : trucks.length
        ? [Number(trucks[0].lat), Number(trucks[0].lng)]
        : SRIMANGAL;

  return (
    <MapContainer
      center={center}
      zoom={11}
      scrollWheelZoom={false}
      style={{ height, width: "100%" }}
    >
      <Recenter point={focusPoint} focusId={focusId} />
      <MapControls warehouse={warehouse} trucks={trucks} />
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {warehouse ? (
        <>
          <Marker
            position={[Number(warehouse.lat), Number(warehouse.lng)]}
            icon={warehouseIcon}
          >
            <Popup>{warehouse.name || "Warehouse"}</Popup>
          </Marker>
          <Circle
            center={[Number(warehouse.lat), Number(warehouse.lng)]}
            radius={2000}
            pathOptions={{
              color: "#4b7f2f",
              fillColor: "#95C260",
              fillOpacity: 0.12,
            }}
          />
        </>
      ) : null}

      {warehouse
        ? trucks.map((t) => (
            <Polyline
              key={`route-${t.id ?? t.code}`}
              positions={[
                [Number(warehouse.lat), Number(warehouse.lng)],
                [Number(t.lat), Number(t.lng)],
              ]}
              pathOptions={{
                color: "#4b7f2f",
                weight: 2,
                opacity: 0.7,
                dashArray: "6 8",
              }}
            />
          ))
        : null}

      {trucks.map((t) => (
        <Marker
          key={t.id ?? t.code}
          position={[Number(t.lat), Number(t.lng)]}
          icon={truckIcon}
        >
          <Popup>
            <strong>{t.code}</strong>
            <br />
            {t.vehicle || "—"}
            {t.speedKmh != null ? ` · ${t.speedKmh} km/h` : ""}
            <br />
            {t.origin} → {t.destination}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
