import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  LuX,
  LuSearch,
  LuUsers,
  LuLeaf,
  LuBriefcaseMedical,
  LuChevronDown,
  LuImagePlus,
} from "react-icons/lu";
import api from "../../api/client";
import { apiError } from "../../lib/apiError";

// "Harvesting Fields" — the card view behind View details on the fields map.
//
// Each card is one real zone: its live worker count and yield come from the
// attendance and leaf registers for the selected day, while status, condition
// and the site photo are what a supervisor recorded standing in the field.
//
// Harvest progress is yield against that field's own target_kg_per_day. A field
// with no target shows no bar rather than 0% — an unknown target and a failed
// day should not look the same.

const HEADER = "bg-[#14493B]";

const CONDITION = {
  good: { label: "Good", pill: "bg-emerald-100 text-emerald-700", bar: "bg-cg-green" },
  caution: { label: "Caution", pill: "bg-amber-100 text-amber-800", bar: "bg-[#e0a92b]" },
  poor: { label: "Attention!", pill: "bg-rose-100 text-rose-700", bar: "bg-rose-500" },
};

const STATUS = {
  active: "bg-[#14493B] text-white",
  maintenance: "bg-amber-500 text-white",
  resting: "bg-slate-500 text-white",
};

const SELECT =
  "appearance-none rounded-xl border border-[#13483B59] bg-white px-4 py-2.5 pr-9 text-sm font-semibold text-[#14493B] outline-none focus:border-cg-green";

function Stat({ icon: Icon, label, value, tone }) {
  return (
    <div className="rounded-xl bg-[#C0F28B] p-2 text-center">
      <Icon size={14} className="mx-auto text-[#14493B]/60" />
      <p className="mt-1 text-[9px] font-bold uppercase tracking-wide text-[#14493B]/50">
        {label}
      </p>
      <p className={`text-sm font-bold ${tone || "text-[#14493B]"}`}>{value}</p>
    </div>
  );
}

export default function HarvestingFieldsModal({ open, fields, onChanged, onClose }) {
  const [q, setQ] = useState("");
  const [zoneFilter, setZoneFilter] = useState("");
  const [condFilter, setCondFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return fields.filter((f) => {
      if (zoneFilter && String(f.id) !== zoneFilter) return false;
      if (condFilter && f.condition !== condFilter) return false;
      if (statusFilter && f.status !== statusFilter) return false;
      if (!s) return true;
      return (
        (f.name || "").toLowerCase().includes(s) ||
        (f.code || "").toLowerCase().includes(s)
      );
    });
  }, [fields, q, zoneFilter, condFilter, statusFilter]);

  // Cycle the condition straight from the card — the supervisor is usually
  // updating it because they just walked the field.
  const cycleCondition = async (f) => {
    const order = ["good", "caution", "poor"];
    const next = order[(order.indexOf(f.condition) + 1) % order.length];
    setBusyId(f.id);
    setError("");
    try {
      await api.put(`/zones/${f.id}/state`, { condition: next });
      onChanged?.();
    } catch (err) {
      setError(apiError(err, "Could not update that field."));
    } finally {
      setBusyId(null);
    }
  };

  const toggleStatus = async (f) => {
    const next = f.status === "active" ? "maintenance" : "active";
    setBusyId(f.id);
    setError("");
    try {
      await api.put(`/zones/${f.id}/state`, { status: next });
      onChanged?.();
    } catch (err) {
      setError(apiError(err, "Could not update that field."));
    } finally {
      setBusyId(null);
    }
  };

  if (!open) return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[1200] bg-black/40" onClick={onClose} aria-hidden />
      <div className="fixed inset-0 z-[1210] flex items-center justify-center p-4">
        <div
          className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-label="Harvesting fields"
        >
          <div className={`flex items-center justify-between ${HEADER} px-6 py-5`}>
            <h3 className="text-xl font-extrabold text-white">Harvesting Fields</h3>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid h-9 w-9 place-items-center rounded-full bg-white/20 text-white transition hover:bg-white/30"
            >
              <LuX size={17} />
            </button>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 border-b border-[#13483B]/10 px-6 py-4">
            <label className="relative flex min-w-[13rem] flex-1 items-center">
              <LuSearch size={15} className="pointer-events-none absolute left-3 text-[#14493B]/40" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Quick search zone…"
                className="w-full rounded-xl border border-[#13483B59] py-2.5 pl-9 pr-3 text-sm outline-none focus:border-cg-green"
              />
            </label>
            {[
              [zoneFilter, setZoneFilter, "Zone: All", fields.map((f) => [String(f.id), f.name])],
              [condFilter, setCondFilter, "Condition: All", [["good", "Good"], ["caution", "Caution"], ["poor", "Attention"]]],
              [statusFilter, setStatusFilter, "Status: All", [["active", "Active"], ["maintenance", "Maintenance"], ["resting", "Resting"]]],
            ].map(([val, set, placeholder, opts], i) => (
              <div key={i} className="relative">
                <select value={val} onChange={(e) => set(e.target.value)} className={SELECT}>
                  <option value="">{placeholder}</option>
                  {opts.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
                <LuChevronDown
                  size={15}
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#14493B]/50"
                />
              </div>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto bg-white p-6">
            {error && (
              <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>
            )}
            {shown.length === 0 ? (
              <p className="py-16 text-center text-sm text-[#14493B]/50">
                No fields match those filters.
              </p>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {shown.map((f) => {
                  const cond = CONDITION[f.condition] || CONDITION.good;
                  const pct = f.efficiencyPct;
                  return (
                    <div
                      key={f.id}
                      className="flex flex-col overflow-hidden rounded-2xl bg-[#D3FFAC] ring-1 ring-[#13483B59]"
                    >
                      {/* Photo, or a coloured band when none has been taken */}
                      <div className="relative h-36 w-full">
                        {f.photoUrl ? (
                          <img
                            src={f.photoUrl}
                            alt={f.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className={`grid h-full w-full place-items-center ${cond.bar}/25`}>
                            <span className="flex flex-col items-center gap-1 text-[#14493B]/40">
                              <LuImagePlus size={22} />
                              <span className="text-[10px] font-semibold">No site photo</span>
                            </span>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => toggleStatus(f)}
                          disabled={busyId === f.id}
                          title="Tap to switch between active and maintenance"
                          className={`absolute left-3 top-3 rounded-full px-3 py-1 text-[11px] font-bold capitalize shadow ${
                            STATUS[f.status] || STATUS.active
                          }`}
                        >
                          {f.status}
                        </button>
                      </div>

                      <div className="flex flex-1 flex-col p-4">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-lg font-extrabold leading-tight text-[#14493B]">
                            {f.name}
                          </h4>
                          <button
                            type="button"
                            onClick={() => cycleCondition(f)}
                            disabled={busyId === f.id}
                            title="Tap to change the ground condition"
                            className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-bold ${cond.pill}`}
                          >
                            {cond.label}
                          </button>
                        </div>
                        <p className="mt-1 min-h-[2.5rem] text-xs text-[#14493B]/70">
                          {f.fieldNote ||
                            `${f.code}${f.areaHectare ? ` · ${f.areaHectare} hectares` : ""}`}
                        </p>

                        <div className="mt-3 grid grid-cols-3 gap-2">
                          <Stat icon={LuUsers} label="Workers" value={f.workersPresent} />
                          <Stat
                            icon={LuLeaf}
                            label="Daily yield"
                            value={`${Number(f.yieldKg || 0).toFixed(0)}kg`}
                          />
                          <Stat
                            icon={LuBriefcaseMedical}
                            label="Condition"
                            value={cond.label}
                            tone={
                              f.condition === "poor"
                                ? "text-rose-600"
                                : f.condition === "caution"
                                  ? "text-amber-700"
                                  : "text-[#14493B]"
                            }
                          />
                        </div>

                        <div className="mt-4">
                          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wide text-[#14493B]/60">
                            <span>Harvest progress</span>
                            <span>{pct === null ? "no target" : `${pct}%`}</span>
                          </div>
                          <div className="mt-1 h-2.5 w-full rounded-full bg-white/80">
                            {pct !== null && (
                              <div
                                className={`h-2.5 rounded-full ${cond.bar}`}
                                style={{ width: `${Math.min(pct, 100)}%` }}
                              />
                            )}
                          </div>
                          {f.targetKgPerDay ? (
                            <p className="mt-1 text-[10px] text-[#14493B]/40">
                              target {Number(f.targetKgPerDay).toFixed(0)} kg/day
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer mirrors the header bar so the modal is bookended by the
              same dark green, rather than trailing off into a pale strip. The
              button inverts to white-on-dark, since a dark button on a dark bar
              would disappear. */}
          <div className={`flex items-center justify-between ${HEADER} px-6 py-4`}>
            <span className="text-xs text-white/70">
              Showing {shown.length} of {fields.length} fields
            </span>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-white px-5 py-2 text-sm font-bold text-[#14493B] transition hover:bg-white/90"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
