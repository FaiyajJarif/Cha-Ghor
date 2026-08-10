import { useEffect, useRef, useState } from "react";
import { LuMic, LuSquare, LuPlay, LuPause, LuTrash2, LuCloudOff } from "react-icons/lu";

// কণ্ঠে বলুন — record the complaint instead of typing it.
//
// WHY THIS EXISTS
//   The picture tiles removed the need to READ. They did not remove the need to
//   WRITE: the optional detail box is still a phone keyboard, and a worker who
//   cannot spell "সুপারভাইজার" is not going to describe what happened in it.
//   Speaking is the one channel that costs them nothing.
//
// WHAT THIS IS NOT
//   There is no speech recognition here and no model of any kind. The audio is
//   stored as a file and the admin listens to it. Nothing transcribes it, so
//   nothing can mis-transcribe a grievance -- which, on a complaint about a
//   named person, is a failure worth avoiding entirely.
//
//   The earlier voice work on the loan screen used the Web Speech API and had
//   to be disabled in Brave, which strips the Google speech backend. MediaRecorder
//   is a different API with no such dependency: it is local, and it works in
//   Chrome, Brave, Firefox and Safari 14.3+.
//
// CONTAINER VARIES BY BROWSER. Chrome and Brave give audio/webm, Firefox
// audio/ogg, Safari audio/mp4. All three are on the server's allow-list, with a
// magic-byte check each -- see CaseAttachmentService.
//
// A HARD TWO-MINUTE CAP. Not for the 10MB limit (Opus would take about an hour
// to reach it) but because somebody has to sit and listen to every one of these,
// and a channel that produces twenty-minute recordings gets ignored.
const MAX_SECONDS = 120;

// Ask for what the browser will actually produce. An unsupported mimeType
// throws in Chrome, so each is tested before it is offered.
function pickMime() {
  if (typeof MediaRecorder === "undefined") return null;
  const options = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
  for (const m of options) {
    if (MediaRecorder.isTypeSupported?.(m)) return m;
  }
  return ""; // let the browser choose — Safari reports support for nothing
}

const two = (n) => String(n).padStart(2, "0");
const BN = "০১২৩৪৫৬৭৮৯";
const bn = (s) => String(s).replace(/[0-9]/g, (d) => BN[+d]);
const clock = (s) => bn(`${two(Math.floor(s / 60))}:${two(s % 60)}`);

export default function VoiceNote({ blob, onChange, disabled }) {
  const [supported, setSupported] = useState(true);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");
  const [online, setOnline] = useState(navigator.onLine);

  const recRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const tickRef = useRef(null);
  const urlRef = useRef(null);
  const audioRef = useRef(null);

  useEffect(() => {
    setSupported(typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia);
  }, []);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // One object URL per blob, revoked before the next one and on unmount.
  // Without this the recording stays in memory for the life of the tab.
  useEffect(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    if (blob) {
      urlRef.current = URL.createObjectURL(blob);
    }
    setPlaying(false);
    return () => {
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    };
  }, [blob]);

  // The microphone must be released. A live MediaStream keeps the browser's
  // recording indicator on, which on a worker's own phone looks exactly like
  // being listened to.
  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  useEffect(() => () => {
    clearInterval(tickRef.current);
    stopStream();
  }, []);

  const start = async () => {
    setError("");
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      // Name the two cases apart. "Permission denied" and "no microphone" need
      // different things from the person holding the phone.
      setError(
        e?.name === "NotAllowedError"
          ? "মাইক্রোফোন ব্যবহারের অনুমতি দেওয়া হয়নি। ব্রাউজারের অনুমতি চালু করুন।"
          : "মাইক্রোফোন পাওয়া যায়নি।",
      );
      return;
    }
    streamRef.current = stream;
    const mime = pickMime();
    let rec;
    try {
      rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    } catch {
      rec = new MediaRecorder(stream);
    }
    chunksRef.current = [];
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      clearInterval(tickRef.current);
      stopStream();
      setRecording(false);
      const made = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
      // A blob of a few bytes is a tap, not a recording. Filing it would send
      // the office silence and waste the one channel this worker has.
      if (made.size < 1024) {
        setError("রেকর্ডিং খুব ছোট হয়েছে। আবার চেষ্টা করুন।");
        onChange(null);
        return;
      }
      onChange(made);
    };
    recRef.current = rec;
    rec.start();
    setRecording(true);
    setSeconds(0);
    tickRef.current = setInterval(() => {
      setSeconds((s) => {
        if (s + 1 >= MAX_SECONDS) {
          try {
            recRef.current?.stop();
          } catch {
            /* already stopped */
          }
          return MAX_SECONDS;
        }
        return s + 1;
      });
    }, 1000);
  };

  const stop = () => {
    try {
      recRef.current?.stop();
    } catch {
      /* already stopped */
    }
  };

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      a.play().catch(() => setError("রেকর্ডিং চালানো যায়নি।"));
    } else {
      a.pause();
    }
  };

  if (!supported) {
    // Say why, rather than showing a button that does nothing. Old Android
    // browsers and iOS before 14.3 have no MediaRecorder at all.
    return (
      <p className="mt-3 rounded-xl bg-[#F4FFE9] px-3 py-2 text-[11px] text-[#14493B]/60">
        এই ফোনের ব্রাউজারে কণ্ঠ রেকর্ড করা যায় না। লিখে জানাতে পারেন।
      </p>
    );
  }

  return (
    <div className="mt-3">
      {!blob && !recording && (
        <button
          type="button"
          onClick={start}
          disabled={disabled || !online}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#14493B] px-6 py-4 text-base font-extrabold text-white transition hover:brightness-110 disabled:opacity-45"
        >
          <LuMic size={20} /> কণ্ঠে বলুন
        </button>
      )}

      {/* Recording. Big red stop, a running clock, and how long is left --
          a countdown that ends without warning would lose the last sentence. */}
      {recording && (
        <button
          type="button"
          onClick={stop}
          className="inline-flex w-full items-center justify-center gap-3 rounded-2xl bg-rose-700 px-6 py-4 text-base font-extrabold text-white"
        >
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-70" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-white" />
          </span>
          <LuSquare size={16} /> থামান — {clock(seconds)}
          <span className="text-xs font-bold opacity-70">
            / {clock(MAX_SECONDS)}
          </span>
        </button>
      )}

      {/* Recorded. They hear it before it goes, and can throw it away. */}
      {blob && !recording && (
        <div className="flex items-center gap-2 rounded-2xl bg-white p-2 ring-1 ring-[#13483B]/15">
          <button
            type="button"
            onClick={toggle}
            aria-label={playing ? "থামান" : "শুনুন"}
            className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#14493B] text-white"
          >
            {playing ? <LuPause size={20} /> : <LuPlay size={20} />}
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-extrabold text-[#14493B]">
              আপনার রেকর্ডিং — {clock(seconds)}
            </p>
            <p className="text-[11px] text-[#14493B]/55">
              পাঠানোর আগে একবার শুনে নিন।
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setSeconds(0);
            }}
            aria-label="রেকর্ডিং মুছুন"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-rose-700 hover:bg-rose-50"
          >
            <LuTrash2 size={18} />
          </button>
          <audio
            ref={audioRef}
            src={urlRef.current || undefined}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            className="hidden"
          />
        </div>
      )}

      {/* Offline. The rest of this screen queues and sends itself later; a
          recording cannot, because the outbox stores JSON and the upload is
          multipart. Saying so is better than a button that fails on tap. */}
      {!online && !blob && (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-[#14493B]/55">
          <LuCloudOff size={12} /> নেটওয়ার্ক এলে কণ্ঠে বলা যাবে। এখন লিখে পাঠাতে পারেন।
        </p>
      )}

      {error && (
        <p className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">
          {error}
        </p>
      )}
    </div>
  );
}
