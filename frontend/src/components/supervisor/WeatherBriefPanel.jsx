import { useState } from "react";
import { LuSparkles, LuInfo, LuRefreshCw } from "react-icons/lu";
import api from "../../api/client";
import { apiError } from "../../lib/apiError";

// A written note over today's weather.
//
// THIS IS THE ONLY PART OF THIS PAGE A MODEL TOUCHES, and it is worth being
// precise about why it is safe to let it.
//
//   * It DESCRIBES, it does not DECIDE. The harvest recommendation above is
//     computed from fixed thresholds and prints the measurement behind every
//     line. The prompt forbids the model from issuing its own verdict, because
//     two answers disagreeing on one screen is worse than one answer.
//   * It is handed only facts the server already holds — the stored reading,
//     the forecast, and the measured rain impact when there is enough data to
//     have one. It is told never to invent a figure.
//   * It is OPT-IN. Fetching it on page load would spend a model call every
//     time anyone glanced at the weather.
//   * If it fails, nothing else on the page changes. The numbers, the advice
//     and the measured rain figure are all computed without it.

const CARD_STROKE = "ring-1 ring-[#13483B59]";

// Written in whichever language the supervisor actually reads.
//
// The figures on this page are legible either way — 28°C is 28°C — but this
// panel is the one part that is prose, and prose in a language someone reads
// slowly is prose they skip. The choice is remembered, because a supervisor who
// wants Bangla wants it every day, not once.
const LANG_KEY = "chaghor.weatherBriefLang";

const T = {
  en: {
    title: "Today in a sentence",
    write: "Write today's briefing",
    writing: "Writing…",
    rewrite: "Rewrite",
    noReading:
      "There is no reading to write about yet. Press Refresh at the top of the page.",
    by: (p) => `Written by ${p} from the readings on this page.`,
    foot: "A description, not a decision. The harvest recommendation below is worked out from fixed rules and is the one to act on — this only puts the same readings into words, and cannot introduce a number that is not already on this page.",
    fail: "Could not write the briefing.",
  },
  bn: {
    title: "আজকের আবহাওয়া, সংক্ষেপে",
    write: "আজকের সারাংশ লিখুন",
    writing: "লেখা হচ্ছে…",
    rewrite: "আবার লিখুন",
    noReading:
      "এখনো লেখার মতো কোনো তথ্য নেই। পাতার উপরে Refresh চাপুন।",
    by: (p) => `এই পাতার তথ্য থেকে ${p} লিখেছে।`,
    foot: "এটি শুধু বর্ণনা, সিদ্ধান্ত নয়। নিচের হারভেস্ট পরামর্শ নির্দিষ্ট নিয়ম থেকে তৈরি — সেটিই মেনে চলুন। এখানে শুধু একই তথ্য কথায় লেখা হয়েছে, নতুন কোনো সংখ্যা যোগ করা হয়নি।",
    fail: "সারাংশ লেখা যায়নি।",
  },
};

export default function WeatherBriefPanel({ available }) {
  const [brief, setBrief] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lang, setLang] = useState(() => {
    try {
      return localStorage.getItem(LANG_KEY) === "bn" ? "bn" : "en";
    } catch {
      return "en";
    }
  });

  const t = T[lang];

  const load = async (which = lang) => {
    setBusy(true);
    setError("");
    try {
      const { data } = await api.get("/weather/brief", { params: { lang: which } });
      setBrief(data);
      // The server reports its own trouble in `error` rather than failing the
      // request, so a briefing that could not be written still leaves the page
      // usable and says why — in the language that was asked for.
      if (!data?.summary && data?.error) setError(data.error);
    } catch (err) {
      setError(apiError(err, t.fail));
    } finally {
      setBusy(false);
    }
  };

  // Switching language re-asks the model rather than translating what is on
  // screen. Cheaper to be correct than to be clever, and a stale English
  // paragraph sitting under a Bangla heading would look broken.
  const switchTo = (next) => {
    if (next === lang) return;
    setLang(next);
    try {
      localStorage.setItem(LANG_KEY, next);
    } catch {
      // Private mode. The choice just will not persist.
    }
    if (brief?.summary) load(next);
  };

  return (
    <div className={`overflow-hidden rounded-2xl bg-white shadow ${CARD_STROKE}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 bg-[#C0F28B] px-5 py-3">
        <div className="flex items-center gap-2 font-bold text-cg-ink">
          <LuSparkles size={16} /> {t.title}
        </div>
        <div className="flex items-center gap-2">
          {/* Language first, because it changes everything to its right. */}
          <div className="inline-flex overflow-hidden rounded-lg ring-1 ring-[#13483B]/25">
            {[
              ["en", "EN"],
              ["bn", "বাংলা"],
            ].map(([code, label]) => (
              <button
                key={code}
                type="button"
                onClick={() => switchTo(code)}
                disabled={busy}
                aria-pressed={lang === code}
                className={`px-2.5 py-1 text-xs font-bold transition disabled:opacity-40 ${
                  lang === code
                    ? "bg-[#14493B] text-white"
                    : "bg-white text-cg-ink/70 hover:bg-cg-lime/40"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {brief?.summary && (
            <button
              type="button"
              onClick={() => load()}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold text-cg-ink/70 transition hover:bg-white/60 disabled:opacity-40"
            >
              <LuRefreshCw size={13} /> {t.rewrite}
            </button>
          )}
        </div>
      </div>

      <div className="space-y-3 p-5">
        {error && (
          <p className="rounded-lg bg-amber-50 px-4 py-2.5 text-sm text-amber-900 ring-1 ring-amber-200">
            {error}
          </p>
        )}

        {!available ? (
          <p className="text-sm text-cg-ink/50">{t.noReading}</p>
        ) : brief?.summary ? (
          <>
            {/* lang on the element so a screen reader switches voice, and so
                the browser picks a font that renders Bangla conjuncts properly
                rather than falling back to boxes. */}
            <p
              lang={lang}
              className="text-sm leading-relaxed text-cg-ink"
            >
              {brief.summary}
            </p>
            {brief.provider && (
              <p className="text-[11px] text-cg-ink/40">{t.by(brief.provider)}</p>
            )}
          </>
        ) : (
          <button
            type="button"
            onClick={() => load()}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl bg-[#14493B] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
          >
            <LuSparkles size={14} />
            {busy ? t.writing : t.write}
          </button>
        )}

        <p lang={lang} className="flex items-start gap-2 text-[11px] text-cg-ink/45">
          <LuInfo size={13} className="mt-0.5 shrink-0" />
          {t.foot}
        </p>
      </div>
    </div>
  );
}
