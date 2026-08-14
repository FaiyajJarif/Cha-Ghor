import {
    LuUsers,
    LuLeaf,
    LuBanknote,
    LuMap,
    LuHandCoins,
    LuClipboardList,
    LuBoxes,
    LuTruck,
    LuWallet,
    LuCloudSun,
    LuMegaphone,
    LuCalendarDays,
    LuBot,
    LuCamera,
    LuBug,
    LuTrendingUp,
    LuFileText,
    LuSun,
    LuActivity,
    LuMessagesSquare,
    LuPackageSearch,
    LuShieldAlert,
    LuShieldCheck,
    LuClipboardCheck,
    LuSprout,
  } from "react-icons/lu";
  
  export const NAV = [
    { label: "Home", to: "/" },
    { label: "Features", to: "/features" },
    { label: "Services", to: "/services" },
    { label: "About Us", to: "/#about" },
    { label: "Contact", to: "/#contact" },
  ];
  
  // Landing HERO box + About Us box imagery.
  //   - Leave "" to keep the green gradient panel.
  //   - Set a public path to show a real image, e.g. HERO_IMAGE = "/features/hero.jpg"
  //     (put the file in frontend/public/features/).
  export const HERO_IMAGE = "";
  export const ABOUT_IMAGE = "";
  
  // Headline platform modules — matches the Cha Ghor plan / SRS functional reqs.
  //
  // ICONS: each `icon` is a react-icons component (Lucide set). They inherit the
  // surrounding text color, so they always blend with the theme. Swap any icon by
  // importing a different `Lu*` name above. Browse names at https://react-icons.github.io/react-icons/icons/lu/
  //
  // HOW TO ADD AN IMAGE UNDER A CARD:
  //   1. Drop your picture in  frontend/public/features/  (create the folder).
  //      e.g.  public/features/workforce.jpg
  //   2. Set `image` below to the public path, e.g. image: "/features/workforce.jpg".
  //   3. Leave image: "" to show the green gradient placeholder instead.
  export const CORE_FEATURES = [
    {
      title: "Workforce & Attendance",
      icon: LuUsers,
      image: "",
      text: "Worker & supervisor profiles, enrollment, and daily bulk attendance that flows straight into payroll.",
    },
    {
      title: "Leaf Collection & Grading",
      icon: LuLeaf,
      image: "",
      text: "Log daily leaf weigh-ins by zone with quality grades — the base for fair, productivity-linked wages.",
    },
    {
      title: "Wage & Payroll",
      icon: LuBanknote,
      image: "",
      text: "Automated hazira + surplus payroll on a Draft → Review → Approved → Paid pipeline, with salary-paid SMS.",
    },
    {
      title: "Fields & Zonal Management",
      icon: LuMap,
      image: "",
      text: "Organize garden zones on a map, assign workers and supervisors, and track harvest progress per block.",
    },
    {
      title: "Loans & Advances",
      icon: LuHandCoins,
      image: "",
      text: "Interest-free worker loans with an AI credibility check, admin approval, and automatic wage-deduction repayment.",
    },
    {
      title: "Reports & Compliance",
      icon: LuClipboardList,
      image: "",
      text: "Dashboards, operational reports and compliance records across every role — audit-ready in one place.",
    },
  ];
  
  // Operational services shown on the landing + Services page (plan-aligned).
  export const SERVICES = [
    {
      title: "Inventory & Requisition",
      icon: LuBoxes,
      text: "Track stock and warehouse movements with low-stock alerts, and approve supervisor requisitions.",
    },
    {
      title: "Supply Chain",
      icon: LuTruck,
      text: "Manage tea movement from garden to market — dispatch, shipments and delivery status.",
    },
    {
      title: "Finance & Ledger",
      icon: LuWallet,
      text: "Revenue, expenses, worker payments and profit tracking in one transparent ledger.",
    },
    {
      title: "Weather Monitoring",
      icon: LuCloudSun,
      text: "Live conditions and forecasts turned into harvest-timing guidance for each zone.",
    },
    {
      title: "Alerts & Broadcast",
      icon: LuMegaphone,
      text: "SMS and in-app alerts for salary paid, loan status and urgent estate-wide messages.",
    },
    {
      title: "Harvest Scheduling",
      icon: LuCalendarDays,
      text: "Plan harvesting schedules per zone and keep field operations coordinated.",
    },
  ];
  
  // AI-embedded intelligence layer — one Python/FastAPI service (LLM + vision + pgvector RAG),
  // read-only and RBAC-scoped. These are the 10 planned AI functions.
  export const AI_FEATURES = [
    {
      title: "Cha Bot — Ask Your Data",
      icon: LuBot,
      text: "Role-aware, bilingual (English + Bangla) assistant. Ask in plain language; it answers safely from live estate data.",
    },
    {
      title: "Leaf-Quality Grading",
      icon: LuCamera,
      text: "Grades plucking quality from a phone photo at weigh-in — fairer pay, fewer disputes.",
    },
    {
      title: "Pest & Disease Detection",
      icon: LuBug,
      text: "Spots leaf disease early from an image and suggests targeted treatment.",
    },
    {
      title: "Loan Credibility Check",
      icon: LuTrendingUp,
      text: "Scores repayment ability from attendance, tenure and earnings — advisory only; the admin decides.",
    },
    {
      title: "Smart Reports",
      icon: LuFileText,
      text: "Auto-writes monthly narrative and compliance reports — bilingual and audit-ready.",
    },
    {
      title: "Weather Harvest Advice",
      icon: LuSun,
      text: "Turns the 7-day forecast into concrete per-zone harvest actions.",
    },
    {
      title: "Yield Forecasting",
      icon: LuActivity,
      text: "Predicts expected leaf yield per zone from history and weather to plan labor and cash flow.",
    },
    {
      title: "Complaint Triage",
      icon: LuMessagesSquare,
      text: "Classifies and routes worker complaints by category, priority and sentiment.",
    },
    {
      title: "Predictive Reorder",
      icon: LuPackageSearch,
      text: "Forecasts stock-outs and suggests restock before supplies run low.",
    },
    {
      title: "Anomaly & Fraud Detection",
      icon: LuShieldAlert,
      text: "Flags proxy attendance, impossible weights and payroll spikes for human review.",
    },
  ];
  
  export const STATS = [
    { value: "11,000+", label: "Users" },
    { value: "100+", label: "Employees" },
    { value: "10+ Years", label: "of Insight" },
    { value: "+30%", label: "Productivity" },
    { value: "500+ Acres", label: "digitized" },
  ];
  
  export const ROLES = [
    {
      key: "admin",
      level: "Estate Level",
      title: "Admin",
      icon: LuShieldCheck,
      text: "Manage overall estate operations, production planning, logistics, and analytics.",
    },
    {
      key: "supervisor",
      level: "Division Level",
      title: "Supervisor",
      icon: LuClipboardCheck,
      text: "Oversee daily activities, track production, and ensure quality control.",
    },
    {
      key: "worker",
      level: "Field Level",
      title: "Worker",
      icon: LuSprout,
      text: "Record daily leaf collection, monitor field conditions, and complete assigned tasks.",
    },
  ];
  
  // Full Features page — one section per planned module (+ the AI layer).
  //
  // ADD AN IMAGE TO A SECTION (same idea as Core Features):
  //   1. Put the file in  frontend/public/features/  e.g. public/features/attendance.jpg
  //   2. Add  image: "/features/attendance.jpg"  to that section below.
  //   3. No image set = the green gradient panel shows instead.
  export const FEATURE_SECTIONS = [
    {
      title: "Workforce Management",
      image: "/features/workforce.png",
      intro:
        "Manage tea-garden workers and supervisors through a centralized directory and enrollment system.",
      ops: [
        "Worker and supervisor profiles with personal and job details",
        "Easy enrollment: add, update and manage records",
        "Assign workers to zones and supervisors",
        "Track assigned tasks and working areas",
        "Maintain labor history and employment details",
      ],
    },
    {
      title: "Attendance Tracking",
      image: "/features/workforce.png",
      intro:
        "Record daily worker presence in the field and feed it straight into wage calculation.",
      ops: [
        "Daily bulk 'mark all present' with quick edits",
        "Zone- and supervisor-wise attendance",
        "Edit and correct records with an audit trail",
        "Attendance flows directly into payroll",
        "Export attendance for reporting",
      ],
    },
    {
      title: "Leaf Collection & Grading",
      image: "",
      intro:
        "Track tea-leaf harvesting accurately for productivity monitoring and fair wages.",
      ops: [
        "Record daily leaf collection in kilograms by zone",
        "Capture quality grade (AI leaf-photo grading optional)",
        "Verify collection records through supervisors",
        "Surplus over the daily quota feeds the wage formula",
        "Generate collection reports and statistics",
      ],
    },
    {
      title: "Wage & Payroll",
      image: "",
      intro:
        "Automate the real Bangladesh tea-estate wage model with a controlled approval pipeline.",
      ops: [
        "Base hazira + surplus (leaf over quota) + optional grade bonus",
        "Deductions for loans and advances",
        "Draft → Review → Approved → Paid workflow",
        "Salary history and payment records",
        "'Salary paid' SMS notification to workers",
      ],
    },
    {
      title: "Fields & Zonal Management",
      image: "",
      intro:
        "Organize garden operations through map-based field and zone management.",
      ops: [
        "Create and manage tea-garden fields and zones",
        "Assign workers and supervisors to operational areas",
        "Zone map colored by harvest progress",
        "Monitor zone-wise production performance",
        "Improve resource allocation and planning",
      ],
    },
    {
      title: "Inventory & Requisition",
      image: "",
      intro:
        "Manage operational resources through centralized inventory control.",
      ops: [
        "Track inventory stock and movements",
        "Supervisor requisitions with admin approve / reject",
        "Monitor incoming and outgoing stock transactions",
        "Low-inventory alerts and notifications",
        "Predictive reorder suggestions (AI)",
      ],
    },
    {
      title: "Supply Chain Management",
      image: "",
      intro: "Manage the movement of tea from garden to market efficiently.",
      ops: [
        "Track shipments from garden to market",
        "Monitor dispatch and delivery status",
        "Maintain supplier and buyer records",
        "Reduce delays and logistics costs",
        "Generate supply-chain reports",
      ],
    },
    {
      title: "Finance & Ledger",
      image: "",
      intro:
        "Manage financial activity and operational expenses with full transparency.",
      ops: [
        "Revenue, expense and profit tracking",
        "Worker payments and transactions",
        "Payroll-linked financial records",
        "Analyze financial performance and trends",
        "Support informed financial planning",
      ],
    },
    {
      title: "Loans & Advances",
      image: "",
      intro:
        "Interest-free worker loans and salary advances with transparent record keeping.",
      ops: [
        "Worker applies for an interest-free loan or advance",
        "AI credibility check scores repayment ability (advisory)",
        "Admin approval and disbursement",
        "Automatic wage-deduction repayment",
        "Complete loan and repayment history",
      ],
    },
    {
      title: "Weather Monitoring",
      image: "",
      intro:
        "Monitor weather to support agricultural planning and field operations.",
      ops: [
        "Real-time conditions and 7-day forecast",
        "Rainfall, temperature and humidity tracking",
        "AI harvest advice per zone from the forecast",
        "Reduce weather-related operational risks",
        "Track historical weather patterns",
      ],
    },
    {
      title: "Alerts & Broadcast",
      image: "",
      intro:
        "Keep workers and management informed, even offline, via SMS and in-app alerts.",
      ops: [
        "Salary-paid and payment reminders",
        "Loan / withdrawal status notifications",
        "Low-inventory and attendance alerts",
        "Estate-wide emergency broadcasts",
        "SMS reaches any phone �� no internet needed",
      ],
    },
    {
      title: "Reports & Compliance",
      image: "",
      intro:
        "Generate operational reports and maintain compliance with comprehensive tools.",
      ops: [
        "Attendance, payroll and production reports",
        "Inventory and supply-chain reports",
        "AI smart-report auto-drafting (bilingual)",
        "Compliance and audit-ready documentation",
        "Role-based dashboards and analytics",
      ],
    },
    {
      title: "Cha Bot & AI Intelligence",
      image: "",
      intro:
        "An embedded AI layer across every module — one read-only, RBAC-scoped service.",
      ops: [
        "Cha Bot: ask-your-data in English or Bangla",
        "Leaf-quality grading and pest / disease detection from photos",
        "Loan credibility check and yield forecasting",
        "Complaint triage and anomaly / fraud detection",
        "Never auto-writes payroll or finance — advisory only",
      ],
    },
  ];