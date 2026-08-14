import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  LuX,
  LuSearch,
  LuScale,
  LuCircleCheck,
  LuChevronLeft,
  LuChevronRight,
  LuClock,
  LuTriangleAlert,
  LuCamera,
  LuSparkles,
  LuImage,
} from "react-icons/lu";
import api from "../../api/client";
import { apiError } from "../../lib/apiError";
import { queueOrSend } from "../../lib/outbox";
import { newUuid } from "../../lib/uuid";
import ZonePicker from "./ZonePicker";
import ReportLeafProblemModal from "./ReportLeafProblemModal";

// Weigh-in board — the whole day's scale work on one sliding panel.
//
// This replaces typing a worker id into a modal for every single person. At a
// real scale the supervisor works down a queue of people who are standing in
// front of them; making them type "CG047" each time, one modal at a time, is
// the wrong shape for that job.
//
// ONLY WORKERS MARKED PRESENT OR LATE APPEAR. Someone absent cannot hand in
// leaf, and offering them would let kilos be recorded against a worker who was
// never there — which pays out as surplus.
//
// Each row shows the field the worker was assigned to TODAY, not their home
// zone, because that is where the leaf actually came from and it is what the
// per-field yield is built on.
//
// Rows are a DRAFT until Save. Nothing reaches the server as you type, so a
// mistyped weight can be corrected before it becomes a wage.

const PAGE_SIZE = 10;
const HEADER = "bg-[#14493B]";

// A, B and C. leaf_grade has been ENUM('A','B','C') since V1 and LeafGrade has
// had C all along -- only the UI omitted it. C pays exactly like B: it is
// recorded for quality tracking and carries no bonus, so adding it changes
// nobody's wage.
const GRADES = [
  { value: "A", label: "A", hint: "two leaves and a bud" },
  { value: "B", label: "B", hint: "coarser pluck" },
  { value: "C", label: "C", hint: "very coarse — pays the same as B" },
];

function Avatar({ name }) {
  const initials = (name || "?")
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-cg-lime text-xs font-bold text-cg-green">
      {initials}
    </span>
  );
}

export default function LeafWeighInDrawer({
  open,
  date,
  workers,          // already filtered to present/late by the page
  zones,
  registerTaken = true,
  alreadyWeighed,   // Map: workerId -> kg recorded so far today
  onSaved,
  onClose,
}) {
  const [draft, setDraft] = useState({}); // workerId -> { kg, grade, zoneId }
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;
    setDraft({});
    setQ("");
    setPage(0);
    setError("");
    setResult(null);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => setPage(0), [q]);

  // Anyone already weighed in leaves the queue.
  //
  // The board is a list of people still to be dealt with; leaving a done worker
  // on it invites a second entry that reads as a correction but is actually an
  // ADDITION — the kilos add up and the surplus with them. Corrections belong
  // in Recent Weight Entries, where editing replaces the number instead.
  //
  // A genuine second trip to the scale is still possible via "Show all", since
  // pluckers do come back, but it is behind a deliberate click.
  const [showDone, setShowDone] = useState(false);
  // Which row's camera is open, and which row is waiting on the grader.
  const photoRef = useRef(null);
  const galleryRef = useRef(null);
  // Camera capture needs https or localhost. Everywhere else the browser
  // silently falls back to the file picker, so say so rather than letting it
  // look broken.
  const cameraLikely =
    typeof window !== "undefined" &&
    (window.isSecureContext ||
      ["localhost", "127.0.0.1"].includes(window.location?.hostname));
  const [photoFor, setPhotoFor] = useState(null);
  const [gradingId, setGradingId] = useState(null);
  // Spotted something wrong while weighing? Report it without leaving the queue.
  const [reportOpen, setReportOpen] = useState(false);

  // Photograph the bulk this worker handed in.
  //
  // TWO SEPARATE PURPOSES, and the first is the important one:
  //   1. EVIDENCE — a picture of the bulk on the scale, kept against the row,
  //      so a disputed weigh-in can be looked at rather than argued about.
  //   2. A GRADE SUGGESTION, which is a convenience on top. The supervisor
  //      taps A, B or C themselves. The suggestion is DISPLAYED, never applied.
  // The photo is stored even when the grader is unavailable, because the
  // evidence is worth more than the opinion.
  //
  // WHY THE SUGGESTION IS NOT PRE-SELECTED (measured, not assumed):
  // eval_leaf_grade.py over 97 labelled photographs from the Sylhet
  // TeaLeafAgeQuality set — the model answered A on 91% of them when only 51%
  // were A. Recall on grade B was 14.6%. Overall 56.7% against a 51%
  // always-guess-A baseline, p = 0.15, i.e. indistinguishable from guessing.
  // Grade-A kilos pay a ৳1/kg bonus, so pre-filling a grade this biased and
  // letting a supervisor confirm it by reflex would put money on the payroll
  // that the leaf did not earn. It suggests; the person decides.
  const takePhoto = async (e) => {
    const file = e.target.files?.[0];
    const workerId = photoFor;
    e.target.value = "";
    setPhotoFor(null);
    if (!file || !workerId) return;

    set(workerId, { photoPreview: URL.createObjectURL(file) });
    setGradingId(workerId);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const { data } = await api.post("/leaf/grade-photo", form, {
        params: { ref: `worker:${workerId}` },
        headers: { "Content-Type": "multipart/form-data" },
      });
      set(workerId, {
        photoId: data.visionId ?? null,
        suggested: data.grade ?? null,
        // Confidence is deliberately NOT kept. Measured at 0.96 when the model
        // was right and 0.96 when it was wrong — it carries no information, and
        // showing a percentage would lend the guess an authority it has not
        // earned.
      });
    } catch (err) {
      setError(apiError(err, "Could not attach that photo."));
    } finally {
      setGradingId(null);
    }
  };

  const doneCount = useMemo(
    () => workers.filter((w) => (alreadyWeighed?.get?.(w.id) || 0) > 0).length,
    [workers, alreadyWeighed],
  );

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return workers.filter((w) => {
      const weighed = (alreadyWeighed?.get?.(w.id) || 0) > 0;
      if (weighed && !showDone) return false;
      return (
        !s ||
        (w.fullName || "").toLowerCase().includes(s) ||
        String(w.id).includes(s)
      );
    });
  }, [workers, q, alreadyWeighed, showDone]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const set = (id, patch) =>
    setDraft((d) => ({ ...d, [id]: { ...(d[id] || {}), ...patch } }));

  // Only rows with a real weight count as entries to save.
  const filled = useMemo(
    () =>
      Object.entries(draft)
        .map(([id, v]) => ({ workerId: Number(id), ...v }))
        .filter((r) => r.kg !== "" && r.kg != null && Number(r.kg) > 0),
    [draft],
  );

  const totalKg = filled.reduce((s, r) => s + Number(r.kg || 0), 0);

  const save = async () => {
    if (filled.length === 0) {
      setError("Enter a weight for at least one worker.");
      return;
    }
    const over = filled.find((r) => Number(r.kg) > 200);
    if (over) {
      const w = workers.find((x) => x.id === over.workerId);
      setError(
        `${w?.fullName || "That worker"} is down for ${over.kg} kg — over 200 kg. Check the scale before saving.`,
      );
      return;
    }
    const noGrade = filled.find((r) => !r.grade);
    if (noGrade) {
      const w = workers.find((x) => x.id === noGrade.workerId);
      setError(`Pick a quality grade for ${w?.fullName || "that worker"}.`);
      return;
    }

    setSaving(true);
    setError("");
    let sent = 0;
    let queued = 0;
    try {
      // One request per weigh-in, because leaf has no bulk endpoint and each
      // row is an independent record. Each carries its own client_uuid so a
      // replay cannot count the same kilos twice.
      for (const r of filled) {
        const w = workers.find((x) => x.id === r.workerId);
        const clientUuid = newUuid();
        const res = await queueOrSend({
          path: "/leaf",
          body: {
            workerId: r.workerId,
            date,
            weightKg: Number(r.kg),
            grade: r.grade,
            zoneId: r.zoneId ?? w?.todayZoneId ?? null,
            photoId: r.photoId ?? null,
            clientUuid,
          },
          clientUuid,
        });
        if (res?.queued) queued += 1;
        else sent += 1;
      }
      setResult({ sent, queued, totalKg });
      onSaved?.();
    } catch (err) {
      setError(apiError(err, "Could not save the weigh-ins."));
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const prettyDate = (() => {
    try {
      return new Date(date).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } catch {
      return date;
    }
  })();

  return createPortal(
    <>
      {/* TWO inputs on purpose.
          `capture` only asks for the camera; the browser may ignore it, and
          ALWAYS ignores it outside a secure context. Opening the app on a phone
          at http://192.168.x.x is not a secure context, so the camera is
          blocked and you get the file picker instead — which looks like a bug
          but is the browser's rule. Keeping a separate gallery input means the
          fallback is deliberate rather than a surprise. */}
      <input
        ref={photoRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={takePhoto}
        className="hidden"
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        onChange={takePhoto}
        className="hidden"
      />
      <ReportLeafProblemModal
        open={reportOpen}
        zones={zones}
        onClose={() => setReportOpen(false)}
      />
      <div className="fixed inset-0 z-[1200] bg-black/40" onClick={onClose} aria-hidden />
      <aside
        className="fixed inset-y-0 right-0 z-[1210] flex w-full max-w-3xl flex-col bg-white shadow-2xl"
        role="dialog"
        aria-label="Leaf weigh-in board"
      >
        {/* Header */}
        <div className={`flex flex-wrap items-start justify-between gap-3 ${HEADER} px-6 py-4`}>
          <div>
            <h3 className="text-xl font-extrabold text-white">Weigh-in board</h3>
            <p className="text-sm text-white/60">
              {prettyDate} · {workers.length} at work today
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {filled.length > 0 && (
              <span className="rounded-xl bg-white/20 px-3 py-2 text-sm font-bold text-white">
                {filled.length} entries · {totalKg.toFixed(1)} kg
              </span>
            )}
            <button
              type="button"
              onClick={save}
              disabled={saving || filled.length === 0}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-sm font-bold text-[#14493B] transition hover:bg-white/90 disabled:opacity-50"
            >
              <LuScale size={15} /> {saving ? "Saving…" : "Save weigh-ins"}
            </button>
            <button
              type="button"
              onClick={() => setReportOpen(true)}
              title="Photograph a problem in the field and tell the office"
              className="inline-flex items-center gap-1.5 rounded-xl bg-white/20 px-3 py-2 text-sm font-bold text-white transition hover:bg-white/30"
            >
              <LuTriangleAlert size={15} /> Report a problem
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid h-9 w-9 place-items-center rounded-full bg-white/20 text-white transition hover:bg-white/30"
            >
              <LuX size={16} />
            </button>
          </div>
        </div>

        {result ? (
          /* ---------- done ---------- */
          <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
            <LuCircleCheck size={64} strokeWidth={1.5} className="text-cg-green" />
            <h4 className="mt-6 text-2xl font-extrabold text-cg-ink">
              {result.queued > 0 ? "Saved on this device" : "Weigh-ins recorded"}
            </h4>
            <p className="mt-2 text-sm text-cg-ink/60">
              {result.sent + result.queued} entries · {result.totalKg.toFixed(1)} kg
            </p>
            {/* Never call a queued write "sent". */}
            {result.queued > 0 && (
              <p className="mt-3 max-w-sm rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-900 ring-1 ring-amber-200">
                {result.queued} of them had no network and are stored on this
                phone. They upload by themselves when signal returns — you can
                close the app.
              </p>
            )}
            <div className="mt-8 flex w-full max-w-xs flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  setDraft({});
                  setResult(null);
                }}
                className="w-full rounded-2xl bg-cg-dark px-6 py-3 text-base font-semibold text-white"
              >
                Weigh more
              </button>
              <button
                type="button"
                onClick={onClose}
                className="w-full rounded-2xl px-6 py-2 text-sm font-semibold text-cg-ink/60 hover:bg-cg-lime/40"
              >
                Done for now
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3 px-6 py-4">
              <label className="relative flex min-w-[14rem] flex-1 items-center">
                <LuSearch
                  size={15}
                  className="pointer-events-none absolute left-3 text-cg-ink/40"
                />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search the queue…"
                  className="w-full rounded-xl border border-[#13483B59] bg-cg-lime/20 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-cg-green"
                />
              </label>
              <span className="text-xs text-cg-ink/50">
                Nothing is saved until you press Save
              </span>
              {!cameraLikely && (
                <span className="rounded-lg bg-amber-50 px-3 py-1.5 text-[11px] font-semibold text-amber-900 ring-1 ring-amber-200">
                  Camera needs https — photo buttons will open your files
                </span>
              )}
              {doneCount > 0 && (
                <button
                  type="button"
                  onClick={() => setShowDone((v) => !v)}
                  className="rounded-lg bg-cg-lime/60 px-3 py-1.5 text-xs font-bold text-cg-green"
                >
                  {showDone
                    ? `Hide ${doneCount} already weighed`
                    : `${doneCount} already weighed — show`}
                </button>
              )}
            </div>

            {error && (
              <p className="mx-6 mb-2 rounded-xl bg-rose-50 px-4 py-2.5 text-sm text-rose-700">
                {error}
              </p>
            )}

            {/* The queue */}
            <div className="flex-1 overflow-y-auto px-6">
              {workers.length > 0 && rows.length === 0 && !q.trim() ? (
                <div className="mt-6 flex items-start gap-2 rounded-xl bg-emerald-50 px-4 py-4 text-sm text-emerald-900 ring-1 ring-emerald-200">
                  <LuCircleCheck size={16} className="mt-0.5 shrink-0" />
                  <span>
                    Everyone at work today has been weighed in. Corrections go
                    through Recent Weight Entries, where editing replaces the
                    weight instead of adding to it.
                  </span>
                </div>
              ) : workers.length === 0 ? (
                <div className="mt-6 flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-4 text-sm text-amber-900 ring-1 ring-amber-200">
                  <LuTriangleAlert size={16} className="mt-0.5 shrink-0" />
                  <span>
                    {registerTaken
                      ? "Nobody is marked present or late today, so there is no one to weigh in for."
                      : "Attendance has not been taken for this day yet. Mark the register first — only workers who turned up can hand in leaf."}
                  </span>
                </div>
              ) : (
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead>
                    <tr className="bg-cg-dark text-[11px] uppercase tracking-wide text-white/90">
                      <th className="px-4 py-3 font-bold">Worker</th>
                      <th className="px-4 py-3 font-bold">Field today</th>
                      <th className="px-4 py-3 font-bold">Weight (kg)</th>
                      <th className="px-4 py-3 font-bold">Grade</th>
                      <th className="px-4 py-3 font-bold">Bulk photo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-cg-green/10">
                    {pageRows.map((w) => {
                      const d = draft[w.id] || {};
                      const done = alreadyWeighed?.get?.(w.id);
                      return (
                        <tr key={w.id} className="hover:bg-cg-lime/20">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <Avatar name={w.fullName} />
                              <div>
                                <p className="font-semibold text-cg-ink">
                                  {w.fullName}
                                </p>
                                <p className="flex items-center gap-1.5 text-xs text-cg-ink/40">
                                  CG{String(w.id).padStart(3, "0")}
                                  {w.todayStatus === "late" && (
                                    <span className="inline-flex items-center gap-0.5 rounded bg-amber-100 px-1.5 text-[10px] font-bold text-amber-800">
                                      <LuClock size={9} /> late
                                    </span>
                                  )}
                                  {/* Already-weighed kilos, so a second entry
                                      is a deliberate addition rather than an
                                      accidental duplicate. */}
                                  {done > 0 && (
                                    <span className="rounded bg-cg-lime px-1.5 text-[10px] font-bold text-cg-green">
                                      {done} kg in
                                    </span>
                                  )}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="w-40">
                              <ZonePicker
                                value={d.zoneId ?? w.todayZoneId ?? null}
                                zones={zones}
                                homeZoneName={w.zoneName || "—"}
                                onChange={(id) => set(w.id, { zoneId: id })}
                              />
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="number"
                              min={0}
                              max={200}
                              step="0.1"
                              inputMode="decimal"
                              value={d.kg ?? ""}
                              onChange={(e) => {
                                set(w.id, { kg: e.target.value });
                                setError("");
                              }}
                              placeholder="0.0"
                              aria-label={`Weight for ${w.fullName}`}
                              // EXPLICIT bg AND text colour. This field set
                              // neither, so it inherited: Tailwind's preflight
                              // gives inputs `color: inherit`, and a browser in
                              // dark mode darkens an unstyled control's
                              // background. The result was white-on-white — a
                              // supervisor typing a weight they could not read,
                              // on the one screen where the number becomes wages.
                              className="w-24 rounded-lg border border-[#13483B59] bg-white px-2.5 py-1.5 text-sm font-semibold text-cg-ink placeholder:text-cg-ink/35 outline-none focus:border-cg-green"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1">
                              {GRADES.map((g) => {
                                // The model's guess is shown as a dotted outline
                                // on the button, never as a selection. Nothing is
                                // recorded until the supervisor taps.
                                const hinted =
                                  d.suggested === g.value && d.grade !== g.value;
                                return (
                                  <button
                                    key={g.value}
                                    type="button"
                                    title={
                                      hinted
                                        ? `${g.hint} — the photo suggests this. Often wrong; check the leaf.`
                                        : g.hint
                                    }
                                    onClick={() => set(w.id, { grade: g.value })}
                                    className={`h-8 w-8 rounded-lg text-xs font-bold transition ${
                                      d.grade === g.value
                                        ? "bg-cg-dark text-white"
                                        : hinted
                                          ? // A ring, not a fill. Tailwind rings
                                            // cannot be dashed, so the weaker
                                            // signal is opacity: clearly marked,
                                            // clearly not the chosen one.
                                            "bg-cg-lime/50 text-cg-ink ring-2 ring-cg-dark/40 hover:bg-cg-lime"
                                          : "bg-cg-lime/50 text-cg-ink hover:bg-cg-lime"
                                    }`}
                                  >
                                    {g.label}
                                  </button>
                                );
                              })}
                            </div>
                            {d.suggested && !d.grade && (
                              <p className="mt-1 text-[10px] leading-tight text-cg-ink/45">
                                photo suggests {d.suggested} — you decide
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {d.photoPreview ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setPhotoFor(w.id);
                                  photoRef.current?.click();
                                }}
                                title="Retake"
                                className="relative block"
                              >
                                <img
                                  src={d.photoPreview}
                                  alt=""
                                  className="h-11 w-11 rounded-lg object-cover ring-1 ring-[#13483B59]"
                                />
                                {d.suggested && (
                                  <span className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-cg-dark text-[9px] font-bold text-white">
                                    {d.suggested}
                                  </span>
                                )}
                              </button>
                            ) : (
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPhotoFor(w.id);
                                    photoRef.current?.click();
                                  }}
                                  disabled={gradingId === w.id}
                                  title={
                                    cameraLikely
                                      ? "Photograph the bulk — kept as evidence, and suggests a grade"
                                      : "Opens the camera on a phone over https. On plain http the browser blocks it and opens your files instead."
                                  }
                                  className="grid h-11 w-11 place-items-center rounded-lg border border-dashed border-[#13483B59] text-cg-ink/40 transition hover:bg-cg-lime/30 disabled:opacity-40"
                                >
                                  {gradingId === w.id ? (
                                    <LuSparkles size={16} className="animate-pulse text-cg-green" />
                                  ) : (
                                    <LuCamera size={16} />
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPhotoFor(w.id);
                                    galleryRef.current?.click();
                                  }}
                                  disabled={gradingId === w.id}
                                  title="Choose an existing photo"
                                  className="grid h-11 w-7 place-items-center rounded-lg text-cg-ink/30 transition hover:bg-cg-lime/30 disabled:opacity-40"
                                >
                                  <LuImage size={14} />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Pagination */}
            {workers.length > 0 && (
              <div className={`flex flex-wrap items-center justify-between gap-3 ${HEADER} px-6 py-3`}>
                <span className="text-xs font-bold uppercase tracking-wide text-white/70">
                  Showing {pageRows.length} of {rows.length}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    aria-label="Previous page"
                    className="grid h-8 w-8 place-items-center rounded-lg bg-white/20 text-white disabled:opacity-40"
                  >
                    <LuChevronLeft size={15} />
                  </button>
                  <span className="px-2 text-xs font-bold text-white">
                    {page + 1} / {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                    aria-label="Next page"
                    className="grid h-8 w-8 place-items-center rounded-lg bg-white/20 text-white disabled:opacity-40"
                  >
                    <LuChevronRight size={15} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </aside>
    </>,
    document.body,
  );
}
