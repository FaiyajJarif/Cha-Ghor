import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LuCamera, LuX, LuThumbsUp, LuThumbsDown, LuCircleHelp } from "react-icons/lu";
import api from "../../api/client";
import { apiError } from "../../lib/apiError";

// The bulk photo attached to a weigh-in, plus the one question that turns this
// system into a training set.
//
// WHY A BLOB AND NOT <img src={url}>:
// attachments are served behind @PreAuthorize, so a plain img tag — which
// sends no Authorization header — gets a 401 and renders a broken image. The
// bytes are fetched through axios and turned into an object URL. Same approach
// as CaseEvidence.
//
// THE REVIEW BUTTONS ARE THE POINT.
// vision_inference has stored every suggestion the model has made since day
// one, and until now nothing ever recorded whether it was right. Agreeing or
// disagreeing here writes supervisor_verdict — one labelled example per tap,
// built from work someone was doing anyway. Nothing here changes the grade on
// the weigh-in; the supervisor already set that.

const CONDITIONS = [
  "healthy",
  "nitrogen deficiency",
  "sun scorch",
  "water stress",
  "physical damage",
  "pest damage",
  "red spider mite",
  "blister blight",
  "brown blight",
  "grey blight",
];

export default function LeafPhotoThumb({ entry, onReviewed }) {
  const [src, setSrc] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const [condition, setCondition] = useState("");
  const urlRef = useRef("");

  // Fetch once, when there is actually a photo.
  useEffect(() => {
    if (!entry?.photoUrl) return undefined;
    let alive = true;
    // The backend stores "/api/v1/complaints/attachments/…" but the axios
    // client's baseURL ALREADY ends in /api/v1, so passing it straight through
    // requested /api/v1/api/v1/… and 404'd — the photo silently failed to
    // load. Strip the prefix here; leaving it off also works for any row
    // stored without it.
    const path = entry.photoUrl.replace(/^\/api\/v1/, "");
    api
      .get(path, { responseType: "blob" })
      .then((r) => {
        if (!alive) return;
        const u = URL.createObjectURL(r.data);
        urlRef.current = u;
        setSrc(u);
      })
      .catch(() => {
        // A missing file should leave the row usable, not broken. The
        // placeholder below shows instead of a broken-image icon.
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, [entry?.photoUrl]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const send = async (verdict, correctedCondition) => {
    setBusy(true);
    setError("");
    try {
      await api.post(`/leaf/vision/${entry.photoId}/review`, {
        verdict,
        correctedCondition: correctedCondition || null,
        // The grade the supervisor actually recorded, so model-vs-human can be
        // measured on grading too.
        correctedGrade: entry.grade || null,
      });
      setDone(true);
      setCorrecting(false);
      onReviewed?.();
    } catch (err) {
      setError(apiError(err, "Could not record that."));
    } finally {
      setBusy(false);
    }
  };

  if (!entry?.photoUrl) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="See the bulk that was handed in"
        className="relative shrink-0"
      >
        {src ? (
          <img
            src={src}
            alt=""
            className="h-10 w-10 rounded-lg object-cover ring-1 ring-[#13483B59]"
          />
        ) : (
          <span
            title={failed ? "The photo file could not be loaded" : "Loading photo…"}
            className={`grid h-10 w-10 place-items-center rounded-lg ${
              failed ? "bg-rose-50 text-rose-300" : "bg-cg-lime/40 text-cg-ink/30"
            }`}
          >
            <LuCamera size={14} />
          </span>
        )}
      </button>

      {open &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-[1200] bg-black/60"
              onClick={() => setOpen(false)}
              aria-hidden
            />
            <div className="fixed inset-0 z-[1210] flex items-center justify-center p-4">
              <div
                className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-label="Bulk photo"
              >
                <div className="flex items-center justify-between bg-[#14493B] px-6 py-4">
                  <div>
                    <h3 className="text-lg font-extrabold text-white">
                      {entry.workerName}
                    </h3>
                    <p className="text-xs text-white/60">
                      {entry.weightKg} kg
                      {entry.grade ? ` · grade ${entry.grade}` : ""}
                      {entry.zone ? ` · ${entry.zone}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Close"
                    className="grid h-9 w-9 place-items-center rounded-full bg-white/20 text-white"
                  >
                    <LuX size={16} />
                  </button>
                </div>

                {src ? (
                  <img src={src} alt="Bulk handed in" className="max-h-[46vh] w-full object-contain bg-black/5" />
                ) : (
                  <p className="px-6 py-10 text-center text-sm text-cg-ink/50">
                    The photo could not be loaded.
                  </p>
                )}

                <div className="bg-[#F4FFE9] px-6 py-4">
                  {error && (
                    <p className="mb-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
                      {error}
                    </p>
                  )}

                  {done ? (
                    <p className="rounded-lg bg-emerald-50 px-3 py-2.5 text-xs text-emerald-800 ring-1 ring-emerald-200">
                      Recorded. This is now a labelled example — it is what a
                      trained model would learn from later.
                    </p>
                  ) : correcting ? (
                    <>
                      <p className="text-xs font-bold text-[#14493B]">
                        What was it actually?
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {CONDITIONS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => send("disagree", c)}
                            disabled={busy}
                            className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold capitalize transition ${
                              condition === c
                                ? "bg-[#14493B] text-white"
                                : "bg-white text-[#14493B] ring-1 ring-[#13483B]/25 hover:bg-[#D3FFAC]"
                            }`}
                          >
                            {c}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => setCorrecting(false)}
                        className="mt-2 text-[11px] font-semibold text-[#14493B]/60"
                      >
                        Back
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="text-xs text-[#14493B]/70">
                        Was the AI&rsquo;s reading of this photo right? Your
                        answer is what a future model learns from — it does not
                        change the grade.
                      </p>
                      <div className="mt-2.5 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => send("agree")}
                          disabled={busy}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-[#14493B] px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                        >
                          <LuThumbsUp size={13} /> It was right
                        </button>
                        <button
                          type="button"
                          onClick={() => setCorrecting(true)}
                          disabled={busy}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-xs font-bold text-rose-700 ring-1 ring-rose-200 disabled:opacity-50"
                        >
                          <LuThumbsDown size={13} /> It was wrong
                        </button>
                        <button
                          type="button"
                          onClick={() => send("unsure")}
                          disabled={busy}
                          className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-[#14493B]/60"
                        >
                          <LuCircleHelp size={13} /> Not sure
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
