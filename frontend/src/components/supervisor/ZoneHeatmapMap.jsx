import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Circle,
  Marker,
  Tooltip,
  Popup,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import { LuHouse, LuLocateFixed } from "react-icons/lu";
import "leaflet/dist/leaflet.css";

// The attendance heatmap on a real map.
//
// Visual approach borrowed from ShipmentMap on the admin side, which reads far
// better than a bare Leaflet canvas: emoji divIcons instead of the default
// marker images (which Vite breaks anyway), and a floating control panel drawn
// as a real Leaflet control so it never fights the React render cycle.
//
// Two basemaps. Satellite is the default because a tea estate is fields and
// tree lines — a road map shows almost nothing useful out here, and the
// original design was drawn over imagery.
//
// Leaflet touches window/document, so this file is lazy-loaded behind an
// ErrorBoundary and must never render during first paint.

const SYLHET = [24.8949, 91.8687];

const BAND_COLOR = {
  high: "#3f8f43",
  avg: "#95c260",
  low: "#d98b8b",
  late: "#e0a92b",
  empty: "#9bb99b",
};

const BASEMAPS = {
  satellite: {
    label: "Satellite",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics",
    max: 19,
  },
  map: {
    label: "Map",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    max: 19,
  },
};

// A field's pin: the zone code in a coloured chip, so the map is readable at a
// glance without opening a tooltip.
function zoneIcon(label, band, pct) {
  const colour = BAND_COLOR[band];
  return L.divIcon({
    className: "cg-zone-icon",
    html: `<div style="
        display:flex;align-items:center;gap:4px;
        background:${colour};color:#fff;
        border:2px solid #fff;border-radius:999px;
        padding:2px 8px;font-size:11px;font-weight:800;
        box-shadow:0 1px 4px rgba(0,0,0,.4);white-space:nowrap;
      ">${label}${pct === null ? "" : ` · ${pct}%`}</div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

function Recenter({ center, zoom }) {
  const map = useMap();
  const ref = useRef(center);
  ref.current = center;
  useEffect(() => {
    const c = ref.current;
    if (c) map.flyTo(c, zoom ?? Math.max(map.getZoom(), 15), { duration: 0.6 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center?.[0], center?.[1], map]);
  return null;
}

// Click-to-place. Enabled either when a specific field is being moved
// (editingZoneId) OR when the page is in "drop a new marker" mode — the Fields
// board uses the second, where you click first and choose the field after.
//
// The crosshair cursor is set imperatively on the map container: without it
// there is no signal that the map has become clickable, which is exactly why
// placing felt broken.
function ClickToPlace({ enabled, onPick }) {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    el.style.cursor = enabled ? "crosshair" : "";
    return () => {
      el.style.cursor = "";
    };
  }, [enabled, map]);
  useMapEvents({
    click(e) {
      if (enabled) onPick([e.latlng.lat, e.latlng.lng]);
    },
  });
  return null;
}

// Floating control: search, home, my location, and one-tap jump to any field.
// Rendered inside a .leaflet-control so Leaflet positions it, with click and
// scroll propagation disabled — otherwise typing in the box pans the map.
function MapControls({ tiles, onGoHome }) {
  const map = useMap();
  const boxRef = useRef(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (boxRef.current) {
      L.DomEvent.disableClickPropagation(boxRef.current);
      L.DomEvent.disableScrollPropagation(boxRef.current);
    }
  }, []);

  const go = (lat, lng, zoom = 16) => {
    if (lat == null || lng == null) return;
    map.flyTo([Number(lat), Number(lng)], Math.max(map.getZoom(), zoom), {
      duration: 0.7,
    });
  };

  // Browser geolocation. Needs HTTPS (or localhost) and the user's permission —
  // both failure modes are reported rather than silently doing nothing.
  const myLocation = () => {
    if (!navigator.geolocation) {
      setMsg("This browser cannot report your location.");
      return;
    }
    setBusy(true);
    setMsg("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBusy(false);
        go(pos.coords.latitude, pos.coords.longitude, 17);
      },
      (err) => {
        setBusy(false);
        setMsg(
          err.code === 1
            ? "Location permission denied."
            : "Could not get your location. Location needs HTTPS or localhost.",
        );
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  // Place search via Nominatim (OpenStreetMap's free geocoder, no API key).
  // One request per submit, never per keystroke — their usage policy asks for
  // no automated bulk querying.
  const search = async (e) => {
    e.preventDefault();
    const term = q.trim();
    if (!term) return;
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(term)}`,
        { headers: { Accept: "application/json" } },
      );
      const hits = await res.json();
      if (!hits.length) {
        setMsg("No place found with that name.");
      } else {
        go(Number(hits[0].lat), Number(hits[0].lon), 15);
        setMsg("");
      }
    } catch {
      setMsg("Search is unavailable offline.");
    } finally {
      setBusy(false);
    }
  };

  const btn = {
    display: "flex",
    alignItems: "center",
    gap: 6,
    width: "100%",
    textAlign: "left",
    border: "none",
    background: "transparent",
    borderRadius: 6,
    padding: "5px 8px",
    fontSize: 12,
    fontWeight: 600,
    color: "#1f2a1a",
    cursor: "pointer",
  };
  const hover = (on) => (e) =>
    (e.currentTarget.style.background = on ? "#eef7e2" : "transparent");

  return (
    <div className="leaflet-top leaflet-right">
      <div
        ref={boxRef}
        className="leaflet-control"
        style={{
          margin: 10,
          background: "white",
          borderRadius: 10,
          boxShadow: "0 1px 5px rgba(0,0,0,.3)",
          padding: 6,
          width: 210,
        }}
      >
        <form onSubmit={search} style={{ display: "flex", gap: 4 }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search a place…"
            style={{
              flex: 1,
              minWidth: 0,
              border: "1px solid #d5e3c8",
              borderRadius: 6,
              padding: "4px 7px",
              fontSize: 12,
              outline: "none",
            }}
          />
          <button
            type="submit"
            disabled={busy}
            style={{
              border: "none",
              background: "#1c3a29",
              color: "white",
              borderRadius: 6,
              padding: "4px 8px",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Go
          </button>
        </form>

        <div style={{ display: "flex", gap: 4, marginTop: 5 }}>
          <button
            type="button"
            onClick={onGoHome}
            style={{ ...btn, justifyContent: "center", background: "#eef7e2" }}
            title="Back to the estate"
          >
            <LuHouse size={13} /> Estate
          </button>
          <button
            type="button"
            onClick={myLocation}
            disabled={busy}
            style={{ ...btn, justifyContent: "center", background: "#eef7e2" }}
            title="Centre on where you are standing"
          >
            <LuLocateFixed size={13} />
            {busy ? "Locating…" : "Me"}
          </button>
        </div>

        {msg ? (
          <p style={{ margin: "5px 2px 0", fontSize: 10, color: "#a33" }}>{msg}</p>
        ) : null}

        {tiles.some((t) => t.placed) && (
          <>
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              style={{
                ...btn,
                marginTop: 5,
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: ".04em",
                color: "#6b7280",
              }}
            >
              {open ? "▾" : "▸"} Jump to field
            </button>
            {open && (
              <div style={{ maxHeight: 140, overflowY: "auto" }}>
                {tiles
                  .filter((t) => t.placed)
                  .map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => go(t.lat, t.lng)}
                      style={btn}
                      onMouseEnter={hover(true)}
                      onMouseLeave={hover(false)}
                    >
                      <span
                        style={{
                          width: 9,
                          height: 9,
                          borderRadius: 2,
                          background: BAND_COLOR[t.band],
                          flexShrink: 0,
                        }}
                      />
                      {t.label}
                      <span style={{ marginLeft: "auto", color: "#6b7280" }}>
                        {t.pct === null ? "—" : `${t.pct}%`}
                      </span>
                    </button>
                  ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Basemap switch, bottom-left so it never covers the controls above.
function BasemapSwitch({ value, onChange }) {
  const boxRef = useRef(null);
  useEffect(() => {
    if (boxRef.current) L.DomEvent.disableClickPropagation(boxRef.current);
  }, []);
  return (
    <div className="leaflet-bottom leaflet-left">
      <div
        ref={boxRef}
        className="leaflet-control"
        style={{
          margin: 10,
          background: "white",
          borderRadius: 8,
          boxShadow: "0 1px 5px rgba(0,0,0,.3)",
          display: "flex",
          overflow: "hidden",
        }}
      >
        {Object.entries(BASEMAPS).map(([k, b]) => (
          <button
            key={k}
            type="button"
            onClick={() => onChange(k)}
            style={{
              border: "none",
              cursor: "pointer",
              padding: "5px 11px",
              fontSize: 11,
              fontWeight: 700,
              background: value === k ? "#1c3a29" : "transparent",
              color: value === k ? "#fff" : "#1f2a1a",
            }}
          >
            {b.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ZoneHeatmapMap({
  tiles,
  editingZoneId,
  // `placing` lets a page accept a click WITHOUT having picked a field first —
  // the Fields board drops the marker, then asks which field it is.
  placing = false,
  draftPosition,
  draftRadiusM,
  onPick,
  // Actions offered when a placed field is clicked on the map. Without these
  // there was no way to move or un-place a marker once it was down.
  onMoveField,
  onRemoveField,
  center,
  height = 460,
}) {
  const [basemap, setBasemap] = useState("satellite");
  const placed = useMemo(() => tiles.filter((t) => t.placed), [tiles]);

  // Centre of the placed fields, or the estate when nothing is placed yet.
  const home = useMemo(() => {
    if (placed.length === 0) return SYLHET;
    return [
      placed.reduce((s, t) => s + t.lat, 0) / placed.length,
      placed.reduce((s, t) => s + t.lng, 0) / placed.length,
    ];
  }, [placed]);

  const [homeSignal, setHomeSignal] = useState(null);
  const base = BASEMAPS[basemap];

  return (
    <div
      className="overflow-hidden rounded-xl ring-1 ring-[#13483B59]"
      style={{ height }}
    >
      <MapContainer
        center={center || home}
        zoom={placed.length ? 15 : 12}
        scrollWheelZoom
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          key={basemap}
          attribution={base.attribution}
          url={base.url}
          maxZoom={base.max}
        />
        <Recenter center={center || homeSignal} />
        <ClickToPlace enabled={!!editingZoneId || placing} onPick={onPick} />
        <MapControls
          tiles={tiles}
          onGoHome={() => setHomeSignal([home[0] + Math.random() * 1e-9, home[1]])}
        />
        <BasemapSwitch value={basemap} onChange={setBasemap} />

        {placed.map((t) => {
          const isEditing = t.id === editingZoneId;
          const pos = isEditing && draftPosition ? draftPosition : [t.lat, t.lng];
          const radius = isEditing && draftRadiusM != null ? draftRadiusM : t.radiusM;
          return (
            // Fragment, NOT a div: react-leaflet renders children into the map
            // container, so a real DOM element here would sit on top of the map
            // instead of being attached to it.
            <Fragment key={t.id}>
              <Circle
                center={pos}
                radius={radius}
                pathOptions={{
                  color: isEditing ? "#ffffff" : BAND_COLOR[t.band],
                  weight: isEditing ? 3 : 2,
                  dashArray: isEditing ? "6 4" : undefined,
                  fillColor: BAND_COLOR[t.band],
                  fillOpacity: 0.4,
                }}
              >
                <Tooltip direction="top" offset={[0, -6]} opacity={1}>
                  <span style={{ fontSize: 11, fontWeight: 600 }}>
                    {t.label}
                    {t.assigned > 0 ? (
                      <>
                        {" — "}
                        {t.pct}% present
                        <br />
                        {t.present}/{t.assigned} present
                        {t.late ? `, ${t.late} late` : ""}
                      </>
                    ) : (
                      " — no one assigned today"
                    )}
                  </span>
                </Tooltip>
              </Circle>
              <Marker position={pos} icon={zoneIcon(t.label, t.band, t.pct)}>
                {(onMoveField || onRemoveField) && (
                  <Popup>
                    <div style={{ minWidth: 150 }}>
                      <p style={{ margin: 0, fontWeight: 800, fontSize: 13, color: "#14493B" }}>
                        {t.label}
                      </p>
                      <p style={{ margin: "2px 0 8px", fontSize: 11, color: "#666" }}>
                        {t.assigned > 0
                          ? `${t.pct}% · ${t.present}/${t.assigned}`
                          : "no one assigned today"}
                      </p>
                      <div style={{ display: "flex", gap: 6 }}>
                        {onMoveField && (
                          <button
                            type="button"
                            onClick={() => onMoveField(t)}
                            style={{
                              flex: 1, border: "none", cursor: "pointer",
                              background: "#14493B", color: "#fff",
                              borderRadius: 6, padding: "5px 8px",
                              fontSize: 11, fontWeight: 700,
                            }}
                          >
                            Move
                          </button>
                        )}
                        {onRemoveField && (
                          <button
                            type="button"
                            onClick={() => onRemoveField(t)}
                            style={{
                              flex: 1, cursor: "pointer",
                              background: "#fff", color: "#b91c1c",
                              border: "1px solid #fca5a5",
                              borderRadius: 6, padding: "5px 8px",
                              fontSize: 11, fontWeight: 700,
                            }}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  </Popup>
                )}
              </Marker>
            </Fragment>
          );
        })}

        {/* A marker dropped before a field is chosen, or a field being placed
            for the first time, has no stored circle to reuse. */}
        {draftPosition &&
          (placing || (editingZoneId && !placed.some((t) => t.id === editingZoneId))) && (
            <Circle
              center={draftPosition}
              radius={draftRadiusM ?? 250}
              pathOptions={{
                color: "#ffffff",
                weight: 3,
                dashArray: "6 4",
                fillColor: "#95c260",
                fillOpacity: 0.35,
              }}
            />
          )}
      </MapContainer>
    </div>
  );
}
