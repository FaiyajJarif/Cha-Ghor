import { useEffect, useState } from "react";
import { speak, stopSpeaking, voiceSupport, onVoicesReady } from "../../lib/voice";
import VoiceNote from "./VoiceNote";
import {
  LuBanknote,
  LuTriangleAlert,
  LuHeartPulse,
  LuWrench,
  LuUserX,
  LuCircleHelp,
  LuVolume2,
  LuSend,
  LuX,
  LuCircleCheck,
} from "react-icons/lu";

// এক চাপে অভিযোগ — file a complaint in two taps, reading nothing.
//
// WHO THIS IS FOR AND WHY IT LOOKS LIKE THIS
//   Literacy on a Sylhet estate is uneven. That is not the same as being unable
//   to reason: a plucker knows precisely what is wrong with their pay or their
//   tools. What they cannot easily do is read six form labels and type two
//   paragraphs on a phone keyboard, outdoors, at the end of a shift.
//
//   So this removes reading and typing rather than simplifying words:
//     * a PICTURE and one short Bangla word per problem
//     * tapping a tile SPEAKS it aloud, so somebody who cannot read the word
//       still knows what they chose before confirming
//     * the complaint text is pre-written; details are optional
//     * two taps from arriving to filed
//
//   The full form stays underneath for anyone who wants it. This is a shortcut,
//   not a replacement — a worker with something complicated to say must not be
//   forced through six tiles that do not fit.
//
// TWO DIFFERENT VOICES ON THIS SCREEN, AND THEY ARE NOT THE SAME FEATURE:
//   * the app SPEAKING (speechSynthesis, below) confirms what the worker just
//     tapped -- output, so they know what they chose without reading it;
//   * the worker RECORDING (VoiceNote) is input, their own account of what
//     happened, which the admin plays back.
// Removing either does not substitute for the other.
//
// Speech here is safe in a way it was not on the notice board: it only ever
// happens because the worker touched something and is waiting to be told what
// it was. Nothing announces itself.
//
// PRIORITY IS SET BY THE CATEGORY, not asked. "How urgent is it, on a scale?"
// is a form question, not a human one. Injury and safety file as URGENT because
// they are; the rest default to normal and the office can re-rank.

const TILES = [
  {
    key: "wage",
    icon: LuBanknote,
    label: "বেতন কম",
    spoken: "বেতন কম পেয়েছেন?",
    category: "বেতন সমস্যা",
    priority: "HIGH",
    title: "বেতন নিয়ে সমস্যা",
    body: "আমি আমার বেতন নিয়ে সমস্যায় আছি। অফিস একবার দেখে জানালে ভালো হয়।",
    tone: "bg-[#14493B]",
  },
  {
    key: "safety",
    icon: LuTriangleAlert,
    label: "বিপদ",
    spoken: "কাজের জায়গায় বিপদ আছে?",
    category: "নিরাপত্তা",
    priority: "URGENT",
    title: "নিরাপত্তার ঝুঁকি",
    body: "কাজের জায়গায় নিরাপত্তার ঝুঁকি আছে। দ্রুত দেখা দরকার।",
    tone: "bg-rose-700",
  },
  {
    key: "health",
    icon: LuHeartPulse,
    label: "অসুস্থ",
    spoken: "আপনি অসুস্থ বা আহত হয়েছেন?",
    category: "নিরাপত্তা",
    priority: "URGENT",
    title: "অসুস্থ বা আহত",
    body: "আমি কাজ করতে গিয়ে অসুস্থ বা আহত হয়েছি।",
    tone: "bg-rose-700",
  },
  {
    key: "tool",
    icon: LuWrench,
    label: "সরঞ্জাম নষ্ট",
    spoken: "সরঞ্জাম নষ্ট হয়ে গেছে?",
    category: "সরঞ্জাম",
    priority: "MEDIUM",
    title: "সরঞ্জাম নষ্ট",
    body: "কাজের সরঞ্জাম নষ্ট হয়ে গেছে বা কাজ করছে না।",
    tone: "bg-[#14493B]",
  },
  {
    key: "behaviour",
    icon: LuUserX,
    label: "খারাপ ব্যবহার",
    spoken: "কেউ খারাপ ব্যবহার করেছে?",
    category: "আচরণ",
    priority: "HIGH",
    title: "খারাপ ব্যবহার",
    body: "কাজের জায়গায় কেউ আমার সঙ্গে খারাপ ব্যবহার করেছে।",
    // Pre-ticked confidential: a complaint about how somebody treated you is
    // the one nobody files under their own name.
    confidential: true,
    tone: "bg-amber-700",
  },
  {
    key: "other",
    icon: LuCircleHelp,
    label: "অন্য কিছু",
    spoken: "অন্য কোনো সমস্যা?",
    category: "অন্যান্য",
    priority: "MEDIUM",
    title: "একটি সমস্যা জানাতে চাই",
    body: "আমার একটি সমস্যা আছে, অফিসকে জানাতে চাই।",
    tone: "bg-[#14493B]",
  },
];

export default function QuickReport({ onFile, busy }) {
  const [picked, setPicked] = useState(null);
  const [extra, setExtra] = useState("");
  const [audio, setAudio] = useState(null);
  const [canSpeak, setCanSpeak] = useState(false);
  const [sent, setSent] = useState(false);

  // Voices load asynchronously; asking on first render returns an empty list.
  useEffect(() => onVoicesReady(() => setCanSpeak(voiceSupport().canSpeak)), []);
  // Leaving the page mid-sentence must stop it, or the phone keeps talking.
  useEffect(() => () => stopSpeaking(), []);

  const pick = (t) => {
    setPicked(t);
    setExtra("");
    setAudio(null);
    setSent(false);
    // Say it back. This is the whole point of the tile — confirmation for
    // somebody who cannot read the word under the picture.
    if (canSpeak) speak(`${t.spoken} ঠিক থাকলে সবুজ বোতামে চাপ দিন।`);
  };

  const send = async () => {
    if (!picked) return;
    const ok = await onFile({
      category: picked.category,
      priority: picked.priority,
      title: picked.title,
      body: extra.trim() ? `${picked.body}\n\n${extra.trim()}` : picked.body,
      confidential: !!picked.confidential,
      audio,
    });
    if (ok) {
      setSent(true);
      if (canSpeak) speak("আপনার অভিযোগ অফিসে পৌঁছেছে।");
      setPicked(null);
      setExtra("");
      setAudio(null);
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow ring-1 ring-[#13483B]/10">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-[#C0F28B] px-5 py-3">
        <h2 className="text-lg font-extrabold text-[#14493B]">
          এক চাপে অভিযোগ
        </h2>
        {canSpeak && (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#14493B]/60">
            <LuVolume2 size={13} /> চাপ দিলে শুনতে পাবেন
          </span>
        )}
      </div>

      <div className="p-5">
        {sent && (
          <p className="mb-4 flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-900 ring-1 ring-emerald-200">
            <LuCircleCheck size={16} /> আপনার অভিযোগ অফিসে পৌঁছেছে।
          </p>
        )}

        <p className="mb-3 text-sm text-[#14493B]/65">
          ছবিতে চাপ দিন। লেখার দরকার নেই।
        </p>

        {/* Large targets. These are tapped with a thumb, often by someone
            standing up, sometimes with wet hands. */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {TILES.map((t) => {
            const active = picked?.key === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => pick(t)}
                aria-pressed={active}
                className={`flex flex-col items-center justify-center gap-2 rounded-2xl px-3 py-6 text-center transition ${
                  active
                    ? `${t.tone} text-white ring-4 ring-[#14493B]/25`
                    : "bg-[#F4FFE9] text-[#14493B] ring-1 ring-[#13483B]/15 hover:bg-[#E8F8D8]"
                }`}
              >
                <t.icon size={34} strokeWidth={1.7} />
                <span className="text-base font-extrabold leading-tight">{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* The confirm step. One more tap, and it is a big one. */}
        {picked && (
          <div className="mt-5 rounded-2xl bg-[#F4FFE9] p-4 ring-1 ring-[#13483B]/15">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-extrabold text-[#14493B]">
                  {picked.spoken}
                </p>
                {picked.confidential && (
                  <p className="mt-1 text-xs text-[#14493B]/65">
                    এটি গোপনীয়ভাবে যাবে — কে জানিয়েছে অফিস দেখতে পাবে না।
                  </p>
                )}
              </div>
              <div className="flex shrink-0 gap-1">
                {/* Conditional render, not the `hidden` attribute: Tailwind's
                    `grid` sets display:grid, which beats the UA stylesheet's
                    [hidden]{display:none} and leaves the button visible. */}
                {canSpeak && (
                  <button
                    type="button"
                    onClick={() => speak(picked.spoken)}
                    aria-label="আবার শুনুন"
                    className="grid h-9 w-9 place-items-center rounded-full bg-white text-[#14493B] ring-1 ring-[#13483B]/20"
                  >
                    <LuVolume2 size={16} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    stopSpeaking();
                    setPicked(null);
                  }}
                  aria-label="বাতিল"
                  className="grid h-9 w-9 place-items-center rounded-full bg-white text-[#14493B] ring-1 ring-[#13483B]/20"
                >
                  <LuX size={16} />
                </button>
              </div>
            </div>

            {/* Optional, and clearly labelled as optional. A required text box
                would put the barrier straight back. */}
            {/* Speaking comes FIRST, above the keyboard. For the person this
                shortcut exists for, the text box is the fallback.
                
                EXCEPT ON A CONFIDENTIAL COMPLAINT. A recording of your voice
                identifies you as surely as your name, which is the very thing
                confidential mode strips. Rather than offer it with a warning,
                it is not offered — and MeWorkerService refuses one anyway. */}
            {picked.confidential ? (
              <p className="mt-3 rounded-xl bg-white px-3 py-2 text-[11px] text-[#14493B]/65 ring-1 ring-[#13483B]/10">
                গোপনীয় অভিযোগে কণ্ঠ রেকর্ড করা যায় না — কণ্ঠ শুনে আপনাকে
                চেনা যেত।
              </p>
            ) : (
              <VoiceNote blob={audio} onChange={setAudio} disabled={busy} />
            )}

            <textarea
              rows={2}
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              placeholder="চাইলে লিখেও জানাতে পারেন — না লিখলেও চলবে"
              className="mt-3 w-full resize-y rounded-xl border border-[#13483B]/25 bg-white px-4 py-2.5 text-sm text-[#14493B] outline-none focus:border-[#14493B]"
            />

            <button
              type="button"
              onClick={send}
              disabled={busy}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-6 py-4 text-lg font-extrabold text-white transition hover:brightness-110 disabled:opacity-50"
            >
              <LuSend size={20} /> {busy ? "পাঠানো হচ্ছে…" : "পাঠিয়ে দিন"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
