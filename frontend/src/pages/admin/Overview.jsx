import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  ComposedChart,
  Line,
  RadialBarChart,
  RadialBar,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
} from "recharts";
import {
  LuTrophy,
  LuUsers,
  LuUserCheck,
  LuLeaf,
  LuWallet,
  LuActivity,
} from "react-icons/lu";
import api from "../../api/client";
import { apiError } from "../../lib/apiError";
import InfoTip from "../../components/admin/InfoTip";


const GREEN = "#3f8f43";
const PIE_COLORS = ["#a9b263", "#5c796c", "#49921c", "#3f8f43"];
const MEDAL = ["#f5c518", "#b8c0c8", "#cd7f32"];

const KPI_ICON = {
  workers: LuUsers,
  present: LuUserCheck,
  leaf: LuLeaf,
  payroll: LuWallet,
};

const taka = (n) =>
  "৳ " + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

function Card({ children, className = "" }) {
  return (
    <div
      className={`rounded-2xl bg-white p-5 shadow ring-1 ring-cg-green/10 ${className}`}
    >
      {children}
    </div>
  );
}

function CardHead({ title, info }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <h2 className="font-bold text-cg-ink">{title}</h2>
      </div>
      <InfoTip text={info} />
    </div>
  );
}

// Shown in place of a chart when the API returned nothing at all. Empty is a
// legitimate answer here (nobody has marked attendance yet), so we say that
// rather than drawing an empty axis that looks broken.
function Empty({ children }) {
  return (
    <div className="grid h-[280px] place-items-center px-6 text-center text-sm text-cg-ink/50">
      {children}
    </div>
  );
}

// 0-100 financial health score, derived from real ledger figures.
//
//   60%  margin      netProfit / totalRevenue, where a 30% margin scores full
//   40%  liquidity   cashOnHand / monthly burn, where 3 months' cover scores full
//
// Deliberately simple and stated in the InfoTip, so the number can be defended
// when someone asks how it is calculated. Returns null when there is not enough
// data to say anything honest.
function healthScore(summary, trend) {
  if (!summary) return null;
  const revenue = Number(summary.totalRevenue || 0);
  const profit = Number(summary.netProfit || 0);
  const cash = Number(summary.cashOnHand || 0);
  if (revenue <= 0) return null;

  const margin = profit / revenue;
  const marginPart = Math.max(0, Math.min(margin / 0.3, 1));

  // Monthly burn = the most recent month's expense in the trend series.
  const lastMonth = trend.length ? Number(trend[trend.length - 1].expense || 0) : 0;
  const liquidityPart =
    lastMonth > 0 ? Math.max(0, Math.min(cash / lastMonth / 3, 1)) : 0;

  return Math.round(60 * marginPart + 40 * liquidityPart);
}

function healthLabel(score) {
  if (score === null) return "Not enough data yet";
  if (score >= 75) return "Healthy — margins and cash cover are strong";
  if (score >= 50) return "Adequate — watch margin or cash cover";
  return "Under strain — margin or cash cover is thin";
}

export default function Overview() {
  const [workers, setWorkers] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [zones, setZones] = useState([]);
  const [payroll, setPayroll] = useState(null);
  const [finance, setFinance] = useState(null);
  const [trend, setTrend] = useState([]);
  const [leafTrend, setLeafTrend] = useState([]);
  const [zonePerf, setZonePerf] = useState([]);
  const [topPluckers, setTopPluckers] = useState([]);
  const [leafToday, setLeafToday] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const [w, a, m, p, f, t, lt, zp, tp, ls] = await Promise.all([
      api.get("/workers"),
      api.get("/attendance"), // no date param = today
      api.get("/workers/meta"),
      api.get("/payroll/summary"),
      api.get("/finance/summary"),
      api.get("/finance/trend", { params: { months: 6 } }),
      // These three replaced hardcoded sample arrays. The banner above them
      // used to say they were waiting on "the supervisor weigh-in screen" —
      // which has existed for a long time and writes to leaf_collection on
      // every save. The note outlived the thing it described.
      api.get("/leaf/trend", { params: { days: 7 } }).catch(() => ({ data: [] })),
      api.get("/leaf/zone-performance").catch(() => ({ data: [] })),
      api.get("/leaf/top-pluckers", { params: { days: 7, limit: 5 } })
        .catch(() => ({ data: [] })),
      api.get("/leaf/summary").catch(() => ({ data: null })),
    ]);
    setWorkers(w.data || []);
    setAttendance(a.data || []);
    setZones(m.data?.zones || []);
    setPayroll(p.data);
    setFinance(f.data);
    setTrend(t.data || []);
    // Shape them to what the charts already expect, so only the source changes.
    setLeafTrend(
      (lt.data || []).map((d) => ({ day: d.label, kg: Number(d.totalKg || 0) })),
    );
    setZonePerf(
      (zp.data || [])
        .map((z) => ({ zone: z.code || z.zoneName, kg: Number(z.kgToday || 0) }))
        .filter((z) => z.kg > 0),
    );
    setTopPluckers(tp.data || []);
    setLeafToday(ls.data);
  }, []);

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
              "Could not load the dashboard. Make sure the backend is running and you're signed in as admin or supervisor.",
            ),
          ),
      )
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [load]);

  const activeWorkers = useMemo(
    () => workers.filter((w) => String(w.status).toLowerCase() === "active"),
    [workers],
  );

  const presentCount = useMemo(
    () => attendance.filter((a) => a.status === "present").length,
    [attendance],
  );

  const attendancePct =
    activeWorkers.length > 0
      ? Math.round((presentCount / activeWorkers.length) * 100)
      : 0;

  // KPI cards.
  //
  // "Leaf today" was the literal number 2940, with a comment claiming nothing
  // writes to leaf_collection "until the supervisor weigh-in screen exists".
  // That screen has existed for a long time and writes on every save; the
  // comment outlived the fact. A made-up figure in the headline KPI row of the
  // dashboard an estate manager reads first is the worst place on the product
  // to leave one.
  const kpis = useMemo(
    () => [
      {
        key: "workers",
        label: "Active workers",
        value: activeWorkers.length,
        delta: `${workers.length} on the roll`,
      },
      {
        key: "present",
        label: "Present today",
        value: `${presentCount} / ${activeWorkers.length}`,
        delta: attendance.length
          ? `${attendancePct}% attendance`
          : "Not marked yet today",
      },
      {
        key: "leaf",
        label: "Leaf today (kg)",
        value: leafToday ? Number(leafToday.totalKg || 0).toFixed(1) : "—",
        // Says which state it is in: no weigh-ins yet is different from a
        // reading of zero, and different again from not having loaded.
        delta: !leafToday
          ? "Not loaded"
          : Number(leafToday.entries || 0) === 0
            ? "No weigh-in recorded yet today"
            : `${leafToday.entries} weigh-in${Number(leafToday.entries) === 1 ? "" : "s"}`,
      },
      {
        key: "payroll",
        label: "Payroll this cycle",
        value: payroll ? taka(payroll.totalNet) : "—",
        delta: payroll
          ? `${payroll.count} payslips · ${payroll.paid} paid`
          : "No cycle generated",
      },
    ],
    [activeWorkers, workers, presentCount, attendance, attendancePct, payroll, leafToday],
  );

  const payrollStatus = useMemo(() => {
    if (!payroll) return [];
    return [
      { name: "Draft", value: payroll.draft },
      { name: "Review", value: payroll.review },
      { name: "Approved", value: payroll.approved },
      { name: "Paid", value: payroll.paid },
    ].filter((d) => d.value > 0);
  }, [payroll]);

  // Chart axis is labelled ৳'000, so scale the real figures to thousands.
  const financials = useMemo(
    () =>
      trend.map((p) => ({
        month: p.month,
        revenue: Number(p.revenue || 0) / 1000,
        cost: Number(p.expense || 0) / 1000,
        profit: Number(p.profit || 0) / 1000,
      })),
    [trend],
  );

  // Today's attendance grouped by zone, for the radar. Zone labels come from
  // /workers/meta; a row with no zone is bucketed as "Unassigned".
  const attendanceByZone = useMemo(() => {
    if (!attendance.length) return [];
    const labels = new Map(zones.map((z) => [z.id, z.label]));
    const buckets = new Map();
    for (const a of attendance) {
      const key = a.zoneId ?? "none";
      if (!buckets.has(key)) {
        buckets.set(key, {
          zone: labels.get(a.zoneId) || "Unassigned",
          present: 0,
          absent: 0,
        });
      }
      const b = buckets.get(key);
      if (a.status === "present") b.present += 1;
      else b.absent += 1;
    }
    return [...buckets.values()];
  }, [attendance, zones]);

  const score = useMemo(() => healthScore(finance, trend), [finance, trend]);
  const healthData = [{ name: "Health", value: score ?? 0, fill: GREEN }];
  // Math.max() with no arguments is -Infinity, which would make every bar
  // NaN% wide on an estate with no weigh-ins yet.
  const maxKg = topPluckers.length
    ? Math.max(...topPluckers.map((w) => Number(w.totalKg || 0)))
    : 0;

  if (loading) {
    return (
      <div className="grid h-64 place-items-center text-sm text-cg-ink/60">
        {"Loading dashboard…"}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-xl bg-rose-50 px-4 py-2 text-sm text-rose-700 ring-1 ring-rose-200">
          {error}
        </div>
      )}

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => {
          const Icon = KPI_ICON[k.key] || LuActivity;
          return (
            <Card key={k.key}>
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-cg-ink/60">{k.label}</p>
                  </div>
                  <p className="mt-1 text-2xl font-extrabold text-cg-ink">
                    {k.value}
                  </p>
                  <p className="mt-1 text-xs text-cg-green">{k.delta}</p>
                </div>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cg-lime text-cg-green">
                  <Icon size={20} />
                </span>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Leaf trend + payroll status — both live */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHead
            title="Leaf collected — last 7 days (kg)"
            info="Total green leaf plucked across the estate per day for the last 7 days, from the supervisor weigh-ins."
          />
          {leafTrend.length === 0 ? (
            <Empty>{"No leaf weighed in yet. Totals appear as supervisors record the day's pluck."}</Empty>
          ) : (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={leafTrend}>
              <defs>
                <linearGradient id="leaf" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={GREEN} stopOpacity={0.5} />
                  <stop offset="95%" stopColor={GREEN} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5efe0" />
              <XAxis dataKey="day" fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip />
              <Area
                type="monotone"
                dataKey="kg"
                stroke={GREEN}
                fill="url(#leaf)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
          )}
        </Card>

        <Card>
          <CardHead
            title="Payroll status"
            info="How many payslips sit in each stage — Draft, Review, Approved, Paid — for the current cycle."
          />
          {payrollStatus.length === 0 ? (
            <Empty>
              {
                "No payslips for this period yet. Generate a cycle from the Payroll page."
              }
            </Empty>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={payrollStatus}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={2}
                >
                  {payrollStatus.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Legend />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* Profitability & financial health — both live */}
      <div>
        <h2 className="mb-3 text-lg font-extrabold text-cg-ink">
          Profitability &amp; Financial Health
        </h2>
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHead
              title="Revenue vs cost (৳ '000) with profit line"
              info="Monthly revenue and cost in thousand Taka from the finance ledger, with the profit line on top."
            />
            {financials.length === 0 ? (
              <Empty>{"No ledger entries yet."}</Empty>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={financials}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5efe0" />
                  <XAxis dataKey="month" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip
                    formatter={(v) => Number(v).toFixed(1) + "k"}
                  />
                  <Legend />
                  <Bar
                    dataKey="revenue"
                    name="Revenue"
                    fill="#49921c"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="cost"
                    name="Cost"
                    fill="#a9b263"
                    radius={[4, 4, 0, 0]}
                  />
                  <Line
                    type="monotone"
                    dataKey="profit"
                    name="Profit"
                    stroke="#1c3a29"
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </Card>

          <Card>
            <CardHead
              title="Financial health score"
              info="Derived from the ledger: 60% profit margin (a 30% margin scores full marks) plus 40% liquidity (cash on hand divided by the latest month's expense, where 3 months' cover scores full marks)."
            />
            {score === null ? (
              <Empty>{"Not enough ledger data to score yet."}</Empty>
            ) : (
              <>
                <div className="relative">
                  <ResponsiveContainer width="100%" height={220}>
                    <RadialBarChart
                      innerRadius="70%"
                      outerRadius="100%"
                      data={healthData}
                      startAngle={90}
                      endAngle={-270}
                    >
                      <PolarAngleAxis
                        type="number"
                        domain={[0, 100]}
                        tick={false}
                      />
                      <RadialBar background dataKey="value" cornerRadius={12} />
                    </RadialBarChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-4xl font-extrabold text-cg-ink">
                      {score}
                    </span>
                    <span className="text-xs text-cg-ink/60">out of 100</span>
                  </div>
                </div>
                <p className="mt-1 text-center text-sm text-cg-green">
                  {healthLabel(score)}
                </p>
              </>
            )}
          </Card>
        </div>
      </div>

      {/* Attendance by zone (live) + production by zone  */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHead
            title="Attendance by zone (today)"
            info="Present vs absent workers in each zone today, from the attendance register, so you can see which zones are short-staffed."
          />
          {attendanceByZone.length === 0 ? (
            <Empty>
              {
                "Attendance has not been marked today. Once a supervisor marks the register, this fills in."
              }
            </Empty>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <RadarChart data={attendanceByZone}>
                <PolarGrid stroke="#e5efe0" />
                <PolarAngleAxis dataKey="zone" fontSize={12} />
                <Radar
                  name="Present"
                  dataKey="present"
                  stroke={GREEN}
                  fill={GREEN}
                  fillOpacity={0.5}
                />
                <Radar
                  name="Absent"
                  dataKey="absent"
                  stroke="#d98b8b"
                  fill="#d98b8b"
                  fillOpacity={0.4}
                />
                <Legend />
                <Tooltip />
              </RadarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card>
          <CardHead
            title="Production by zone (kg)"
            info="Kilos plucked per field TODAY. Fields with no weigh-in yet are left out rather than drawn as a zero bar."
          />
          {zonePerf.length === 0 ? (
            <Empty>{"No field has a weigh-in today yet."}</Empty>
          ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={zonePerf} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e5efe0" />
              <XAxis type="number" fontSize={12} />
              <YAxis dataKey="zone" type="category" width={40} fontSize={12} />
              <Tooltip />
              <Bar dataKey="kg" fill="#49921c" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* Leaderboard  */}
      <Card>
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <LuTrophy className="text-[#f5c518]" />
            <h2 className="font-bold text-cg-ink">
              Worker performance leaderboard
            </h2>
          </div>
          <InfoTip text="Top pluckers by total kilos over the last 7 days, from the supervisor weigh-ins. The number on the right is how many days they weighed in, which separates one big day from steady work. There is no score — this system has no scoring model." />
        </div>
        <ul className="space-y-3">
          {topPluckers.map((w, i) => (
            <li key={w.workerId} className="flex items-center gap-3">
              <span
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold text-white"
                style={{ background: MEDAL[i] || "#5c796c" }}
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-cg-ink">
                    {w.name}
                    {w.zone ? (
                      <span className="text-cg-ink/40"> · {w.zone}</span>
                    ) : null}
                  </span>
                  <span className="text-cg-ink/60">
                    {Number(w.totalKg).toFixed(1)} kg
                  </span>
                </div>
                <div className="mt-1 h-2 w-full rounded-full bg-cg-lime">
                  <div
                    className="h-2 rounded-full bg-cg-green"
                    style={{
                      width: maxKg > 0
                        ? `${(Number(w.totalKg) / maxKg) * 100}%`
                        : "0%",
                    }}
                  />
                </div>
              </div>
              {/* Was an invented "score out of 100". No scoring model exists
                  anywhere in this system, and a made-up number beside a real
                  worker's name on the screen a manager judges them by is the
                  worst place to decorate. Days weighed in is measured, and it
                  is what tells a big one-off total from steady work. */}
              <span className="w-12 shrink-0 text-right text-xs font-semibold text-cg-ink/60">
                {w.days}d
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-cg-ink/50">
          Score blends leaf volume, attendance and grade.
        </p>
      </Card>
    </div>
  );
}
