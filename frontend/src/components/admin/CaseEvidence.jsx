import { useCallback, useEffect, useRef, useState } from "react";
import { LuPaperclip, LuDownload, LuFileText, LuTrash2, LuMic } from "react-icons/lu";
import api from "../../api/client";
import { apiError } from "../../lib/apiError";
import { BTN_GHOST } from "../../lib/ui";

// Evidence attached to a complaint or field report.
//
// WHY THIS IS NOT JUST AN <img src>:
// the attachment endpoint is authenticated like the rest of the API, and a
// plain img tag sends no Authorization header -- it would simply 401. So the
// file is fetched through axios as a blob and shown from an object URL. That
// also means evidence about a named worker is not readable by anyone who
// happens to have the link.
//
// Object URLs are revoked on unmount and before each refetch, otherwise the
// blob stays in memory for the life of the tab.
//
// AUDIO. A worker who cannot write records the complaint instead of typing it
// (VoiceNote.jsx), and it arrives here as the same evidence attachment a photo
// would. It is played, not transcribed: nothing in this project converts speech
// to text, so nothing can put words a worker did not say into a grievance about
// a named person.
//
// The <audio> element gets the same blob-through-axios treatment as the image,
// for the same reason -- a bare src sends no Authorization header and 401s.

const ACCEPT =
  "image/png,image/jpeg,image/webp,application/pdf,audio/webm,audio/mp4,audio/ogg";
const MAX_BYTES = 10 * 1024 * 1024;

export default function CaseEvidence({ caseId, evidenceUrl, canEdit, onChanged }) {
  const [objectUrl, setObjectUrl] = useState(null);
  const [kind, setKind] = useState(null); // "image" | "pdf"
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const urlRef = useRef(null);

  const revoke = () => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  };

  const load = useCallback(async (url) => {
    revoke();
    setObjectUrl(null);
    setKind(null);
    setError("");
    if (!url) return;
    setLoading(true);
    try {
      const res = await api.get(url, { responseType: "blob" });
      const type = res.data?.type || "";
      const made = URL.createObjectURL(res.data);
      urlRef.current = made;
      setObjectUrl(made);
      // The blob's own type, which the server sets from the stored extension
      // in CaseAttachmentService.contentTypeOf.
      setKind(
        type === "application/pdf"
          ? "pdf"
          : type.startsWith("audio/")
            ? "audio"
            : "image",
      );
    } catch (err) {
      setError(apiError(err, "The attachment could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // evidenceUrl is stored as an app-relative path (/api/v1/complaints/...);
    // axios already has the /api/v1 baseURL, so strip that prefix.
    const path = evidenceUrl ? evidenceUrl.replace(/^\/api\/v1/, "") : null;
    load(path);
    return revoke;
  }, [evidenceUrl, load]);

  const pick = () => fileRef.current?.click();

  const upload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // let the same file be chosen again after an error
    if (!file) return;

    // Checked here too so the user gets an instant answer instead of waiting
    // for a 10MB round trip to be rejected. The backend still enforces it.
    if (file.size > MAX_BYTES) {
      setError("That file is larger than 10MB. Please attach a smaller file.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const { data } = await api.post("/complaints/attachments", form);
      await api.put(`/complaints/${caseId}/evidence`, { evidenceUrl: data.url });
      onChanged?.();
    } catch (err) {
      setError(apiError(err, "The attachment could not be uploaded."));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError("");
    try {
      await api.put(`/complaints/${caseId}/evidence`, { evidenceUrl: null });
      onChanged?.();
    } catch (err) {
      setError(apiError(err, "The attachment could not be removed."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-cg-dark">
          Attached Evidence / Voice Note
        </p>
        {canEdit && (
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT}
              onChange={upload}
              className="hidden"
            />
            <button
              type="button"
              className={BTN_GHOST}
              onClick={pick}
              disabled={busy}
            >
              <LuPaperclip size={14} />
              {busy ? "Uploading…" : evidenceUrl ? "Replace" : "Attach"}
            </button>
            {evidenceUrl && (
              <button
                type="button"
                aria-label="Remove attachment"
                className="grid h-8 w-8 place-items-center rounded-lg text-red-600 hover:bg-red-50"
                onClick={remove}
                disabled={busy}
              >
                <LuTrash2 size={16} />
              </button>
            )}
          </div>
        )}
      </div>

      {error && (
        <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      )}

      {loading ? (
        <div className="grid h-32 w-full max-w-xs place-items-center rounded-xl border border-dashed border-cg-lime bg-cg-lime/10 text-xs text-cg-dark/40">
          {"Loading attachment…"}
        </div>
      ) : !evidenceUrl ? (
        <div className="grid h-32 w-full max-w-xs place-items-center rounded-xl border border-dashed border-cg-lime bg-cg-lime/10 text-xs text-cg-dark/40">
          No attachment
        </div>
      ) : kind === "audio" ? (
        // The browser's own controls: play, pause, seek and a duration, which
        // is more than a custom player would earn here. Nothing autoplays --
        // this is a grievance, and it may be about somebody in the room.
        <div className="max-w-md rounded-xl border border-cg-lime/60 bg-cg-lime/10 p-3">
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-cg-dark">
            <LuMic size={14} /> Voice note from the worker
          </p>
          <audio src={objectUrl} controls preload="metadata" className="w-full" />
          <a
            href={objectUrl}
            download
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-cg-dark/70 hover:text-cg-dark"
          >
            <LuDownload size={12} /> Download recording
          </a>
        </div>
      ) : kind === "pdf" ? (
        // PDFs are offered as a link rather than embedded: an inline viewer
        // behaves differently in every browser, and a download always works.
        <a
          href={objectUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-xl border border-cg-lime/60 bg-white px-4 py-3 text-sm font-semibold text-cg-dark hover:bg-cg-lime/20"
        >
          <LuFileText size={18} /> Open attached PDF
          <LuDownload size={14} className="opacity-60" />
        </a>
      ) : objectUrl ? (
        <a href={objectUrl} target="_blank" rel="noreferrer" title="Open full size">
          <img
            src={objectUrl}
            alt="Attached evidence"
            className="max-h-56 rounded-xl border border-cg-lime/60 object-cover"
          />
        </a>
      ) : null}
    </div>
  );
}
