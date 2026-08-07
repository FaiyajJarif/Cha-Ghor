import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  LuX,
  LuCamera,
  LuImage,
  LuTriangleAlert,
  LuCircleCheck,
  LuSend,
} from "react-icons/lu";
import api from "../../api/client";
import { apiError } from "../../lib/apiError";
import ZonePicker from "./ZonePicker";

// See a problem in a field, photograph it, tell the office.
//
// One action does three things: the photo is stored, the leaf is examined, and
// a case is filed in admin Reports & Complaints with the photo attached. The
// supervisor does not have to remember to raise it separately — which is the
// step that actually gets skipped when someone is halfway through a weigh-in
// queue.
//
// The case goes through the normal FieldCase module, so it lands beside every
// other issue rather than in a leaf-only inbox nobody checks.
//
// SEVERITY SETS PRIORITY ON THE SERVER, not here: SEVERE -> HIGH, MODERATE ->
// MEDIUM, anything else LOW. A supervisor who thought it was worth reporting
// still gets it filed even when the model says the leaf looks fine — they may
// be seeing something a photograph did not capture.

const HEADER = "bg-[#14493B]";

const BAND = {
  HEALTHY: { label: "Healthy", tone: "bg-emerald-100 text-emerald-700" },
  MINOR: { label: "Minor", tone: "bg-lime-100 text-lime-800" },
  MODERATE: { label: "Moderate", tone: "bg-amber-100 text-amber-800" },
  SEVERE: { label: "Severe", tone: "bg-rose-100 text-rose-700" },
};

export default function ReportLeafProblemModal({ open, zones, defaultZone, onClose, onFiled }) {
  const camRef = useRef(null);
  const galRef = useRef(null);
  const urlRef = useRef("");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [zone, setZone] = useState(defaultZone ?? null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const cameraLikely =
    typeof window !== "undefined" &&
    (window.isSecureContext ||
      ["localhost", "127.0.0.1"].includes(window.location?.hostname));

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setNote("");
    setError("");
    setResult(null);
    setZone(defaultZone ?? null);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return "";
    });
  }, [open, defaultZone]);

  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  const pick = (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setFile(f);
    setError("");
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      const u = URL.createObjectURL(f);
      urlRef.current = u;
      return u;
    });
  };

  const submit = async () => {
    if (!file) {
      setError("Take a photo of the problem first.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const zoneName = zones?.find((z) => z.id === zone)?.label;
      const { data } = await api.post("/leaf/health-report", form, {
        params: { zone: zoneName || undefined, note: note.trim() || undefined },
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(data);
      onFiled?.(data);
    } catch (err) {
      setError(apiError(err, "Could not send that report."));
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  const a = result?.assessment;
  const band = a?.healthBand ? BAND[a.healthBand] : null;

  return createPortal(
    <>
      <input ref={camRef} type="file" accept="image/*" capture="environment" onChange={pick} className="hidden" />
      <input ref={galRef} type="file" accept="image/*" onChange={pick} className="hidden" />
      <div className="fixed inset-0 z-[1200] bg-black/40" onClick={onClose} aria-hidden />
      <div className="fixed inset-0 z-[1210] flex items-center justify-center p-4">
        <div
          className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-label="Report a leaf problem"
        >
          <div className={`flex items-center justify-between ${HEADER} px-6 py-5`}>
            <div>
              <h3 className="text-xl font-extrabold text-white">Report a leaf problem</h3>
              <p className="text-xs text-white/60">
                Photograph it — the office is told straight away
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid h-9 w-9 place-items-center rounded-full bg-white/20 text-white"
            >
              <LuX size={17} />
            </button>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto bg-[#F4FFE9] px-6 py-5">
            {error && (
              <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-sm text-rose-700">{error}</p>
            )}

            {result ? (
              /* ---------- filed ---------- */
              <>
                <div className="flex flex-col items-center text-center">
                  <LuCircleCheck size={54} strokeWidth={1.5} className="text-[#14493B]" />
                  <h4 className="mt-4 text-xl font-extrabold text-[#14493B]">
                    {result.caseId ? "Reported to the office" : "Examined"}
                  </h4>
                  {result.caseId ? (
                    <p className="mt-1 text-sm text-[#14493B]/60">
                      Case #{result.caseId} — {result.caseTitle}
                    </p>
                  ) : null}
                </div>

                {/* If the case did not file, say so. A supervisor who thinks the
                    office has been told, when it has not, is worse off than one
                    who knows to raise it by hand. */}
                {result.reportError && (
                  <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-900 ring-1 ring-amber-200">
                    <LuTriangleAlert size={15} className="mt-0.5 shrink-0" />
                    {result.reportError}
                  </p>
                )}

                {a && (
                  <div className="rounded-xl bg-white p-4 ring-1 ring-[#13483B]/15">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wide text-cg-ink/50">
                        What the photo showed
                      </span>
                      {band && (
                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${band.tone}`}>
                          {band.label}
                          {a.healthScore != null ? ` · ${a.healthScore}/100` : ""}
                        </span>
                      )}
                    </div>
                    {a.candidates?.length > 0 ? (
                      <ul className="mt-2 space-y-1">
                        {a.candidates.map((c, i) => (
                          <li key={i} className="flex items-center justify-between text-sm">
                            <span className="capitalize text-cg-ink">{c.condition}</span>
                            <span className="text-xs font-bold text-cg-ink/60">
                              {Math.round((c.likelihood || 0) * 100)}%
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-xs text-cg-ink/60">
                        {a.advice || "Nothing could be identified from the photo."}
                      </p>
                    )}
                    <p className="mt-2 text-[10px] text-cg-ink/40">
                      Possible causes only, from one photograph. No treatment or
                      chemical is recommended.
                    </p>
                  </div>
                )}

                <button
                  type="button"
                  onClick={onClose}
                  className={`w-full rounded-2xl ${HEADER} px-6 py-3 text-sm font-semibold text-white`}
                >
                  Done
                </button>
              </>
            ) : (
              /* ---------- compose ---------- */
              <>
                {preview ? (
                  <img
                    src={preview}
                    alt="The problem"
                    className="h-44 w-full rounded-xl object-cover ring-1 ring-[#13483B59]"
                  />
                ) : (
                  <div className="grid h-44 place-items-center rounded-xl border border-dashed border-[#13483B59] text-sm text-[#14493B]/40">
                    No photo yet
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => camRef.current?.click()}
                    title={
                      cameraLikely
                        ? "Open the camera"
                        : "Camera needs https — this will open your files instead"
                    }
                    className={`inline-flex items-center gap-2 rounded-xl ${HEADER} px-4 py-2.5 text-sm font-semibold text-white`}
                  >
                    <LuCamera size={15} /> {preview ? "Retake" : "Take photo"}
                  </button>
                  <button
                    type="button"
                    onClick={() => galRef.current?.click()}
                    className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-[#14493B] ring-1 ring-[#13483B]/25"
                  >
                    <LuImage size={15} /> Choose a file
                  </button>
                </div>

                <div>
                  <span className="mb-1.5 block text-sm font-bold text-[#14493B]">
                    Which field?
                  </span>
                  <ZonePicker
                    value={zone}
                    zones={zones}
                    homeZoneName="Not sure"
                    placeholder="Pick the field"
                    size="lg"
                    onChange={setZone}
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-bold text-[#14493B]" htmlFor="rp-note">
                    Anything to add? <span className="font-normal opacity-60">(optional)</span>
                  </label>
                  <textarea
                    id="rp-note"
                    rows={3}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Where in the field, how much of it, how long it has been like this…"
                    className="w-full resize-y rounded-xl border border-[#13483B]/30 bg-white px-4 py-2.5 text-sm outline-none focus:border-[#14493B]"
                  />
                  {/* What a model cannot see from one frame is exactly what a
                      person standing there can add. */}
                  <p className="mt-1 text-[11px] text-[#14493B]/50">
                    The photo shows one moment. What you know about the field is
                    the part the AI cannot read.
                  </p>
                </div>
              </>
            )}
          </div>

          {!result && (
            <div className={`flex items-center justify-end gap-2 ${HEADER} px-6 py-4`}>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white/70"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={busy || !file}
                className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-[#14493B] disabled:opacity-50"
              >
                <LuSend size={15} />
                {busy ? "Examining…" : "Examine and report"}
              </button>
            </div>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}
