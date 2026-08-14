/*
 * Bangla voice in and out, for workers who read slowly or not at all.
 *
 * WHY THIS MATTERS MORE THAN MOST FEATURES HERE
 *   Literacy on a Sylhet tea estate is not universal. A payslip nobody can read
 *   is not a payslip, and a loan screen nobody can read is worse — it is a
 *   consent form somebody signs blind. Speaking the numbers is the single most
 *   inclusive thing this console can do.
 *
 * THREE LIMITS THAT ARE NOT MINE TO FIX, so everything below degrades:
 *
 *   1. SpeechRecognition REQUIRES A SECURE CONTEXT. It works on localhost and
 *      over https, and is blocked on http://192.168.x.x — which is exactly how
 *      a phone reaches a dev server on the LAN. So voice INPUT is the first
 *      thing to disappear in the field, and the buttons must always work.
 *
 *   2. SpeechRecognition does not exist in iOS Safari or Firefox at all.
 *
 *   3. speechSynthesis can only speak Bangla if a Bangla voice is installed.
 *      Android Chrome usually has one; desktops frequently do not. With no bn
 *      voice, speaking Bangla text through an English voice produces noise, so
 *      we check for one and stay silent rather than emit gibberish.
 *
 * Nothing in this file is required for the console to work. It is an extra
 * channel over controls that already function.
 */

const BN = "bn-BD";

// Does the browser have a voice that can actually pronounce Bangla?
//
// Checked rather than assumed: an English voice reading Bangla characters is
// not a degraded experience, it is meaningless sound, and a worker hearing it
// would reasonably conclude the app is broken.
function banglaVoice() {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices() || [];
  return (
    voices.find((v) => (v.lang || "").toLowerCase().startsWith("bn")) || null
  );
}

export function voiceSupport() {
  const canSpeakApi =
    typeof window !== "undefined" && "speechSynthesis" in window;
  const Recognition =
    typeof window !== "undefined" &&
    (window.SpeechRecognition || window.webkitSpeechRecognition);
  // `isSecureContext` is true on https AND on localhost, which is exactly the
  // rule the recognition API applies.
  const secure = typeof window !== "undefined" && window.isSecureContext;

  return {
    canSpeak: canSpeakApi && !!banglaVoice(),
    // Reported separately: the API can exist while no Bangla voice does, and
    // the two failures need different messages.
    speechApi: canSpeakApi,
    hasBanglaVoice: !!banglaVoice(),
    canListen: !!Recognition && secure,
    listenApi: !!Recognition,
    secure,
  };
}

// Voices load asynchronously in Chrome — getVoices() is empty on first call.
// Anything that gates UI on canSpeak must wait for this or it will decide
// "no Bangla voice" on a machine that has one.
export function onVoicesReady(cb) {
  if (typeof window === "undefined" || !window.speechSynthesis) return () => {};
  if ((window.speechSynthesis.getVoices() || []).length > 0) {
    cb();
    return () => {};
  }
  const handler = () => cb();
  window.speechSynthesis.addEventListener("voiceschanged", handler);
  return () =>
    window.speechSynthesis.removeEventListener("voiceschanged", handler);
}

// Say something in Bangla. Resolves when finished, or immediately when there is
// no voice to say it with.
export function speak(text) {
  return new Promise((resolve) => {
    const v = banglaVoice();
    if (!text || !v || typeof window === "undefined") {
      resolve(false);
      return;
    }
    try {
      // Cancel anything queued: two overlapping Bangla sentences are worse
      // than one, and a worker tapping quickly would otherwise stack them.
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.voice = v;
      u.lang = BN;
      // Slightly slow. This is being listened to once, outdoors, possibly by
      // someone anxious about money.
      u.rate = 0.92;
      u.onend = () => resolve(true);
      u.onerror = () => resolve(false);
      window.speechSynthesis.speak(u);
    } catch {
      resolve(false);
    }
  });
}

export function stopSpeaking() {
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* nothing to stop */
  }
}

// Listen for one short utterance. Returns a stop() function.
//
// Single-shot on purpose: continuous recognition in a tea field picks up
// everything, and this is a trigger word, not dictation.
export function listenOnce({ onResult, onEnd, onError } = {}) {
  const Recognition =
    typeof window !== "undefined" &&
    (window.SpeechRecognition || window.webkitSpeechRecognition);
  if (!Recognition) {
    onError?.("unsupported");
    return () => {};
  }
  let rec;
  try {
    rec = new Recognition();
  } catch {
    onError?.("unsupported");
    return () => {};
  }
  rec.lang = BN;
  rec.continuous = false;
  rec.interimResults = false;
  // Several alternatives, because a single Bangla word in a noisy field is
  // exactly where the top guess is often wrong.
  rec.maxAlternatives = 4;

  // A session can end having produced NOTHING and reported NO ERROR. That is
  // what Brave does: it ships the API but removes the Google speech backend
  // (Chromium uploads microphone audio to Google to transcribe it, which Brave
  // strips out on privacy grounds). start() succeeds, the service is not there,
  // and onend fires immediately.
  //
  // Without tracking this the caller sees a mic that "opens and closes" and has
  // nothing to show the user — which is exactly what happened.
  let gotResult = false;
  let gotError = false;

  rec.onresult = (e) => {
    gotResult = true;
    const heard = [];
    for (const result of e.results) {
      for (let i = 0; i < result.length; i++) {
        heard.push((result[i].transcript || "").trim().toLowerCase());
      }
    }
    onResult?.(heard);
  };
  rec.onerror = (e) => {
    gotError = true;
    onError?.(e?.error || "error");
  };
  rec.onend = () => {
    if (!gotResult && !gotError) {
      // Silence, or a browser that has no speech service. They are
      // indistinguishable from here, so say both and let the user decide.
      onError?.("no-service");
    }
    onEnd?.();
  };

  try {
    rec.start();
  } catch {
    onError?.("start-failed");
  }
  return () => {
    try {
      rec.stop();
    } catch {
      /* already stopped */
    }
  };
}

// Did the worker say "loan"?
//
// Matched generously across Bangla, common transliterations and English,
// because recognition of one short word is unreliable and the cost of a false
// NEGATIVE (nothing happens, they tap the button) is far lower than the cost of
// making somebody repeat themselves four times.
//
// The cost of a false POSITIVE is only that a dialog opens — nothing is
// submitted by speech alone.
const LOAN_WORDS = [
  "ঋণ", "রিন", "রিণ", "ঝিন",
  "rin", "reen", "rrin", "loan", "lone", "ln",
];

export function heardLoan(alternatives = []) {
  return alternatives.some((t) =>
    LOAN_WORDS.some((w) => t === w || t.includes(w)),
  );
}

// And "yes", for confirming out loud.
const YES_WORDS = ["হ্যাঁ", "হা", "হয়", "জি", "ঠিক আছে", "ha", "hae", "ji", "yes", "ok"];

export function heardYes(alternatives = []) {
  return alternatives.some((t) => YES_WORDS.some((w) => t === w || t.includes(w)));
}

// Brave ships webkitSpeechRecognition and removes the service behind it.
// Detected so the message can name the browser instead of blaming the mic.
export function isBrave() {
  try {
    return !!navigator.brave;
  } catch {
    return false;
  }
}

// A readable Bangla sentence for each way this fails, plus whether the mic
// button should give up and hide.
//
// The distinction matters: "speak louder" and "this browser will never do
// this" are different problems, and telling someone to repeat themselves into
// a browser that cannot listen is the worst of the options.
export function voiceErrorMessage(code) {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return {
        text: "মাইক্রোফোন ব্যবহারের অনুমতি দেওয়া হয়নি। ব্রাউজারের ঠিকানা বারের পাশে অনুমতি দিন।",
        permanent: false,
      };
    case "no-speech":
      return { text: "কিছু শুনতে পাইনি। আবার চেষ্টা করুন।", permanent: false };
    case "audio-capture":
      return { text: "মাইক্রোফোন পাওয়া যায়নি।", permanent: true };
    case "network":
    case "no-service":
      return {
        text: isBrave()
          ? "এই ব্রাউজারে (Brave) কথা শোনার সুবিধা বন্ধ করা আছে। Chrome-এ চেষ্টা করুন, অথবা নিচের বোতামে চাপ দিন।"
          : "এই ব্রাউজারে কথা শোনার সুবিধা কাজ করছে না। নিচের বোতামে চাপ দিন।",
        permanent: true,
      };
    case "unsupported":
      return {
        text: "এই ব্রাউজারে কথা বলে কাজ করা যায় না। নিচের বোতামে চাপ দিন।",
        permanent: true,
      };
    default:
      return { text: "কথা শোনা যায়নি। নিচের বোতামে চাপ দিন।", permanent: false };
  }
}

export default {
  voiceSupport,
  onVoicesReady,
  speak,
  stopSpeaking,
  listenOnce,
  heardLoan,
  heardYes,
  isBrave,
  voiceErrorMessage,
};
