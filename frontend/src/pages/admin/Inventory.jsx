import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import {
  LuBoxes,
  LuBanknote,
  LuTriangleAlert,
  LuClock,
  LuCheckCheck,
  LuPlus,
  LuSearch,
  LuX,
  LuCheck,
  LuChevronLeft,
  LuChevronRight,
} from "react-icons/lu";
import api from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { BTN_DARK, BTN_GHOST } from "../../lib/ui";
import { apiError } from "../../lib/apiError";
import InfoTip from "../../components/admin/InfoTip";

const PAGE_SIZE = 8;
const FIELD =
  "mt-1 w-full rounded-lg border border-cg-green/20 bg-cg-lime/30 px-3 py-2 text-sm outline-none focus:border-cg-green";

// Category filter tabs (matches the reference "FILTER BY" row).
const TABS = [
  { key: "", label: "All" },
  { key: "MACHINERY", label: "Machinery" },
  { key: "CHEMICALS", label: "Chemicals" },
  { key: "TOOLS", label: "Tools" },
];

const SITES = ["Central Hub", "Factory", "Remote store"];
const CODE_LABELS = ["Model", "Grade", "Sku"];

// Green donut palette, richest first (mirrors the Finance pie).
const SITE_COLORS = ["#1c3a29", "#3f8f43", "#95c260", "#a9b263", "#c0f28b"];

function taka(n) {
  return (
    "৳" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })
  );
}

function titleCase(s) {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

// Short "10m ago" / "2h ago" / "3d ago" relative time for requisitions.
function timeAgo(iso) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

// apiError() is imported from ../../lib/apiError (shared, single source of truth).

// KPI card. `tone` tints the icon chip + the sub-label (amber / red alerts).
function StatCard({
  icon: Icon,
  label,
  value,
  deltaCount,
  sub,
  tone = "default",
}) {
  const chip =
    tone === "amber"
      ? "bg-amber-100 text-amber-600"
      : tone === "red"
        ? "bg-red-100 text-red-600"
        : "bg-cg-lime text-cg-green";
  const subColor =
    tone === "red"
      ? "text-red-600"
      : tone === "amber"
        ? "text-amber-600"
        : "text-cg-ink/50";
  return (
    <div className="rounded-2xl bg-white p-5 shadow ring-1 ring-cg-green/10">
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-cg-ink/50">
          {label}
        </p>
        <span
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${chip}`}
        >
          <Icon size={18} />
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <p className="text-2xl font-extrabold text-cg-ink">{value}</p>
        {deltaCount ? (
          <span className="inline-flex items-center rounded-full bg-green-100 px-1.5 py-0.5 text-xs font-semibold text-green-700">
            +{deltaCount}
          </span>
        ) : null}
      </div>
      {sub ? <p className={`mt-1 text-xs ${subColor}`}>{sub}</p> : null}
    </div>
  );
}

function CategoryBadge({ category }) {
  return (
    <span className="inline-flex items-center rounded-full bg-cg-lime/60 px-3 py-1 text-xs font-semibold text-cg-green">
      {titleCase(category)}
    </span>
  );
}

function StatusPill({ status }) {
  const low = status === "LOW_STOCK";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
        low ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${low ? "bg-rose-500" : "bg-emerald-500"}`}
      />
      {low ? "Low Stock" : "In Stock"}
    </span>
  );
}

// Thin stock-level bar + percentage. Colour shifts as stock runs down.
function StockLevel({ pct }) {
  const color =
    pct < 15 ? "bg-red-500" : pct < 40 ? "bg-amber-500" : "bg-cg-green";
  const text =
    pct < 15 ? "text-red-600" : pct < 40 ? "text-amber-600" : "text-cg-ink";
  return (
    <div className="w-36">
      <div className="flex items-center justify-between">
        <span className={`text-sm font-semibold ${text}`}>{pct}%</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-cg-green/10">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
    </div>
  );
}

function ModalHeader({ title, subtitle, onClose }) {
  return (
    <div className="flex items-start justify-between gap-4 bg-cg-dark px-6 py-5 text-white">
      <div>
        <h3 className="text-lg font-extrabold">{title}</h3>
        {subtitle ? (
          <p className="mt-0.5 text-sm text-white/70">{subtitle}</p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
      >
        <LuX size={18} />
      </button>
    </div>
  );
}

const EMPTY_ITEM = {
  name: "",
  category: "TOOLS",
  codeLabel: "Model",
  codeValue: "",
  quantity: "",
  capacity: "",
  unit: "pcs",
  unitValue: "",
  reorderLevel: "",
  site: "Central Hub",
};

function AddItemModal({ onClose, onSaved }) {
  const [form, setForm] = useState(EMPTY_ITEM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const lbl = "block text-sm font-semibold text-cg-ink/70";

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.name.trim()) return setError("Item name is required.");
    if (form.quantity === "" || Number(form.quantity) < 0)
      return setError("Enter a valid quantity.");
    setSaving(true);
    try {
      await api.post("/inventory/items", {
        name: form.name.trim(),
        category: form.category,
        codeLabel: form.codeLabel || null,
        codeValue: form.codeValue.trim() || null,
        quantity: Number(form.quantity),
        capacity: form.capacity === "" ? null : Number(form.capacity),
        unit: form.unit.trim() || "units",
        unitValue: form.unitValue === "" ? 0 : Number(form.unitValue),
        reorderLevel: form.reorderLevel === "" ? 0 : Number(form.reorderLevel),
        site: form.site,
      });
      onSaved();
    } catch (err) {
      setError(apiError(err, "Could not save this item. Try again."));
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[80] grid place-items-center bg-black/40 p-4"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <ModalHeader
          title="Add new item"
          subtitle="Register a stock line in the estate store."
          onClose={onClose}
        />
        <div className="space-y-4 p-6">
          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          <label className={lbl}>
            Item name
            <input
              className={FIELD}
              placeholder="e.g. Pruning Shears"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className={lbl}>
              Category
              <select
                className={FIELD}
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
              >
                <option value="MACHINERY">Machinery</option>
                <option value="CHEMICALS">Chemicals</option>
                <option value="TOOLS">Tools</option>
              </select>
            </label>
            <label className={lbl}>
              Site
              <select
                className={FIELD}
                value={form.site}
                onChange={(e) => set("site", e.target.value)}
              >
                {SITES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <label className={lbl}>
              Reference type
              <select
                className={FIELD}
                value={form.codeLabel}
                onChange={(e) => set("codeLabel", e.target.value)}
              >
                {CODE_LABELS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className={lbl}>
              Reference value
              <input
                className={FIELD}
                placeholder="e.g. Felco 2 Pro"
                value={form.codeValue}
                onChange={(e) => set("codeValue", e.target.value)}
              />
            </label>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <label className={lbl}>
              Quantity
              <input
                type="number"
                min="0"
                step="0.01"
                className={FIELD}
                placeholder="0"
                value={form.quantity}
                onChange={(e) => set("quantity", e.target.value)}
              />
            </label>
            <label className={lbl}>
              Capacity
              <input
                type="number"
                min="0"
                step="0.01"
                className={FIELD}
                placeholder="100"
                value={form.capacity}
                onChange={(e) => set("capacity", e.target.value)}
              />
            </label>
            <label className={lbl}>
              Unit
              <input
                className={FIELD}
                placeholder="pcs"
                value={form.unit}
                onChange={(e) => set("unit", e.target.value)}
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <label className={lbl}>
              Unit value (৳)
              <input
                type="number"
                min="0"
                step="0.01"
                className={FIELD}
                placeholder="0"
                value={form.unitValue}
                onChange={(e) => set("unitValue", e.target.value)}
              />
            </label>
            <label className={lbl}>
              Reorder level
              <input
                type="number"
                min="0"
                step="0.01"
                className={FIELD}
                placeholder="0"
                value={form.reorderLevel}
                onChange={(e) => set("reorderLevel", e.target.value)}
              />
            </label>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-cg-green/10 px-6 py-4">
          <button type="button" className={BTN_GHOST} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={BTN_DARK} disabled={saving}>
            {saving ? "Saving…" : "Save item"}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

// Compact numbered pager with ellipsis (1 2 3 … N), matching the reference.
function pageWindow(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i);
  const pages = new Set([0, total - 1, current, current - 1, current + 1]);
  const sorted = [...pages]
    .filter((p) => p >= 0 && p < total)
    .sort((a, b) => a - b);
  const out = [];
  let prev = -1;
  for (const p of sorted) {
    if (prev !== -1 && p - prev > 1) out.push("gap");
    out.push(p);
    prev = p;
  }
  return out;
}

export default function Inventory() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [summary, setSummary] = useState(null);
  const [dist, setDist] = useState({ sites: 0, slices: [] });
  const [pending, setPending] = useState([]);
  const [table, setTable] = useState({
    items: [],
    total: 0,
    totalPages: 0,
  });
  const [page, setPage] = useState(0);
  const [category, setCategory] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyReq, setBusyReq] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [reqPage, setReqPage] = useState(0);
  const REQ_PAGE_SIZE = 3;

  const loadTop = useCallback(async () => {
    const [s, d, r] = await Promise.all([
      api.get("/inventory/summary"),
      api.get("/inventory/distribution"),
      api.get("/inventory/requisitions", { params: { status: "PENDING" } }),
    ]);
    setSummary(s.data);
    setDist(d.data);
    setPending(r.data);
  }, []);

  const loadItems = useCallback(async () => {
    const { data } = await api.get("/inventory/items", {
      params: { page, size: PAGE_SIZE, category, q },
    });
    setTable(data);
  }, [page, category, q]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    Promise.all([loadTop(), loadItems()])
      .catch((err) =>
        setError(
          apiError(
            err,
            "Could not load inventory. Make sure the backend is running and you're signed in as admin or supervisor.",
          ),
        ),
      )
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadItems().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, category]);

  const onSearch = (e) => {
    e.preventDefault();
    setPage(0);
    loadItems().catch(() => {});
  };

  const pickTab = (key) => {
    setCategory(key);
    setPage(0);
  };

  const decide = async (id, action) => {
    setBusyReq(id);
    try {
      await api.post(`/inventory/requisitions/${id}/${action}`);
      await loadTop();
    } catch (err) {
      setError(apiError(err, "Could not update this requisition."));
    } finally {
      setBusyReq(null);
    }
  };

  const pieData = useMemo(
    () =>
      dist.slices.map((s) => ({
        name: s.label,
        value: s.count,
        percent: s.percent,
      })),
    [dist],
  );

  const from = table.total === 0 ? 0 : page * PAGE_SIZE + 1;
  const to = Math.min((page + 1) * PAGE_SIZE, table.total);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-cg-ink">
            Inventory Management
          </h1>
          <p className="text-sm text-cg-ink/60">
            Resource allocation &amp; prophylactic oversight.
          </p>
        </div>
        {isAdmin ? (
          <button className={BTN_DARK} onClick={() => setShowAdd(true)}>
            <LuPlus size={16} /> Add New Item
          </button>
        ) : null}
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          icon={LuBoxes}
          label="Total Items"
          value={Number(summary?.totalItems || 0).toLocaleString("en-IN")}
          deltaCount={summary?.itemsDelta}
          sub="on-hand units"
        />
        <StatCard
          icon={LuBanknote}
          label="Stock Value"
          value={taka(summary?.stockValue)}
          sub="at unit cost"
        />
        <StatCard
          icon={LuTriangleAlert}
          label="Low Stock"
          value={String(summary?.lowStock ?? 0).padStart(2, "0")}
          sub="requires attention"
          tone="amber"
        />
        <StatCard
          icon={LuTriangleAlert}
          label="Critical"
          value={String(summary?.critical ?? 0).padStart(2, "0")}
          sub="stockout imminent"
          tone="red"
        />
        <StatCard
          icon={LuClock}
          label="Pending Req."
          value={String(summary?.pendingReq ?? 0).padStart(2, "0")}
          sub="supervisor queue"
        />
        <StatCard
          icon={LuCheckCheck}
          label="Approved Issues"
          value={String(summary?.approvedToday ?? 0).padStart(2, "0")}
          sub="Today"
        />
      </div>

      {/* AI insight (planned) */}
      <div className="flex items-start gap-3 rounded-2xl border border-dashed border-cg-green/30 bg-white p-4">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-cg-lime text-cg-green">
          <LuBoxes size={18} />
        </span>
        <div>
          <p className="text-sm font-semibold text-cg-ink">
            Predictive reorder
            <span className="ml-2 rounded-full bg-cg-lime/70 px-2 py-0.5 text-xs font-semibold text-cg-green">
              Planned
            </span>
          </p>
          <p className="text-sm text-cg-ink/60">
            AI will suggest restock quantities before a stock-out, based on
            usage trends across sites.
          </p>
        </div>
      </div>

      {/* Main grid: table + right rail */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Item table */}
        <div className="lg:col-span-2 flex flex-col overflow-hidden rounded-2xl bg-white shadow ring-1 ring-cg-green/10">
          {/* Filter tabs + search */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cg-green/10 bg-[#C0F28B] px-5 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-cg-ink/40">
                Filter by
              </span>
              {TABS.map((t) => (
                <button
                  key={t.key || "all"}
                  onClick={() => pickTab(t.key)}
                  className={`rounded-full px-3 py-1 text-sm font-semibold transition ${
                    category === t.key
                      ? "bg-cg-dark text-white"
                      : "text-cg-ink/60 hover:bg-cg-lime"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <form onSubmit={onSearch} className="relative">
              <LuSearch
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-cg-ink/40"
              />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search items…"
                className="w-48 rounded-lg border border-cg-green/20 bg-cg-lime/30 py-2 pl-9 pr-3 text-sm outline-none focus:border-cg-green"
              />
            </form>
          </div>

          <div className="flex-1 overflow-x-auto">
            <table className="h-full w-full text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-cg-ink/50">
                  <th className="bg-[#D3FFAC] px-5 py-3 font-semibold">
                    Item Identity
                  </th>
                  <th className="bg-[#D3FFAC] px-5 py-3 font-semibold">
                    Category
                  </th>
                  <th className="bg-[#D3FFAC] px-5 py-3 font-semibold">
                    Stock Level
                  </th>
                  <th className="bg-[#D3FFAC] px-5 py-3 font-semibold">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cg-green/10">
                {loading ? (
                  <tr>
                    <td
                      className="px-5 py-8 text-center text-cg-ink/50"
                      colSpan={4}
                    >
                      Loading…
                    </td>
                  </tr>
                ) : table.items.length === 0 ? (
                  <tr>
                    <td
                      className="px-5 py-8 text-center text-cg-ink/50"
                      colSpan={4}
                    >
                      No items found.
                    </td>
                  </tr>
                ) : (
                  table.items.map((it) => (
                    <tr key={it.id} className="hover:bg-cg-lime/20">
                      <td className="px-5 py-4">
                        <p className="font-semibold text-cg-ink">{it.name}</p>
                        {it.codeValue ? (
                          <p className="text-xs text-cg-ink/50">
                            {it.codeLabel ? `${it.codeLabel}: ` : ""}
                            {it.codeValue}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-5 py-4">
                        <CategoryBadge category={it.category} />
                      </td>
                      <td className="px-5 py-4">
                        <StockLevel pct={it.stockLevelPct} />
                      </td>
                      <td className="px-5 py-4">
                        <StatusPill status={it.status} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-[#D3FFAC] px-5 py-3 text-sm">
            <span className="text-cg-ink/60">
              {from}–{to} of {table.total}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-semibold text-cg-ink/70 transition hover:bg-white/60 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <LuChevronLeft size={16} /> Previous
              </button>
              {pageWindow(page, table.totalPages).map((p, i) =>
                p === "gap" ? (
                  <span key={`gap-${i}`} className="px-2 text-cg-ink/40">
                    …
                  </span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`h-8 w-8 rounded-lg font-semibold transition ${
                      p === page
                        ? "bg-cg-dark text-white"
                        : "text-cg-ink/70 hover:bg-white/60"
                    }`}
                  >
                    {p + 1}
                  </button>
                ),
              )}
              <button
                onClick={() =>
                  setPage((p) => Math.min(table.totalPages - 1, p + 1))
                }
                disabled={page >= table.totalPages - 1}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-semibold text-cg-ink/70 transition hover:bg-white/60 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next <LuChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Right rail */}
        <div className="space-y-6">
          {/* Distribution */}
          <div className="rounded-2xl bg-white p-5 shadow ring-1 ring-cg-green/10">
            <div className="flex items-center gap-1">
              <h3 className="text-sm font-bold text-cg-ink">Distribution</h3>
              <InfoTip text="Share of stock lines held at each storage site." />
            </div>
            <div className="relative mx-auto mt-3 h-44 w-44">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={58}
                    outerRadius={80}
                    paddingAngle={2}
                    stroke="none"
                  >
                    {pieData.map((_, i) => (
                      <Cell
                        key={i}
                        fill={SITE_COLORS[i % SITE_COLORS.length]}
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 grid place-items-center">
                <div className="text-center">
                  <p className="text-2xl font-extrabold text-cg-ink">
                    {String(dist.sites || 0).padStart(2, "0")}
                  </p>
                  <p className="text-xs text-cg-ink/50">Sites</p>
                </div>
              </div>
            </div>
            <ul className="mt-4 space-y-2">
              {dist.slices.map((s, i) => (
                <li
                  key={s.label}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="flex items-center gap-2 text-cg-ink/70">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{
                        backgroundColor: SITE_COLORS[i % SITE_COLORS.length],
                      }}
                    />
                    {s.label}
                  </span>
                  <span className="font-semibold text-cg-ink">
                    {s.percent}%
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Pending approvals */}
          <div className="rounded-2xl bg-white p-5 shadow ring-1 ring-cg-green/10">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-cg-ink">
                Pending Approvals
              </h3>
              <span className="rounded-full bg-cg-lime/70 px-2 py-0.5 text-xs font-semibold text-cg-green">
                {pending.length}
              </span>
            </div>
            <div className="mt-3 space-y-3">
              {pending.length === 0 ? (
                <p className="py-4 text-center text-sm text-cg-ink/50">
                  No pending requests.
                </p>
              ) : (
                pending
                  .slice(reqPage * REQ_PAGE_SIZE, (reqPage + 1) * REQ_PAGE_SIZE)
                  .map((r) => (
                    <div
                      key={r.id}
                      className="rounded-xl border border-cg-green/15 p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-cg-ink">
                            {r.itemLabel}
                          </p>
                          <p className="text-xs text-cg-ink/50">
                            {r.requester}
                            {r.detail ? ` • ${r.detail}` : ""}
                          </p>
                        </div>
                        <span className="shrink-0 text-xs text-cg-ink/40">
                          {timeAgo(r.requestedAt)}
                        </span>
                      </div>
                      {isAdmin ? (
                        <div className="mt-3 flex items-center gap-2">
                          <button
                            onClick={() => decide(r.id, "approve")}
                            disabled={busyReq === r.id}
                            className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-cg-dark px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-cg-darker disabled:opacity-50"
                          >
                            <LuCheck size={14} /> Approve
                          </button>
                          <button
                            onClick={() => decide(r.id, "hold")}
                            disabled={busyReq === r.id}
                            className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-cg-lime px-3 py-1.5 text-xs font-semibold text-cg-green transition hover:bg-cg-lime/70 disabled:opacity-50"
                          >
                            <LuClock size={14} /> Hold
                          </button>
                          <button
                            onClick={() => decide(r.id, "reject")}
                            disabled={busyReq === r.id}
                            aria-label="Reject"
                            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-rose-100 text-rose-600 transition hover:bg-rose-200 disabled:opacity-50"
                          >
                            <LuX size={14} />
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ))
              )}
            </div>
            {/* Pending approvals pager — only shown when there are more than 3 */}
            {pending.length > REQ_PAGE_SIZE ? (
              <div className="mt-3 flex items-center justify-between border-t border-cg-green/10 pt-3">
                <span className="text-xs text-cg-ink/50">
                  {reqPage * REQ_PAGE_SIZE + 1}–
                  {Math.min((reqPage + 1) * REQ_PAGE_SIZE, pending.length)} of{" "}
                  {pending.length}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setReqPage((p) => Math.max(0, p - 1))}
                    disabled={reqPage === 0}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-cg-ink/70 transition hover:bg-cg-lime/40 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <LuChevronLeft size={14} /> Prev
                  </button>
                  <button
                    onClick={() =>
                      setReqPage((p) =>
                        Math.min(
                          Math.ceil(pending.length / REQ_PAGE_SIZE) - 1,
                          p + 1,
                        )
                      )
                    }
                    disabled={
                      reqPage >= Math.ceil(pending.length / REQ_PAGE_SIZE) - 1
                    }
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-cg-ink/70 transition hover:bg-cg-lime/40 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Next <LuChevronRight size={14} />
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {showAdd ? (
        <AddItemModal
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false);
            setPage(0);
            loadTop().catch(() => {});
            loadItems().catch(() => {});
          }}
        />
      ) : null}
    </div>
  );
}
