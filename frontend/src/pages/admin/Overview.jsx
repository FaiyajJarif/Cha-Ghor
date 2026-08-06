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
  PolarRadiusAxis,
} from "recharts";
import {
  LuSun,
  LuCloud,
  LuCloudRain,
  LuCloudSun,
  LuDroplets,
  LuWind,
  LuTrophy,
  LuUsers,
  LuUserCheck,
  LuLeaf,
  LuWallet,
  LuActivity,
} from "react-icons/lu";
import InfoTip from "../../components/admin/InfoTip";
import {
  KPIS,
  LEAF_TREND,
  ATTENDANCE_BY_ZONE,
  PAYROLL_STATUS,
  ZONE_PRODUCTION,
  WORKER_LEADERBOARD,
  WEATHER,
  FINANCIALS,
  HEALTH_SCORE,
} from "../../lib/adminSample";

const GREEN = "#3f8f43";
const PIE_COLORS = ["#a9b263", "#5c796c", "#49921c", "#3f8f43"];
const WEATHER_ICON = {
  sun: LuSun,
  cloud: LuCloud,
  rain: LuCloudRain,
  cloudsun: LuCloudSun,
};
const MEDAL = ["#f5c518", "#b8c0c8", "#cd7f32"];

// Each KPI card gets an icon (keyed off the sample data key).
const KPI_ICON = {
  workers: LuUsers,
  present: LuUserCheck,
  leaf: LuLeaf,
  payroll: LuWallet,
};

function Card({ children, className = "" }) {
  return (
    <div
      className={`rounded-2xl bg-white p-5 shadow ring-1 ring-cg-green/10 ${className}`}
    >
      {children}
    </div>
  );
}

// Chart header with a title on the left and an "i" info tooltip on the right.
function CardHead({ title, info }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-2">
      <h2 className="font-bold text-cg-ink">{title}</h2>
      <InfoTip text={info} />
    </div>
  );
}

export default function Overview() {
  const maxKg = Math.max(...WORKER_LEADERBOARD.map((w) => w.kg));
  const CurrentIcon = WEATHER_ICON[WEATHER.icon] || LuCloudSun;
  const healthData = [{ name: "Health", value: HEALTH_SCORE, fill: GREEN }];

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-800 ring-1 ring-amber-200">
        Showing <b>sample data</b> to lay out the structure — each card gets
        wired to its API in the coming slices.
      </div>

      {/* KPI cards — each with an icon */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {KPIS.map((k) => {
          const Icon = KPI_ICON[k.key] || LuActivity;
          return (
            <Card key={k.key}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-cg-ink/60">{k.label}</p>
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

      {/* Leaf trend (area) + payroll status (donut) */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHead
            title="Leaf collected — last 7 days (kg)"
            info="Total green leaf plucked across all zones for each of the last 7 days, in kilograms. Use it to spot daily dips."
          />
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={LEAF_TREND}>
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
        </Card>

        <Card>
          <CardHead
            title="Payroll status"
            info="How many payroll runs are in each stage — Draft, Review, Approved, Paid — for the current cycle."
          />
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={PAYROLL_STATUS}
                dataKey="value"
                nameKey="name"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={2}
              >
                {PAYROLL_STATUS.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Legend />
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Profitability & Financial Health */}
      <div>
        <h2 className="mb-3 text-lg font-extrabold text-cg-ink">
          Profitability &amp; Financial Health
        </h2>
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHead
              title="Revenue vs cost (৳ '000) with profit line"
              info="Monthly revenue and cost bars in thousand Taka, with the profit line on top, so you can track margins over time."
            />
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={FINANCIALS}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5efe0" />
                <XAxis dataKey="month" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip />
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
          </Card>

          <Card>
            <CardHead
              title="Financial health score"
              info="A single 0–100 score blending margin, cash flow and cost trends. Higher is healthier."
            />
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
                  {HEALTH_SCORE}
                </span>
                <span className="text-xs text-cg-ink/60">out of 100</span>
              </div>
            </div>
            <p className="mt-1 text-center text-sm text-cg-green">
              Healthy — margins stable
            </p>
          </Card>
        </div>
      </div>

      {/* Weather + Leaderboard */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHead
            title="Weather status"
            info="Current weather at the estate plus a 4-day outlook, to help plan plucking and drying."
          />
          <div className="mt-1 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CurrentIcon size={48} className="text-cg-green" />
              <div>
                <p className="text-3xl font-extrabold text-cg-ink">
                  {WEATHER.tempC}°C
                </p>
                <p className="text-sm text-cg-ink/60">{WEATHER.condition}</p>
              </div>
            </div>
            <div className="space-y-1 text-sm text-cg-ink/70">
              <p className="flex items-center gap-2">
                <LuDroplets size={15} /> Humidity {WEATHER.humidity}%
              </p>
              <p className="flex items-center gap-2">
                <LuWind size={15} /> Wind {WEATHER.windKmh} km/h
              </p>
              <p className="flex items-center gap-2">
                <LuCloudRain size={15} /> Rain {WEATHER.rainChance}%
              </p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-4 gap-2">
            {WEATHER.forecast.map((f) => {
              const Icon = WEATHER_ICON[f.icon] || LuCloudSun;
              return (
                <div
                  key={f.day}
                  className="rounded-xl bg-cg-lime/50 p-2 text-center"
                >
                  <p className="text-xs font-semibold text-cg-ink/70">
                    {f.day}
                  </p>
                  <Icon size={22} className="mx-auto my-1 text-cg-green" />
                  <p className="text-sm font-bold text-cg-ink">{f.tempC}°</p>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-cg-ink/50">
            Cha Bot can advise harvest timing from this forecast.
          </p>
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <LuTrophy className="text-[#f5c518]" />
              <h2 className="font-bold text-cg-ink">
                Worker performance leaderboard
              </h2>
            </div>
            <InfoTip text="Top workers ranked by leaf volume, with a blended score of volume, attendance and leaf grade." />
          </div>
          <ul className="space-y-3">
            {WORKER_LEADERBOARD.map((w, i) => (
              <li key={w.name} className="flex items-center gap-3">
                <span
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold text-white"
                  style={{ background: MEDAL[i] || "#5c796c" }}
                >
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold text-cg-ink">
                      {w.name}{" "}
                      <span className="text-cg-ink/40">· {w.zone}</span>
                    </span>
                    <span className="text-cg-ink/60">{w.kg} kg</span>
                  </div>
                  <div className="mt-1 h-2 w-full rounded-full bg-cg-lime">
                    <div
                      className="h-2 rounded-full bg-cg-green"
                      style={{ width: `${(w.kg / maxKg) * 100}%` }}
                    />
                  </div>
                </div>
                <span className="w-8 shrink-0 text-right text-xs font-semibold text-cg-green">
                  {w.score}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-cg-ink/50">
            Score blends leaf volume, attendance and grade.
          </p>
        </Card>
      </div>

      {/* Attendance (radar) + production (horizontal bar) */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHead
            title="Attendance by zone (today)"
            info="Present vs absent workers in each zone today, so you can see which zones are short-staffed."
          />
          <ResponsiveContainer width="100%" height={280}>
            <RadarChart data={ATTENDANCE_BY_ZONE}>
              <PolarGrid stroke="#e5efe0" />
              <PolarAngleAxis dataKey="zone" fontSize={12} />
              <PolarRadiusAxis fontSize={10} />
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
        </Card>

        <Card>
          <CardHead
            title="Production by zone (kg)"
            info="Total leaf produced per zone today in kilograms, to compare zone output at a glance."
          />
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={ZONE_PRODUCTION} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e5efe0" />
              <XAxis type="number" fontSize={12} />
              <YAxis dataKey="zone" type="category" width={40} fontSize={12} />
              <Tooltip />
              <Bar dataKey="kg" fill="#49921c" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  );
}
