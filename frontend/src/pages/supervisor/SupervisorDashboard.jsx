import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  LuLeaf,
  LuUserCheck,
  LuScale,
  LuTriangleAlert,
  LuRefreshCw,
  LuCloudSun,
  LuDroplets,
  LuCloudRain,
} from "react-icons/lu";
import api from "../../api/client";
import { apiError } from "../../lib/apiError";
import { BTN_GHOST } from "../../lib/ui";
import { WS_BASE } from "../../lib/config";
import { closeSocket } from "../../lib/ws";
import InfoTip from "../../components/admin/InfoTip";
import { todayISO } from "../../lib/localDate";

// Tea Garden Overview — the supervisor's daily picture.
//
// EMPTY STATES ARE THE POINT HERE. attendance and leaf_collection are both
// empty until the capture screens exist, so every card that reads them says so
// explicitly rather than rendering a confident 0. A zero and "nobody has
// recorded anything yet" look identical on a chart, and only one of them is a
// bug worth chasing.

const GREEN = "#3f8f43";
const ZONE_COLORS = ["#1c3a29", "#49921c", "#95c260", "#a9b263", "#5c796c"];

// Card stroke from the design: #13483B at 59 alpha (8-digit hex is RRGGBBAA,
// so 0x59 ≈ 35% opacity). Defined once so every card surface on this page
// stays identical — the previous ring-cg-green/10 was lighter and inconsistent.
const CARD_STROKE = "ring-1 ring-[#13483B59]";

const kg = (n) =>
  Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 1 });

function Card({ children, className = "" }) {
  return (
    <div
      className={`rounded-2xl bg-white p-5 shadow ${CARD_STROKE} ${className}`}
    >
      {children}
    </div>
  );
}

function CardHead({ title, info, right }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <h2 className="font-bold text-cg-ink">{title}</h2>
        {info ? <InfoTip text={info} /> : null}
      </div>
      {right}
    </div>
  );
}

// Used wherever a card has no rows to draw. Says WHY, so an empty register is
// not mistaken for a broken fetch.
function Empty({ height = 260, children }) {
  return (
    <div
      className="grid place-items-center px-6 text-center text-sm text-cg-ink/50"
      style={{ height }}
    >
      {children}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, sub, tone = "green", empty }) {
  const chip =
    tone === "amber"
      ? "bg-amber-100 text-amber-700"
      : tone === "red"
        ? "bg-rose-100 text-rose-600"
        : "bg-cg-lime text-cg-green";
  return (
    <Card>
      <div className="flex items-start justify-between">
        <p className="text-xs font-bold uppercase tracking-wide text-cg-ink/50">
          {label}
        </p>
        <span className={`grid h-9 w-9 place-items-center rounded-xl ${chip}`}>
          <Icon size={18} />
        </span>
      </div>
      <p className="mt-2 text-3xl font-extrabold text-cg-ink">
        {empty ? <span className="text-2xl text-cg-ink/30">—</span> : value}
      </p>
      <p className="mt-1 text-xs text-cg-ink/50">{sub}</p>
    </Card>
  );
}

export default function SupervisorDashboard() {
  const today = todayISO();

  const [leaf, setLeaf] = useState([]);
  const [leafSummary, setLeafSummary] = useState(null);
  const [attendance, setAttendance] = useState(null);
  const [attTrend, setAttTrend] = useState([]);
  const [weather, setWeather] = useState(null);
  const [weatherTrend, setWeatherTrend] = useState([]);
  const [caseSummary, setCaseSummary] = useState(null);
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshingWeather, setRefreshingWeather] = useState(false);
  const [live, setLive] = useState(false);

  const load = useCallback(async () => {
    const [l, ls, a, at, w, wt, cs, cl] = await Promise.all([
      api.get("/leaf", { params: { date: today } }),
      api.get("/leaf/summary", { params: { date: today } }),
      api.get("/attendance/summary", { params: { date: today } }),
      api.get("/attendance/trend", { params: { days: 7 } }),
      api.get("/weather/current"),
      api.get("/weather/trend", { params: { hours: 24 } }),
      api.get("/complaints/summary"),
      api.get("/complaints"),
    ]);
    setLeaf(l.data || []);
    setLeafSummary(ls.data);
    setAttendance(a.data);
    setAttTrend(at.data || []);
    setWeather(w.data);
    setWeatherTrend(wt.data || []);
    setCaseSummary(cs.data);
    setCases(cl.data || []);
  }, [today]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    load()
      .catch(
        (err) =>
          active &&
          setError(
            apiError(
              err,
              "Could not load the dashboard. Make sure the backend is running and you're signed in as a supervisor.",
            ),
          ),
      )
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [load]);

  // Live updates.
  //
  // This was the LAST supervisor screen without a socket, and the worst one to
  // leave out: it is the landing page, it shows today's figures, and it is the
  // screen most likely to sit open on a desk all day. Every one of the eight
  // endpoints it reads now pushes a frame when its data changes, and until now
  // this page ignored all of them — so the numbers a supervisor glanced at
  // could be hours old with nothing saying so.
  //
  // It listens for ALL five kinds because it summarises all five modules. That
  // is unusual — every other board filters to the one or two that move it —
  // and it is correct here for the same reason: a dashboard that missed one
  // would be silently wrong about that section only, which is harder to notice
  // than being wrong about everything.
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

    // Every socket kind the backend actually emits, taken from the call sites
    // rather than guessed. Note the case ones are created / replied / status —
    // there is no "case.updated", and listening for one would have silently
    // missed every reply and every status change.
    //
    // NOT included: leaf.record, attendance.mark, harvest.create and friends.
    // Those look like frame names but are AUDIT action strings; nothing ever
    // sends them over the socket.
    const KINDS = new Set([
      "leaf.saved",
      "attendance.saved",
      "weather.saved",
      "zone.saved",
      "harvest.saved",
      "case.created",
      "case.replied",
      "case.status",
    ]);

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
        if (!KINDS.has(kind) || !loadRef.current) return;
        loadRef.current().catch(() => {});
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

  const refreshWeather = async () => {
    setRefreshingWeather(true);
    try {
      const { data } = await api.post("/weather/refresh");
      setWeather(data);
      const { data: t } = await api.get("/weather/trend", {
        params: { hours: 24 },
      });
      setWeatherTrend(t || []);
    } catch (err) {
      setError(apiError(err, "Could not refresh the weather."));
    } finally {
      setRefreshingWeather(false);
    }
  };

  // Top collectors today, grouped from the raw leaf rows.
  const topCollectors = useMemo(() => {
    const by = new Map();
    for (const r of leaf) {
      const key = r.workerId ?? r.workerName;
      if (!by.has(key)) {
        by.set(key, {
          workerId: r.workerId,
          name: r.workerName || `Worker #${r.workerId}`,
          zone: r.zone || "—",
          kg: 0,
        });
      }
      by.get(key).kg += Number(r.weightKg || 0);
    }
    return [...by.values()].sort((a, b) => b.kg - a.kg).slice(0, 6);
  }, [leaf]);

  const byZone = useMemo(() => {
    const by = new Map();
    for (const r of leaf) {
      const z = r.zone || "Unassigned";
      by.set(z, (by.get(z) || 0) + Number(r.weightKg || 0));
    }
    return [...by.entries()].map(([zone, value]) => ({ zone, value }));
  }, [leaf]);

  const zoneTotal = byZone.reduce((s, z) => s + z.value, 0);
  const openCases = useMemo(
    () => cases.filter((c) => c.status !== "RESOLVED").slice(0, 6),
    [cases],
  );
  const feedback = useMemo(() => cases.slice(0, 3), [cases]);

  // attendance.marked distinguishes "register not filled in" from "all absent".
  const attendanceEmpty = !attendance || attendance.marked === 0;
  const leafEmpty = !leafSummary || Number(leafSummary.totalKg || 0) === 0;

  if (loading) {
    return (
      <div className="grid h-64 place-items-center text-sm text-cg-ink/60">
        {"Loading dashboard…"}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-cg-ink">
            Tea Garden Overview
          </h1>
          <p className="text-sm text-cg-ink/60">
            Monitoring cultivation and yields for{" "}
            {new Date().toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </p>
        </div>
        {/* This screen is the one most likely to sit open all day, so whether
            it is still listening matters more here than anywhere else. */}
        <span
          title={
            live
              ? "Connected. Weigh-ins, attendance, weather and reports update here as they happen."
              : "Not connected. These figures are correct as of the last load but will not update on their own."
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
      </div>

      {error && (
        <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      {(attendanceEmpty || leafEmpty) && (
        <div className="rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-800 ring-1 ring-amber-200">
          {leafEmpty && attendanceEmpty
            ? "No leaf or attendance has been recorded yet. Those cards stay empty until the weigh-in and attendance screens are built — they are not broken."
            : leafEmpty
              ? "No leaf collection recorded today. The weigh-in screen is not built yet."
              : "Attendance has not been marked today."}
        </div>
      )}

      {/* KPI row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          icon={LuLeaf}
          label="Leaf Collection"
          value={kg(leafSummary?.totalKg)}
          sub={
            leafEmpty
              ? "Nothing recorded today"
              : `${leafSummary.entries} entries today`
          }
          empty={leafEmpty}
        />
        <Kpi
          icon={LuUserCheck}
          label="Today's Attendance"
          value={`${attendance?.presentPct ?? 0}%`}
          sub={
            attendanceEmpty
              ? "Register not marked today"
              : `${attendance.present} of ${attendance.activeWorkers} present · ${attendance.absent} absent · ${attendance.late} late`
          }
          empty={attendanceEmpty}
        />
        <Kpi
          icon={LuScale}
          label="Daily Yield"
          value={`${kg(leafSummary?.totalKg)} kg`}
          sub={
            leafEmpty
              ? "Awaiting the first weigh-in"
              : "Total green leaf weighed in today"
          }
          empty={leafEmpty}
        />
        <Kpi
          icon={LuTriangleAlert}
          label="Reports and Issues"
          tone={caseSummary?.activeCount > 0 ? "amber" : "green"}
          value={caseSummary?.activeCount ?? 0}
          sub={
            caseSummary
              ? `${Math.round(caseSummary.resolutionRate)}% resolved · ${caseSummary.totalCount} total`
              : "No data"
          }
        />
      </div>

      {/* Attendance trend + weather status */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHead
            title="Attendance Trend"
            info="Present, late and absent marks for each of the last 7 days, from the attendance register."
          />
          {attTrend.every((d) => d.present + d.absent + d.late + d.onLeave === 0) ? (
            <Empty>
              {
                "No attendance has been marked in the last 7 days. This fills in once the attendance screen is built and used."
              }
            </Empty>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={attTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5efe0" vertical={false} />
                <XAxis dataKey="label" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="present" name="Present" stackId="a" fill={GREEN} radius={[0, 0, 0, 0]} />
                <Bar dataKey="late" name="Late" stackId="a" fill="#e0a92b" />
                <Bar dataKey="absent" name="Absent" stackId="a" fill="#d98b8b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card>
          <CardHead
            title="Weather Status"
            info="Current conditions for the estate from Open-Meteo. Reads never call the API — use Refresh to fetch a new reading."
            right={
              <button
                type="button"
                className={BTN_GHOST}
                onClick={refreshWeather}
                disabled={refreshingWeather}
              >
                <LuRefreshCw
                  size={13}
                  className={refreshingWeather ? "animate-spin" : ""}
                />
                {refreshingWeather ? "Fetching…" : "Refresh"}
              </button>
            }
          />
          {!weather?.available ? (
            <Empty height={200}>{weather?.message || "No weather reading yet."}</Empty>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <LuCloudSun size={44} className="text-cg-green" />
                <div>
                  <p className="text-3xl font-extrabold text-cg-ink">
                    {weather.tempC}°C
                  </p>
                  <p className="text-sm text-cg-ink/60">{weather.condition}</p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-cg-ink/70">
                <p className="flex items-center gap-1.5">
                  <LuDroplets size={14} /> Humidity {weather.humidity}%
                </p>
                <p className="flex items-center gap-1.5">
                  <LuCloudRain size={14} /> Rain {weather.rainfall24hMm} mm
                </p>
              </div>
              {weather.forecast?.length > 0 && (
                <div className="mt-4">
                  <p className="mb-1 text-xs font-semibold text-cg-ink/60">
                    Forecast
                  </p>
                  <ul className="space-y-1 text-sm">
                    {weather.forecast.map((f, i) => (
                      <li
                        key={`${f.day}-${i}`}
                        className="flex justify-between border-b border-cg-green/10 pb-1 text-cg-ink/70 last:border-0"
                      >
                        <span className="font-semibold text-cg-ink">{f.day}</span>
                        <span>{f.condition}</span>
                        <span className="tabular-nums">
                          {f.minC}/{f.maxC}°
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </Card>
      </div>

      {/* Top collectors + zone donut */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHead
            title="Top Collectors"
            info="Workers ranked by green leaf weighed in today."
          />
          {topCollectors.length === 0 ? (
            <Empty height={200}>
              {"No leaf weighed in today, so there is nothing to rank yet."}
            </Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-cg-ink/50">
                  <tr>
                    <th className="bg-[#D3FFAC] px-4 py-2">Worker</th>
                    <th className="bg-[#D3FFAC] px-4 py-2">Zone</th>
                    <th className="bg-[#D3FFAC] px-4 py-2 text-right">Kg loaded</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cg-green/10">
                  {topCollectors.map((c) => (
                    <tr key={c.workerId ?? c.name} className="hover:bg-cg-lime/20">
                      <td className="px-4 py-2.5 font-semibold text-cg-ink">
                        {c.name}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="rounded-full bg-cg-lime px-2 py-0.5 text-xs font-semibold text-cg-green">
                          {c.zone}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-bold tabular-nums text-cg-ink">
                        {kg(c.kg)} kg
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <CardHead
            title="Collection by Zone"
            info="Share of today's green leaf by zone."
          />
          {byZone.length === 0 ? (
            <Empty height={220}>{"No collection recorded today."}</Empty>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={byZone}
                    dataKey="value"
                    nameKey="zone"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={2}
                  >
                    {byZone.map((_, i) => (
                      <Cell key={i} fill={ZONE_COLORS[i % ZONE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => `${kg(v)} kg`} />
                </PieChart>
              </ResponsiveContainer>
              <ul className="mt-2 space-y-1 text-sm">
                {byZone.map((z, i) => (
                  <li key={z.zone} className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ background: ZONE_COLORS[i % ZONE_COLORS.length] }}
                    />
                    <span className="text-cg-ink/70">{z.zone}</span>
                    <span className="ml-auto font-semibold tabular-nums text-cg-ink">
                      {zoneTotal > 0 ? Math.round((z.value / zoneTotal) * 100) : 0}%
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </div>

      {/* Weather curve + worker feedback */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHead
            title="24hr Weather Trends"
            info="Temperature and humidity from the stored readings. The curve is only as detailed as how often Refresh has been used."
          />
          {weatherTrend.length < 2 ? (
            <Empty height={220}>
              {
                "Not enough readings to draw a curve yet. Refresh the weather a few times and this fills in."
              }
            </Empty>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={weatherTrend}>
                <defs>
                  <linearGradient id="temp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1c3a29" stopOpacity={0.6} />
                    <stop offset="95%" stopColor="#1c3a29" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5efe0" vertical={false} />
                <XAxis dataKey="time" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="tempC"
                  name="Temp °C"
                  stroke="#1c3a29"
                  fill="url(#temp)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="humidity"
                  name="Humidity %"
                  stroke="#95c260"
                  fill="#95c260"
                  fillOpacity={0.25}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card>
          <CardHead
            title="Worker Feedback"
            info="The most recent complaints and field reports, in the language they were submitted in."
          />
          {feedback.length === 0 ? (
            <Empty height={200}>{"No reports submitted yet."}</Empty>
          ) : (
            <ul className="space-y-3">
              {feedback.map((c) => (
                <li key={c.id} className="border-b border-cg-green/10 pb-2 last:border-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-cg-ink">
                      {c.submitterName || "Unknown"}
                    </p>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                        c.status === "RESOLVED"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {c.status}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-cg-ink/70">{c.title}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Operational issues */}
      <div
        className={`overflow-hidden rounded-2xl bg-white shadow ${CARD_STROKE}`}
      >
        <div className="flex items-center justify-between bg-[#C0F28B] px-5 py-3">
          <h2 className="font-bold text-cg-ink">Operational Issues</h2>
          <span className="text-xs font-semibold text-cg-ink/70">
            {openCases.length} open
          </span>
        </div>
        {openCases.length === 0 ? (
          <Empty height={140}>{"Nothing open right now."}</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-cg-ink/50">
                <tr>
                  <th className="bg-[#D3FFAC] px-5 py-2">ID</th>
                  <th className="bg-[#D3FFAC] px-5 py-2">Type</th>
                  <th className="bg-[#D3FFAC] px-5 py-2">Zone</th>
                  <th className="bg-[#D3FFAC] px-5 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cg-green/10">
                {openCases.map((c) => (
                  <tr key={c.id} className="hover:bg-cg-lime/20">
                    <td className="px-5 py-2.5 font-semibold text-cg-ink">
                      #REP-{String(c.id).padStart(4, "0")}
                    </td>
                    <td className="px-5 py-2.5 text-cg-ink/80">
                      {c.title}
                      {c.category ? (
                        <span className="block text-xs text-cg-ink/40">
                          {c.category}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-5 py-2.5 text-cg-ink/70">{c.zone || "—"}</td>
                    <td className="px-5 py-2.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                          c.priority === "HIGH"
                            ? "bg-rose-100 text-rose-700"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {c.priority === "HIGH" ? "Critical" : c.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
