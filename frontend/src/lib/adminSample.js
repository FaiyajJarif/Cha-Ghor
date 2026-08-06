// Sample data ONLY. This exists so the dashboard structure and charts are
// visible before each module's real API is wired. In every upcoming slice we
// replace the matching export with a live fetch() from the backend.

export const KPIS = [
  {
    key: "workers",
    label: "Active workers",
    value: 128,
    delta: "+4 this week",
  },
  {
    key: "present",
    label: "Present today",
    value: "112 / 128",
    delta: "87% attendance",
  },
  {
    key: "leaf",
    label: "Leaf today (kg)",
    value: 2940,
    delta: "+6% vs 7-day avg",
  },
  {
    key: "payroll",
    label: "Payroll this cycle",
    value: "৳ 3.42L",
    delta: "Status: Draft",
  },
];

export const LEAF_TREND = [
  { day: "Mon", kg: 2450 },
  { day: "Tue", kg: 2610 },
  { day: "Wed", kg: 2380 },
  { day: "Thu", kg: 2720 },
  { day: "Fri", kg: 2890 },
  { day: "Sat", kg: 3010 },
  { day: "Sun", kg: 2940 },
];

export const ATTENDANCE_BY_ZONE = [
  { zone: "A-1", present: 28, absent: 4 },
  { zone: "A-2", present: 22, absent: 2 },
  { zone: "B-1", present: 31, absent: 5 },
  { zone: "B-2", present: 18, absent: 1 },
  { zone: "C-1", present: 13, absent: 3 },
];

export const PAYROLL_STATUS = [
  { name: "Draft", value: 6 },
  { name: "Review", value: 2 },
  { name: "Approved", value: 3 },
  { name: "Paid", value: 12 },
];

export const ZONE_PRODUCTION = [
  { zone: "A-1", kg: 820 },
  { zone: "A-2", kg: 610 },
  { zone: "B-1", kg: 910 },
  { zone: "B-2", kg: 480 },
  { zone: "C-1", kg: 320 },
];

// Top workers by leaf volume + a blended performance score (0-100).
export const WORKER_LEADERBOARD = [
  { name: "Jamal Uddin", zone: "B-1", kg: 41, score: 96 },
  { name: "Abdul Karim", zone: "A-1", kg: 38, score: 92 },
  { name: "Nurul Islam", zone: "C-1", kg: 34, score: 88 },
  { name: "Rahima Begum", zone: "A-1", kg: 31, score: 84 },
  { name: "Fatema Khatun", zone: "B-2", kg: 27, score: 79 },
];

// Current conditions + a short forecast. icon keys map to Lucide weather icons.
export const WEATHER = {
  tempC: 29,
  condition: "Partly cloudy",
  icon: "cloudsun",
  humidity: 78,
  windKmh: 12,
  rainChance: 40,
  forecast: [
    { day: "Thu", tempC: 30, icon: "sun" },
    { day: "Fri", tempC: 28, icon: "cloud" },
    { day: "Sat", tempC: 27, icon: "rain" },
    { day: "Sun", tempC: 29, icon: "cloudsun" },
  ],
};

// Monthly revenue vs cost (in ৳'000); profit is precomputed for the line.
export const FINANCIALS = [
  { month: "Feb", revenue: 720, cost: 500, profit: 220 },
  { month: "Mar", revenue: 780, cost: 540, profit: 240 },
  { month: "Apr", revenue: 690, cost: 520, profit: 170 },
  { month: "May", revenue: 850, cost: 560, profit: 290 },
  { month: "Jun", revenue: 910, cost: 600, profit: 310 },
  { month: "Jul", revenue: 880, cost: 590, profit: 290 },
];

// Single 0-100 gauge value for the financial-health radial chart.
export const HEALTH_SCORE = 72;

export const SAMPLE_WORKERS = [
  {
    id: 1,
    name: "Abdul Karim",
    phone: "+8801710000001",
    zone: "A-1",
    supervisor: "R. Rahman",
    wage: 170,
    status: "Active",
  },
  {
    id: 2,
    name: "Rahima Begum",
    phone: "+8801710000002",
    zone: "A-1",
    supervisor: "R. Rahman",
    wage: 170,
    status: "Active",
  },
  {
    id: 3,
    name: "Jamal Uddin",
    phone: "+8801710000003",
    zone: "B-1",
    supervisor: "S. Sazid",
    wage: 185,
    status: "Active",
  },
  {
    id: 4,
    name: "Fatema Khatun",
    phone: "+8801710000004",
    zone: "B-2",
    supervisor: "S. Sazid",
    wage: 170,
    status: "On leave",
  },
  {
    id: 5,
    name: "Nurul Islam",
    phone: "+8801710000005",
    zone: "C-1",
    supervisor: "K. Shawn",
    wage: 170,
    status: "Active",
  },
];