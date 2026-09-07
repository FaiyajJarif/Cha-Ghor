import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { LuX, LuCircleCheck, LuChevronDown } from "react-icons/lu";
import api from "../../api/client";
import { apiError } from "../../lib/apiError";
import { queueOrSend } from "../../lib/outbox";
import { newUuid } from "../../lib/uuid";

// Submit Collection — weighing green leaf at the field scale.
//
// This is the capture step the whole payroll chain depends on: no rows here
// means surplus and grade bonus are ৳0 on every payslip. Two states, matching
// the agreed design — the form, then a success card.
//
// The worker is entered as a CG id (typed or scanned off a card) rather than
// picked from a list, because at the scale the supervisor is reading the number
// off the worker's own card. It is resolved against the real workforce as you
// type, and the matched name is shown back — so a wrong number is visible
// BEFORE saving rather than discovered on payday.

const HEADER = "bg-[#14493B]";
const FIELD =
  "w-full rounded-xl bg-[#CFE8DB] px-4 py-3 text-sm text-[#14493B] placeholder-[#14493B]/40 outline-none transition focus:ring-2 focus:ring-[#14493B]/30";
const LABEL = "mb-1.5 block text-base font-bold text-[#14493B]";

// C pays like B: recorded for quality tracking, carries no bonus.
const GRADES = [
  { value: "A", label: "Grade A — two leaves and a bud" },
  { value: "B", label: "Grade B — coarser pluck" },
  { value: "C", label: "Grade C — very coarse, pays like B" },
];

// Accepts "CG003", "cg3", "003" or "3" — whatever is written on the card.
function parseWorkerId(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/[^0-9]/g, "");
  if (!digits) return null;
  return Number(digits);
}

export default function WeighInModal({ open, date, workers, zones, registerTaken = true, onSaved, onClose }) {
  // Only someone who was at work can hand in leaf. `workers` is already
  // filtered to today's present/late register by the page — see
  // SupervisorLeaf. An empty list therefore means the register has not been
  // taken yet, which is a different problem from "nobody came".
  const [workerRef, setWorkerRef] = useState("");
  const [weight, setWeight] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [grade, setGrade] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null); // the saved entry, shows the success card

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const reset = () => {
    setWorkerRef("");
    setWeight("");
    setZoneId("");
    setGrade("");
    setError("");
    setDone(null);
  };

  useEffect(() => {
    if (open) reset();
  }, [open]);

  // Resolve the typed id against the real workforce as it is entered.
  const matched = useMemo(() => {
    const id = parseWorkerId(workerRef);
    if (id == null) return null;
    return workers.find((w) => w.id === id) || null;
  }, [workerRef, workers]);

  const save = async () => {
    const id = parseWorkerId(workerRef);
    if (id == null || !matched) {
      setError(
        workerRef.trim()
          ? `No worker with id ${workerRef.trim()} is marked present or late today.`
          : "Enter the worker's CG id.",
      );
      return;
    }
    const kgVal = Number(weight);
    // Guarded here as well as on the server: the payroll surplus is computed
    // straight off this number, so a mistyped weight becomes a wrong wage.
    if (!weight || Number.isNaN(kgVal) || kgVal <= 0) {
      setError("Enter the harvest weight in kilograms.");
      return;
    }
    if (kgVal > 200) {
      setError("That is over 200 kg — check the scale before saving.");
      return;
    }
    if (!grade) {
      setError("Pick a quality grade.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      // The scale is in the field, where there is often no signal. The write
      // goes through the outbox so the weigh-in survives, and carries a
      // client_uuid so a replay is recognised as the SAME weigh-in rather than
      // a second bucket of leaf — a duplicate here would overpay the worker,
      // because surplus is computed straight off this weight.
      const clientUuid = newUuid();
      const { queued } = await queueOrSend({
        path: "/leaf",
        body: {
          workerId: id,
          date,
          weightKg: kgVal,
          grade,
          zoneId: zoneId ? Number(zoneId) : null,
          clientUuid,
        },
        clientUuid,
      });
      setDone({ name: matched.fullName, kg: kgVal, grade, queued: !!queued });
      onSaved?.();
    } catch (err) {
      setError(apiError(err, "Could not save that collection entry."));
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[1200] bg-black/40" onClick={onClose} aria-hidden />
      <div className="fixed inset-0 z-[1210] flex items-center justify-center p-4">
        <div
          className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-label="Submit collection"
        >
          {done ? (
            /* ---------- success ---------- */
            <div className="flex flex-col items-center px-8 py-10 text-center">
              <LuCircleCheck size={64} strokeWidth={1.5} className="text-[#14493B]" />
              <h3 className="mt-6 text-2xl font-extrabold leading-tight text-[#14493B]">
                {done.queued ? (
                  <>
                    Saved On
                    <br />
                    This Device
                  </>
                ) : (
                  <>
                    Collection Entered
                    <br />
                    Successfully
                  </>
                )}
              </h3>
              <p className="mt-3 text-sm text-[#14493B]/60">
                {done.name} · {done.kg} kg · Grade {done.grade}
              </p>
              {/* Never say "sent" about something still sitting in a queue. */}
              {done.queued && (
                <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  No network right now. This weigh-in is stored on the phone and
                  uploads by itself when signal returns — you can keep weighing.
                </p>
              )}
              <div className="mt-8 flex w-full flex-col gap-2">
                <button
                  type="button"
                  onClick={reset}
                  className={`w-full rounded-2xl ${HEADER} px-6 py-3.5 text-base font-semibold text-white transition hover:brightness-110`}
                >
                  Continue
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full rounded-2xl px-6 py-2 text-sm font-semibold text-[#14493B]/60 transition hover:bg-[#CFE8DB]/50"
                >
                  Done for now
                </button>
              </div>
            </div>
          ) : (
            /* ---------- form ---------- */
            <>
              <div className={`flex items-center justify-between ${HEADER} px-6 py-5`}>
                <h3 className="text-xl font-extrabold text-white">
                  Submit Collection
                </h3>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="grid h-9 w-9 place-items-center rounded-full bg-white/20 text-white transition hover:bg-white/30"
                >
                  <LuX size={17} />
                </button>
              </div>

              <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
                {error && (
                  <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-sm text-rose-700">
                    {error}
                  </p>
                )}

                {/* Distinguish "register not taken" from "nobody came". The
                    first is fixable and is almost always what has happened. */}
                {workers.length === 0 && (
                  <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
                    {registerTaken
                      ? "Nobody is marked present or late today, so there is no one to weigh in for."
                      : "Attendance has not been taken for this day yet. Mark the register first — only workers who turned up can hand in leaf."}
                  </p>
                )}

                <div>
                  <label className={LABEL} htmlFor="wi-worker">
                    Worker Id
                  </label>
                  <input
                    id="wi-worker"
                    autoFocus
                    value={workerRef}
                    onChange={(e) => {
                      setWorkerRef(e.target.value);
                      setError("");
                    }}
                    placeholder="CG.."
                    className={FIELD}
                  />
                  {/* Resolved name, so a wrong id is caught before saving. */}
                  {workerRef.trim() ? (
                    matched ? (
                      <p className="mt-1.5 text-xs font-semibold text-[#14493B]">
                        {matched.fullName}
                        {matched.zoneName ? ` · ${matched.zoneName}` : ""}
                      </p>
                    ) : (
                      <p className="mt-1.5 text-xs font-semibold text-rose-600">
                        No active worker with that id.
                      </p>
                    )
                  ) : null}
                </div>

                <div>
                  <label className={LABEL} htmlFor="wi-weight">
                    Harvest Weight
                  </label>
                  <div className="relative">
                    <input
                      id="wi-weight"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.1"
                      value={weight}
                      onChange={(e) => {
                        setWeight(e.target.value);
                        setError("");
                      }}
                      placeholder="0.00"
                      className={`${FIELD} pr-12`}
                    />
                    <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-[#14493B]/60">
                      kg
                    </span>
                  </div>
                </div>

                <div>
                  <label className={LABEL} htmlFor="wi-zone">
                    Field / Zone
                  </label>
                  <div className="relative">
                    <select
                      id="wi-zone"
                      value={zoneId}
                      onChange={(e) => setZoneId(e.target.value)}
                      className={`${FIELD} appearance-none pr-10`}
                    >
                      <option value="">
                        {matched?.zoneName
                          ? `${matched.zoneName} (home zone)`
                          : "Select a zone"}
                      </option>
                      {zones.map((z) => (
                        <option key={z.id} value={z.id}>
                          {z.label}
                        </option>
                      ))}
                    </select>
                    <LuChevronDown
                      size={16}
                      className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[#14493B]/50"
                    />
                  </div>
                </div>

                <div>
                  <label className={LABEL} htmlFor="wi-grade">
                    Quality Grade
                  </label>
                  <div className="relative">
                    <select
                      id="wi-grade"
                      value={grade}
                      onChange={(e) => {
                        setGrade(e.target.value);
                        setError("");
                      }}
                      className={`${FIELD} appearance-none pr-10`}
                    >
                      <option value="">Select a grade</option>
                      {GRADES.map((g) => (
                        <option key={g.value} value={g.value}>
                          {g.label}
                        </option>
                      ))}
                    </select>
                    <LuChevronDown
                      size={16}
                      className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[#14493B]/50"
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-[#14493B]/50">
                    Grade A kilos earn the grade bonus on the payslip.
                  </p>
                </div>
              </div>

              <div className="flex justify-end border-t border-[#13483B]/10 px-6 py-4">
                <button
                  type="button"
                  onClick={save}
                  disabled={busy}
                  className={`rounded-2xl ${HEADER} px-6 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50`}
                >
                  {busy ? "Saving…" : "Submit Collection Entry"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}
