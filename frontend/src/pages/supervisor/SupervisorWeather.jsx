import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import {
  LuThermometer,
  LuCloudRain,
  LuDroplets,
  LuWind,
  LuSun,
  LuCloud,
  LuCloudSun,
  LuCloudDrizzle,
  LuCloudLightning,
  LuCloudFog,
  LuSnowflake,
  LuRefreshCw,
  LuChevronLeft,
  LuChevronRight,
  LuCircleCheck,
  LuCircleX,
  LuMegaphone,
  LuUserPlus,
  LuEye,
  LuTriangleAlert,
} from "react-icons/lu";
import { useNavigate } from "react-router-dom";
import api from "../../api/client";
import { apiError } from "../../lib/apiError";
import { BTN_GHOST } from "../../lib/ui";
import { WS_BASE } from "../../lib/config";
import { closeSocket } from "../../lib/ws";
import InfoTip from "../../components/admin/InfoTip";
import RainImpactPanel from "../../components/supervisor/RainImpactPanel";
import WeatherBriefPanel from "../../components/supervisor/WeatherBriefPanel";
import ErrorBoundary from "../../components/ErrorBoundary";

// Weather Monitor.
//
// Everything on this page is one Open-Meteo reading for the estate's
// coordinates, recorded in weather_log. Nothing here is per-zone: the free
// forecast API returns a single reading for a point, and pretending otherwise
// would put four different fake temperatures in front of a supervisor deciding
// where to send people. Per-zone weather needs on-site sensors.
//
// Reads never call the API. weather_log is only written when Refresh is
// pressed, which means an estate that has never refreshed shows "no reading
// yet" rather than zeroes -- 0°C and 0% humidity would look like a measurement.

const CARD_STROKE = "ring-1 ring-[#13483B59]";
const CARD = `rounded-2xl bg-white p-5 shadow ${CARD_STROKE}`;
const PAGE_SIZE = 4;

// Fixed heights so an estate with one reading has the same layout as one with
// a hundred. A card that collapses when empty reads as broken rather than new.
const PANEL_MIN = "min-h-[340px]";

const SEVERITY = {
  HIGH: "bg-rose-100 text-rose-700 ring-1 ring-rose-200",
  MED: "bg-amber-100 text-amber-800 ring-1 ring-amber-200",
  LOW: "bg-sky-100 text-sky-700 ring-1 ring-sky-200",
  NORMAL: "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200",
};

// Condition text from the backend's WMO grouping -> an icon. Kept as a
// function rather than a map because the strings are grouped labels
// ("Rain showers"), not a fixed enum.
function conditionIcon(condition) {
  const c = (condition || "").toLowerCase();
  if (c.includes("thunder")) return { Icon: LuCloudLightning, tone: "text-violet-500" };
  if (c.includes("snow")) return { Icon: LuSnowflake, tone: "text-sky-300" };
  if (c.includes("drizzle")) return { Icon: LuCloudDrizzle, tone: "text-sky-400" };
  if (c.includes("rain")) return { Icon: LuCloudRain, tone: "text-sky-500" };
  if (c.includes("fog")) return { Icon: LuCloudFog, tone: "text-slate-400" };
  if (c.includes("partly")) return { Icon: LuCloudSun, tone: "text-amber-500" };
  if (c.includes("cloud")) return { Icon: LuCloud, tone: "text-slate-400" };
  if (c.includes("clear")) return { Icon: LuSun, tone: "text-amber-500" };
  return { Icon: LuCloud, tone: "text-slate-400" };
}

// "--" not "0". A missing measurement and a measurement of zero are different
// facts, and this page is read by someone deciding whether to send people out.
const show = (v, unit = "") =>
  v === null || v === undefined ? "--" : `${Number(v)}${unit}`;

function hourLabel(iso) {
  if (!iso) return "";
  const t = iso.length >= 16 ? iso.slice(11, 16) : iso;
  const [h] = t.split(":");
  const n = Number(h);
  if (Number.isNaN(n)) return t;
  const suffix = n >= 12 ? "PM" : "AM";
  const twelve = n % 12 === 0 ? 12 : n % 12;
  return `${twelve} ${suffix}`;
}

function stamp(iso) {
  if (!iso) return "--";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function Kpi({ icon: Icon, label, value, unit, sub }) {
  return (
    <div className={CARD}>
      <div className="flex items-start justify-between">
        <p className="text-xs font-bold uppercase tracking-wide text-cg-ink/50">
          {label}
        </p>
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-cg-lime text-cg-green">
          <Icon size={18} />
        </span>
      </div>
      <p className="mt-2 text-3xl font-extrabold text-cg-ink">
        {value}
        {unit ? (
          <span className="ml-1 text-base font-bold text-cg-ink/40">{unit}</span>
        ) : null}
      </p>
      <p className="mt-1 text-xs text-cg-ink/50">{sub || " "}</p>
    </div>
  );
}

function Empty({ children, height = 200 }) {
  return (
    <div
      className="grid place-items-center rounded-xl border border-dashed border-[#13483B59] px-6 text-center text-sm text-cg-ink/50"
      style={{ minHeight: height }}
    >
      {children}
    </div>
  );
}

export default function SupervisorWeather() {
  const navigate = useNavigate();
  const [weather, setWeather] = useState(null);
  const [trend, setTrend] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [page, setPage] = useState(0);
  const [live, setLive] = useState(false);

  const load = useCallback(async () => {
    const [c, t, e] = await Promise.all([
      api.get("/weather/current"),
      api.get("/weather/trend", { params: { hours: 24 } }),
      api.get("/weather/events", { params: { limit: 50 } }),
    ]);
    setWeather(c.data);
    setTrend(t.data || []);
    setEvents(e.data || []);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    load()
      .catch(
        (err) => active && setError(apiError(err, "Could not load the weather.")),
      )
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [load]);

  // Live updates.
  //
  // Readings are now fetched hourly by a scheduled job on the server, so a
  // screen left open would otherwise drift further out of date the longer it
  // sat there — the opposite of what a monitor is for. The frame carries no
  // data, only a nudge to refetch.
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => {
    let retry;
    let closedByUs = false;
    let ws;
    const url =
      (typeof import.meta !== "undefined" &&
        import.meta.env &&
        import.meta.env.VITE_WS_URL) ||
      `${WS_BASE}/ws/notifications`;
    const connect = () => {
      try {
        ws = new WebSocket(url);
      } catch {
        return;
      }
      ws.onopen = () => setLive(true);
      ws.onmessage = (e) => {
        let kind = "";
        try {
          kind = JSON.parse(e.data)?.kind || "";
        } catch {
          return;
        }
        if (kind === "weather.saved" && loadRef.current) {
          loadRef.current().catch(() => {});
        }
      };
      ws.onerror = () => ws.close();
      ws.onclose = () => {
        setLive(false);
        if (!closedByUs) retry = setTimeout(connect, 5000);
      };
    };
    connect();
    return () => {
      closedByUs = true;
      clearTimeout(retry);
      closeSocket(ws);
    };
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    setError("");
    try {
      await api.post("/weather/refresh");
      await load();
      setPage(0);
    } catch (err) {
      setError(apiError(err, "Could not fetch a new reading."));
    } finally {
      setRefreshing(false);
    }
  };

  // How old the reading is, in whole hours. Null when there is no reading or
  // the timestamp cannot be parsed — an unknown age must not be reported as
  // zero, which would read as "just now".
  const staleHours = useMemo(() => {
    const t = weather?.observedAt;
    if (!t) return null;
    const ms = Date.parse(t);
    if (Number.isNaN(ms)) return null;
    return Math.max(0, Math.floor((Date.now() - ms) / 3600000));
  }, [weather?.observedAt]);

  const available = weather?.available;
  const hourly = weather?.hourly || [];
  const forecast = weather?.forecast || [];

  // The 24h chart plots what was actually recorded. It does not interpolate
  // points nobody measured, so its density is a truthful picture of how often
  // the estate has been sampled.
  const chartData = useMemo(
    () =>
      trend.map((p) => ({
        label: hourLabel(p.time) || p.time,
        tempC: p.tempC === null ? null : Number(p.tempC),
        humidity: p.humidity === null ? null : Number(p.humidity),
      })),
    [trend],
  );

  const totalPages = Math.max(1, Math.ceil(events.length / PAGE_SIZE));
  const pageRows = events.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  // Harvest advice, derived from the reading in front of us. Every line names
  // the number it came from, so a supervisor can disagree with it on the
  // evidence rather than being told what to do by a black box.
  const advice = useMemo(() => {
    if (!available) return null;
    const rainProb = weather.rainProbPct === null ? null : Number(weather.rainProbPct);
    const temp = weather.tempC === null ? null : Number(weather.tempC);
    const hum = weather.humidity === null ? null : Number(weather.humidity);
    const wind = weather.windKph === null ? null : Number(weather.windKph);

    const dryHours = hourly.filter((h) => Number(h.rainProbPct) < 50);
    const firstWet = hourly.find((h) => Number(h.rainProbPct) >= 50);

    const lines = [];
    let headline = "Conditions are workable today.";

    if (rainProb !== null && rainProb >= 70) {
      headline = "Pluck early — rain is likely today.";
      lines.push({
        ok: false,
        text: `${rainProb}% chance of rain. Wet leaf weighs heavy and grades down.`,
      });
    } else if (rainProb !== null && rainProb >= 40) {
      headline = "Morning harvesting is recommended today.";
      lines.push({
        ok: true,
        text: `${rainProb}% chance of rain — get the main pluck done before it turns.`,
      });
    } else if (rainProb !== null) {
      headline = "A full harvesting day is possible.";
      lines.push({ ok: true, text: `Only ${rainProb}% chance of rain.` });
    }

    if (firstWet) {
      lines.push({
        ok: true,
        text: `Dry window until about ${hourLabel(firstWet.time)}.`,
      });
    } else if (dryHours.length > 0) {
      lines.push({ ok: true, text: "No wet hour in the forecast window." });
    }

    // HEAT IS JUDGED ON FEELS-LIKE, NOT THE THERMOMETER.
    //
    // Heat stress depends on humidity as much as temperature: 33°C at 95%
    // humidity is harder on a plucker than 36°C in dry air, because sweat stops
    // evaporating. This rule used to read tempC while apparent_temperature was
    // already being fetched, stored and displayed two cards above — so on a
    // muggy Sylhet afternoon it stayed silent exactly when it mattered most.
    //
    // Falls back to the dry-bulb reading when feels-like is missing (older rows
    // predate that field), and names which one it used so nobody is comparing
    // it against the wrong number on screen.
    const feels = weather.feelsLikeC === null || weather.feelsLikeC === undefined
      ? null
      : Number(weather.feelsLikeC);
    const heat = feels ?? temp;
    if (heat !== null && heat >= 35) {
      lines.push({
        ok: false,
        text:
          feels !== null
            ? `Feels like ${feels}°C — rotate breaks and water rounds.`
            : `${temp}°C — rotate breaks and water rounds.`,
      });
    }
    if (hum !== null && hum >= 90) {
      lines.push({
        ok: false,
        text: `${hum}% humidity — withering will stall, do not overfill the shed.`,
      });
    }
    if (wind !== null && wind >= 25) {
      lines.push({
        ok: false,
        text: `${wind} km/h wind — spraying will drift off target.`,
      });
    } else if (rainProb !== null && rainProb >= 40) {
      lines.push({
        ok: false,
        text: "Avoid chemical application — rain will wash it off.",
      });
    }

    return { headline, lines };
  }, [available, weather, hourly]);

  // The reading, written out as a sentence a supervisor can send as-is.
  // Only the measurements we actually have are included -- a missing wind
  // reading is left out rather than reported as 0 km/h.
  const readingSentence = () => {
    if (!available) return "";
    const bits = [];
    if (weather.condition) bits.push(weather.condition.toLowerCase());
    if (weather.tempC !== null && weather.tempC !== undefined) bits.push(`${weather.tempC}°C`);
    if (weather.rainProbPct !== null && weather.rainProbPct !== undefined)
      bits.push(`${weather.rainProbPct}% chance of rain`);
    if (weather.humidity !== null && weather.humidity !== undefined)
      bits.push(`${weather.humidity}% humidity`);
    if (weather.windKph !== null && weather.windKph !== undefined)
      bits.push(`wind ${weather.windKph} km/h`);
    return bits.join(", ");
  };

  // Hand a prefilled message to the Broadcast screen.
  //
  // DELIBERATELY not a direct send. These reach every supervisor on the estate,
  // and a mis-tapped button on a phone in a wet field should not page everyone.
  // The composer opens with the text already written; a human presses Send.
  //
  // It posts a FieldCase, which is @PreAuthorize("isAuthenticated()") -- so this
  // works for a supervisor today with no permission change. The older
  // /notifications/broadcast route is still admin-only and is not used here.
  const compose = (pre) => {
    if (!available) {
      setNotice(
        "There is no weather reading to send yet. Press Refresh first, then try again.",
      );
      return;
    }
    navigate("/supervisor/broadcast", { state: { compose: pre } });
  };

  const sendWeatherAlert = () =>
    compose({
      caseType: "REPORT",
      category: "Weather",
      priority: Number(weather?.rainProbPct) >= 70 ? "URGENT" : "HIGH",
      title: `Weather alert — ${weather?.condition || "conditions changing"}`,
      body:
        `Current reading for the estate: ${readingSentence()}.\n\n` +
        (advice ? `${advice.headline}\n\n` : "") +
        (advice ? advice.lines.map((l) => `- ${l.text}`).join("\n") + "\n\n" : "") +
        `Recorded ${stamp(weather?.observedAt)}.`,
    });

  const notifyWorkers = () =>
    compose({
      caseType: "REPORT",
      category: "Shift notice",
      priority: "HIGH",
      title: "Working conditions for today",
      body:
        `Conditions on the estate right now: ${readingSentence()}.\n\n` +
        (advice ? `${advice.headline}\n\n` : "") +
        "Please pass this on to your teams at the muster point.",
    });

  const reportIssue = () =>
    compose({
      caseType: "REPORT",
      category: "Field condition",
      priority: "MEDIUM",
      title: "",
      body: `Weather at the time of reporting: ${readingSentence()}.\n\n`,
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold text-cg-ink">Weather Monitor</h1>
          <p className="text-sm text-cg-ink/60">
            Helps monitor detailed weather information
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            title={
              live
                ? "Connected. New readings appear here as they are recorded."
                : "Not connected. The reading below is correct but will not update on its own."
            }
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ${
              live ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                live ? "animate-pulse bg-emerald-500" : "bg-slate-400"
              }`}
            />
            {live ? "Live" : "Offline"}
          </span>
          {available && weather.observedAt ? (
            <span className="text-xs text-cg-ink/50">
              Reading taken {stamp(weather.observedAt)}
              {weather.source ? ` · ${weather.source}` : ""}
            </span>
          ) : null}
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            className={`${BTN_GHOST} inline-flex items-center gap-1.5 disabled:opacity-50`}
          >
            <LuRefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
            {refreshing ? "Fetching…" : "Refresh"}
          </button>
        </div>
      </div>

      {error && (
        <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">
          {error}
        </p>
      )}
      {notice && (
        <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          <LuTriangleAlert size={16} className="mt-0.5 shrink-0" />
          <span className="flex-1">{notice}</span>
          <button
            type="button"
            onClick={() => setNotice("")}
            className="font-bold underline"
          >
            Dismiss
          </button>
        </p>
      )}

      {!loading && !available && (
        <div className={CARD}>
          <Empty height={140}>
            {weather?.message ||
              "No weather reading yet. Press Refresh to fetch the current conditions."}
          </Empty>
        </div>
      )}

      {/* A stale reading is more dangerous than no reading, because everything
          on this page — and the yield forecast, the pluck advisor and the
          field-condition suggestion elsewhere — treats it as current. The
          server now fetches hourly, so anything this old means the scheduled
          job is not running or the estate has been offline. */}
      {available && staleHours != null && staleHours >= 3 && (
        <p className="flex flex-wrap items-center gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          <LuTriangleAlert size={16} className="shrink-0" />
          This reading is about {staleHours} hours old. Readings are meant to
          arrive hourly, so the scheduled fetch may not be running — the advice
          below, and the yield forecast, are working from it either way.
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            className="ml-auto rounded-lg bg-white px-2.5 py-1 text-xs font-bold text-amber-900 ring-1 ring-amber-300 disabled:opacity-50"
          >
            {refreshing ? "Fetching…" : "Fetch now"}
          </button>
        </p>
      )}

      {/* KPI row */}
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          icon={LuThermometer}
          label="Temperature"
          value={show(weather?.tempC)}
          unit="° C"
          sub={
            weather?.feelsLikeC !== null && weather?.feelsLikeC !== undefined
              ? `Feels like ${weather.feelsLikeC}° C`
              : "Feels-like not recorded"
          }
        />
        <Kpi
          icon={LuCloudRain}
          label="Rain prob."
          value={show(weather?.rainProbPct)}
          unit="%"
          sub={
            weather?.rainProbPct === null || weather?.rainProbPct === undefined
              ? "Not in this reading"
              : Number(weather.rainProbPct) >= 70
                ? "High risk"
                : Number(weather.rainProbPct) >= 40
                  ? "Possible"
                  : "Low risk"
          }
        />
        <Kpi
          icon={LuDroplets}
          label="Humidity"
          value={show(weather?.humidity)}
          unit="%"
          sub={
            weather?.humidity === null || weather?.humidity === undefined
              ? "Not in this reading"
              : Number(weather.humidity) >= 90
                ? "Withering will stall"
                : "Stable"
          }
        />
        <Kpi
          icon={LuWind}
          label="Wind speed"
          value={show(weather?.windKph)}
          unit="km/h"
          sub={
            weather?.windKph === null || weather?.windKph === undefined
              ? "Not in this reading"
              : Number(weather.windKph) >= 25
                ? "Spray will drift"
                : "Low"
          }
        />
      </div>

      {/* Today's condition + 7-day forecast */}
      <div className="grid gap-5 lg:grid-cols-3">
        <div className={`${CARD} ${PANEL_MIN} lg:col-span-2`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-extrabold text-cg-ink">
                Today&rsquo;s Condition
              </h2>
              <p className="text-xs text-cg-ink/50">
                Estate central · {available ? stamp(weather.observedAt) : "no reading"}
              </p>
            </div>
            {available && (
              <div className="text-right">
                <p className="text-4xl font-extrabold text-cg-ink">
                  {show(weather.tempC)}°
                </p>
                <p className="text-sm text-cg-ink/60">{weather.condition}</p>
              </div>
            )}
          </div>

          {/* Hourly strip */}
          {hourly.length === 0 ? (
            <div className="mt-4">
              <Empty height={110}>
                {available
                  ? "This reading has no hourly forecast. Press Refresh to fetch one."
                  : "No reading yet."}
              </Empty>
            </div>
          ) : (
            <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
              {hourly.map((h) => {
                const { Icon, tone } = conditionIcon(h.condition);
                return (
                  <div
                    key={h.time}
                    title={`${h.condition} · ${h.rainProbPct}% rain`}
                    className={`flex min-w-[68px] flex-1 flex-col items-center gap-1 rounded-xl px-2 py-3 ${
                      h.now
                        ? "bg-[#D3FFAC] ring-1 ring-[#13483B59]"
                        : "hover:bg-cg-lime/30"
                    }`}
                  >
                    <span className="text-[10px] font-bold uppercase tracking-wide text-cg-ink/50">
                      {h.now ? "Now" : hourLabel(h.time)}
                    </span>
                    <Icon size={22} className={tone} />
                    <span className="text-sm font-extrabold text-cg-ink">
                      {Number(h.tempC).toFixed(0)}°
                    </span>
                    <span className="text-[10px] text-cg-ink/40">
                      {Number(h.rainProbPct).toFixed(0)}%
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* 24h trend */}
          <div className="mt-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-extrabold text-cg-ink">
                Environmental Trends (24h)
              </h3>
              <InfoTip text="Plotted from readings actually stored in weather_log. Each point is one Refresh. Nothing is interpolated — a sparse line means the estate was sampled rarely, not that the weather was flat." />
            </div>
            {chartData.length < 2 ? (
              <div className="mt-3">
                <Empty height={180}>
                  Not enough readings to draw a curve yet. Each Refresh adds one
                  point.
                </Empty>
              </div>
            ) : (
              <ErrorBoundary>
                <div className="mt-3 h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar
                        dataKey="humidity"
                        name="Humidity %"
                        fill="#a8cfff"
                        radius={[4, 4, 0, 0]}
                      />
                      <Line
                        type="monotone"
                        dataKey="tempC"
                        name="Temp °C"
                        stroke="#e8622a"
                        strokeWidth={2}
                        dot={false}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </ErrorBoundary>
            )}
          </div>
        </div>

        {/* 7-day forecast */}
        <div className={`${CARD} ${PANEL_MIN}`}>
          <h2 className="text-xl font-extrabold text-cg-ink">
            Next 7-Day Forecast
          </h2>
          {forecast.length === 0 ? (
            <div className="mt-4">
              <Empty height={240}>
                {available
                  ? "This reading has no forecast attached."
                  : "No reading yet."}
              </Empty>
            </div>
          ) : (
            <ul className="mt-3 divide-y divide-cg-green/10">
              {forecast.map((f, i) => {
                const { Icon, tone } = conditionIcon(f.condition);
                return (
                  <li
                    key={`${f.day}-${i}`}
                    className="flex items-center gap-3 py-2.5"
                  >
                    <span className="w-10 text-xs font-bold uppercase tracking-wide text-cg-ink/60">
                      {f.day}
                    </span>
                    <Icon size={20} className={`shrink-0 ${tone}`} />
                    <span className="flex-1 truncate text-xs text-cg-ink/50">
                      {f.condition}
                    </span>
                    <span className="text-sm font-bold text-cg-ink">
                      {Number(f.maxC).toFixed(0)}° / {Number(f.minC).toFixed(0)}°
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Activity log */}
      <div
        className={`overflow-hidden rounded-2xl bg-white shadow ${CARD_STROKE}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 bg-[#C0F28B] px-5 py-3">
          <h2 className="text-lg font-extrabold text-cg-ink">
            Weather activity log
          </h2>
          <InfoTip text={'These are readings this estate actually recorded, classified by their own numbers — 12 mm of rain is HIGH, 91% humidity is MED. They are not incidents anyone typed in, and there is no "action taken" column because nothing in the system records what a supervisor did about the weather.'} />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-left text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-cg-ink/50">
                <th className="px-5 py-3 font-bold">Date / time</th>
                <th className="px-5 py-3 font-bold">Zone</th>
                <th className="px-5 py-3 font-bold">Weather event</th>
                <th className="px-5 py-3 font-bold">Severity</th>
                <th className="px-5 py-3 font-bold">Measurement</th>
                <th className="px-5 py-3 font-bold">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cg-green/10">
              {pageRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-14 text-center text-sm text-cg-ink/50"
                  >
                    {loading
                      ? "Loading…"
                      : "No readings recorded yet. Press Refresh and the first one appears here."}
                  </td>
                </tr>
              ) : (
                pageRows.map((e) => (
                  <tr key={e.id} className="hover:bg-cg-lime/20">
                    <td className="px-5 py-3.5 text-cg-ink">{stamp(e.observedAt)}</td>
                    <td className="px-5 py-3.5 text-cg-ink/70">{e.zone}</td>
                    <td className="px-5 py-3.5 font-semibold text-cg-ink">
                      {e.event}
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`rounded-full px-3 py-1 text-[11px] font-bold ${
                          SEVERITY[e.severity] || SEVERITY.NORMAL
                        }`}
                      >
                        {e.severity}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-cg-ink/60">
                      {e.detail}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-cg-ink/40">
                      measured
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 bg-[#D3FFAC] px-5 py-3">
          <span className="text-xs font-bold uppercase tracking-wide text-cg-ink/60">
            Showing {pageRows.length} of {events.length}{" "}
            {events.length === 1 ? "reading" : "readings"}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              aria-label="Previous page"
              className="grid h-8 w-8 place-items-center rounded-lg bg-white text-cg-ink disabled:opacity-40"
            >
              <LuChevronLeft size={15} />
            </button>
            <span className="px-2 text-xs font-bold text-cg-ink">
              {page + 1} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              aria-label="Next page"
              className="grid h-8 w-8 place-items-center rounded-lg bg-white text-cg-ink disabled:opacity-40"
            >
              <LuChevronRight size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* The two AI-adjacent panels, in the order they should be read:
          the measurement first, then the words. Both sit above the rule-based
          harvest recommendation, which remains the thing to act on. */}
      <div className="grid gap-5 lg:grid-cols-2">
        <RainImpactPanel />
        <WeatherBriefPanel available={available} />
      </div>

      {/* Recommendation + actions */}
      <div className="grid gap-5 lg:grid-cols-3">
        <div
          className={`overflow-hidden rounded-2xl bg-white shadow lg:col-span-2 ${CARD_STROKE}`}
        >
          <div className="bg-[#C0F28B] px-5 py-3">
            <h2 className="text-sm font-extrabold uppercase tracking-wide text-cg-ink">
              Harvest recommendation
            </h2>
          </div>
          <div className="px-5 py-5">
            {!advice ? (
              <Empty height={120}>
                Advice needs a reading. Press Refresh and it fills in.
              </Empty>
            ) : (
              <>
                <p className="text-lg font-extrabold text-cg-ink">
                  {advice.headline}
                </p>
                <ul className="mt-3 space-y-2">
                  {advice.lines.map((l, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-cg-ink">
                      {l.ok ? (
                        <LuCircleCheck
                          size={16}
                          className="mt-0.5 shrink-0 text-emerald-600"
                        />
                      ) : (
                        <LuCircleX
                          size={16}
                          className="mt-0.5 shrink-0 text-rose-500"
                        />
                      )}
                      <span>{l.text}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-[11px] text-cg-ink/40">
                  Worked out from the numbers above, not from a model. Every line
                  names the measurement it came from.
                </p>
              </>
            )}
          </div>
          <div className="bg-[#D3FFAC] px-5 py-3" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          {[
            {
              key: "alert",
              Icon: LuMegaphone,
              label: "Send weather alert",
              onClick: sendWeatherAlert,
              hint: "Opens Broadcast with the reading written up. You press Send.",
            },
            {
              key: "notify",
              Icon: LuUserPlus,
              label: "Notify workers",
              onClick: notifyWorkers,
              hint: "Opens Broadcast with a shift notice drafted. You press Send.",
            },
            {
              key: "fields",
              Icon: LuEye,
              label: "View field condition",
              onClick: () => navigate("/supervisor/fields"),
              hint: "Go to the fields board.",
            },
            {
              key: "issue",
              Icon: LuTriangleAlert,
              label: "Report issue",
              onClick: reportIssue,
              hint: "Raise a field report. Every supervisor and the admin will see it.",
            },
          ].map(({ key, Icon, label, onClick, hint }) => (
            <button
              key={key}
              type="button"
              onClick={onClick}
              title={hint}
              className="flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-2xl bg-cg-dark px-4 py-5 text-center text-sm font-bold uppercase leading-tight tracking-wide text-white shadow transition hover:brightness-110"
            >
              <Icon size={20} />
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
