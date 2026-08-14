import { useEffect, useState } from "react";
import {
  LuSparkles,
  LuCopy,
  LuTriangleAlert,
  LuLanguages,
  LuCircleCheck,
} from "react-icons/lu";
import api from "../../api/client";
import { apiError } from "../../lib/apiError";
import { BTN_GHOST } from "../../lib/ui";
import InfoTip from "./InfoTip";

// AI review of one complaint / field report.
//
// Everything here is a SUGGESTION and the panel says so. It applies nothing:
// the category and priority are not set on the case, and the reply draft is
// never sent — it is text with a Copy button, so an admin edits it and sends it
// themselves. That matters here more than on the other AI panels, because the
// output is a message to a worker about their own complaint.
//
// Runs only when asked, like the anomaly and loan-scoring panels: an LLM call
// on every case open would make the page feel broken.

const PRIORITY = {
  HIGH: "bg-rose-100 text-rose-700 ring-rose-200",
  MEDIUM: "bg-amber-100 text-amber-800 ring-amber-200",
  LOW: "bg-cg-lime text-cg-green ring-cg-green/20",
};

export default function CaseReviewPanel({ caseId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ran, setRan] = useState(false);
  const [copied, setCopied] = useState(false);

  // A review belongs to one case; switching cases must clear it, or the
  // previous case's suggestions would sit under the new one.
  useEffect(() => {
    setData(null);
    setRan(false);
    setError("");
    setCopied(false);
  }, [caseId]);

  const run = async () => {
    setLoading(true);
    setError("");
    try {
      const { data: res } = await api.post(`/complaints/${caseId}/review`);
      setData(res);
    } catch (err) {
      setError(apiError(err, "Could not review this case."));
    } finally {
      setLoading(false);
      setRan(true);
    }
  };

  const copyDraft = async () => {
    try {
      await navigator.clipboard.writeText(data.replyDraft);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy — select the text and copy it manually.");
    }
  };

  return (
    <div className="rounded-xl border border-dashed border-cg-green/40 bg-cg-lime/10 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <LuSparkles size={16} className="text-cg-green" />
          <span className="text-sm font-semibold text-cg-green">
            AI report validation
          </span>
          <InfoTip text="Suggests a category and priority, checks whether this repeats a case already open, summarises it in the other language, and drafts a reply. All of it is a suggestion — nothing is applied to the case and no reply is sent." />
        </div>
        <button
          type="button"
          className={BTN_GHOST}
          onClick={run}
          disabled={loading}
        >
          {loading ? "Reviewing…" : ran ? "Review again" : "Review this case"}
        </button>
      </div>

      {error && (
        <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </p>
      )}

      {!ran && !loading && !error && (
        <p className="mt-2 text-xs text-cg-dark/60">
          {
            "Have the AI triage this case, check it against other open cases, and draft a reply."
          }
        </p>
      )}

      {loading && (
        <p className="mt-2 text-xs text-cg-dark/60">
          {"Reading the case… this uses a language model and can take a few seconds."}
        </p>
      )}

      {data && data.available === false && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
          {data.message}
        </p>
      )}

      {data && data.available && (
        <div className="mt-3 space-y-3">
          {data.looksLikeSpam && (
            <p className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
              <LuTriangleAlert size={14} />
              This looks like an empty or test submission. Worth checking before
              spending time on it.
            </p>
          )}

          {/* Triage */}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ring-1 ${
                PRIORITY[data.suggestedPriority] || PRIORITY.MEDIUM
              }`}
            >
              {data.suggestedPriority}
            </span>
            {data.suggestedCategory && (
              <span className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-semibold text-cg-dark ring-1 ring-cg-lime">
                {data.suggestedCategory}
              </span>
            )}
            <span className="text-xs text-cg-dark/50">suggested — not applied</span>
          </div>
          {data.priorityReason && (
            <p className="text-xs text-cg-dark/70">{data.priorityReason}</p>
          )}

          {/* Duplicate */}
          {data.duplicateOf ? (
            <div className="rounded-lg bg-white p-3 ring-1 ring-amber-200">
              <p className="text-xs font-semibold text-amber-800">
                Possible duplicate of case #{data.duplicateOf}
                {data.duplicateConfidence
                  ? ` · ${data.duplicateConfidence} confidence`
                  : ""}
              </p>
              <p className="mt-0.5 text-xs text-cg-dark/70">
                {data.duplicateOfTitle}
              </p>
              {data.duplicateReason && (
                <p className="mt-1 text-xs text-cg-dark/60">
                  {data.duplicateReason}
                </p>
              )}
            </div>
          ) : (
            <p className="flex items-center gap-1.5 text-xs text-cg-dark/60">
              <LuCircleCheck size={13} className="text-cg-green" />
              No duplicate found among {data.candidatesConsidered} open case
              {data.candidatesConsidered === 1 ? "" : "s"} checked.
            </p>
          )}

          {/* Translation */}
          {data.summaryOtherLanguage && (
            <div>
              <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-cg-dark">
                <LuLanguages size={13} />
                Summary in {data.language === "bn" ? "English" : "Bangla"}
              </p>
              <p className="rounded-lg bg-white px-3 py-2 text-sm leading-relaxed text-cg-dark/80 ring-1 ring-cg-lime/60">
                {data.summaryOtherLanguage}
              </p>
            </div>
          )}

          {/* Reply draft */}
          {data.replyDraft && (
            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-cg-dark">
                  Draft reply — edit before sending
                </p>
                <button
                  type="button"
                  onClick={copyDraft}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-cg-green hover:bg-white"
                >
                  <LuCopy size={12} /> {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="whitespace-pre-line rounded-lg bg-white px-3 py-2 text-sm leading-relaxed text-cg-dark/80 ring-1 ring-cg-lime/60">
                {data.replyDraft}
              </p>
            </div>
          )}

          <p className="border-t border-cg-green/10 pt-2 text-[11px] text-cg-dark/40">
            AI-generated{data.provider ? ` · ${data.provider}` : ""}. Nothing has
            been applied to this case and no reply has been sent.
          </p>
        </div>
      )}
    </div>
  );
}
