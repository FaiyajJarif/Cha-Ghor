import { useCallback, useEffect, useRef, useState } from "react";
import {
  LuSend,
  LuShieldCheck,
  LuCircleCheck,
  LuClock,
  LuTriangleAlert,
  LuInfo,
  LuCloudOff,
} from "react-icons/lu";
import api from "../../api/client";
import { apiError } from "../../lib/apiError";
import { queueOrSend } from "../../lib/outbox";
import { newUuid } from "../../lib/uuid";
import { WS_BASE } from "../../lib/config";
import { closeSocket } from "../../lib/ws";
import QuickReport from "../../components/worker/QuickReport";
import VoiceNote from "../../components/worker/VoiceNote";

// প্রশাসককে রিপোর্ট করুন — the worker's grievance channel.
//
// THIS IS THE SCREEN WITH THE LEAST DATA AND THE MOST AT STAKE.
// A worker raising a complaint about their own supervisor is the person this
// exists for. If it is slow, or unclear about what happens next, or leaks who
// filed it once, nobody on the estate uses it again — and unlike a wrong number
// on a payslip, that failure is invisible from the office.
//
// So three things are deliberate:
//
//   1. CONFIDENTIAL IS EXPLAINED, NOT JUST OFFERED. The toggle says what it
//      actually does: the office sees the complaint, not who filed it. It does
//      NOT claim the identity is unrecorded, because it is — see
//      FieldCase.confidential. Promising more than that would be the one lie
//      that ends the channel's usefulness permanently.
//   2. IT WORKS OFFLINE. A complaint composed in a field with no signal queues
//      and posts itself, with a client_uuid so a replay cannot file it twice.
//   3. STATUS IS VISIBLE. "Did anyone read it" is the only question a worker
//      has after filing, and silence is what makes people stop bothering.

const CARD = "rounded-2xl bg-white shadow ring-1 ring-[#13483B]/10";

const BN = "০১২৩৪৫৬৭৮৯";
const bn = (s) => String(s).replace(/[0-9]/g, (d) => BN[+d]);

const MONTHS_BN = [
  "জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন",
  "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর",
];
const dateBn = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${bn(d.getDate())} ${MONTHS_BN[d.getMonth()]}`;
};

// Mirrors CaseStatus exactly. Sending anything else is a 400.
const STATUS_BN = {
  OPEN: { label: "জমা পড়েছে", tone: "bg-sky-100 text-sky-700", icon: LuClock },
  IN_PROGRESS: { label: "তদন্ত চলছে", tone: "bg-amber-100 text-amber-800", icon: LuClock },
  RESOLVED: { label: "সমাধান হয়েছে", tone: "bg-emerald-100 text-emerald-700", icon: LuCircleCheck },
  REJECTED: { label: "গ্রহণ করা হয়নি", tone: "bg-rose-100 text-rose-700", icon: LuTriangleAlert },
};

// Mirrors CasePriority. Three shown, not four — LOW and MEDIUM read the same to
// somebody with a problem, so MEDIUM is the default and LOW is dropped.
const PRIORITIES = [
  { value: "MEDIUM", label: "সাধারণ" },
  { value: "HIGH", label: "গুরুত্বপূর্ণ" },
  { value: "URGENT", label: "জরুরি" },
];

const CATEGORIES = [
  "বেতন সমস্যা",
  "নিরাপত্তা",
  "কাজের পরিবেশ",
  "সরঞ্জাম",
  "আচরণ",
  "অন্যান্য",
];

function Kpi({ label, value, tone }) {
  return (
    <div className={`${CARD} p-4`}>
      <p className="text-[11px] font-semibold text-[#14493B]/50">{label}</p>
      <p className={`mt-1 text-2xl font-extrabold ${tone || "text-[#14493B]"}`}>
        {bn(value ?? 0)}
      </p>
    </div>
  );
}

export default function WorkerReport() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [live, setLive] = useState(false);

  const [category, setCategory] = useState(CATEGORIES[0]);
  const [priority, setPriority] = useState("MEDIUM");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [incidentDate, setIncidentDate] = useState("");
  const [confidential, setConfidential] = useState(false);
  const [audio, setAudio] = useState(null);
  const [busy, setBusy] = useState(false);
  // The long form starts closed: it is the fallback, not the front door.
  const [detailOpen, setDetailOpen] = useState(false);

  const load = useCallback(async () => {
    const { data: d } = await api.get("/me/worker/complaints");
    setData(d);
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    load()
      .catch((err) => alive && setError(apiError(err, "আপনার অভিযোগগুলো আনা যায়নি।")))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [load]);

  // Live: the office replying or changing a status is exactly what this worker
  // is waiting for, and it is the one thing worth interrupting them about.
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => {
    let retry;
    let closedByUs = false;
    let ws;
    const url =
      (typeof import.meta !== "undefined" &&
        import.meta.env &&
        import.meta.env.VITE_WS_URL) ||
      `${WS_BASE}/ws/notifications`;
    const connect = () => {
      try {
        ws = new WebSocket(url);
      } catch {
        return;
      }
      ws.onopen = () => setLive(true);
      ws.onmessage = (e) => {
        let kind = "";
        try {
          kind = JSON.parse(e.data)?.kind || "";
        } catch {
          return;
        }
        // The real kinds, read from FieldCaseService.push — there is no
        // "case.updated".
        if (
          (kind === "case.replied" || kind === "case.status" || kind === "case.created") &&
          loadRef.current
        ) {
          loadRef.current().catch(() => {});
        }
      };
      ws.onerror = () => ws.close();
      ws.onclose = () => {
        setLive(false);
        if (!closedByUs) retry = setTimeout(connect, 5000);
      };
    };
    connect();
    return () => {
      closedByUs = true;
      clearTimeout(retry);
      closeSocket(ws);
    };
  }, []);

  // Both the quick tiles and the detailed form file through here, so the
  // offline queueing, the client_uuid and the messages can only be written once.
  const fileCase = async ({ audio, ...payload }) => {
    setBusy(true);
    setError("");
    try {
      // The voice note goes up FIRST, as multipart, and only the path it
      // returns travels with the complaint.
      //
      // WHY NOT THROUGH THE OUTBOX: queueOrSend stores a JSON body in
      // IndexedDB and replays it as JSON. An audio Blob is neither, and the
      // upload is a separate multipart request to a different endpoint. Rather
      // than pretend a recording queues, the recorder disables itself offline
      // and this guard catches the case where the connection dropped between
      // recording and sending.
      let evidenceUrl = null;
      if (audio) {
        if (!navigator.onLine) {
          setError(
            "নেটওয়ার্ক নেই — কণ্ঠের রেকর্ডিং এখন পাঠানো যাবে না। " +
              "নেটওয়ার্ক এলে আবার পাঠান, বা রেকর্ডিং মুছে লিখে পাঠান।",
          );
          return false;
        }
        const form = new FormData();
        // A filename is required by some servers; the backend ignores it and
        // stores the file under a UUID it generates itself.
        form.append("file", audio, "voice-note");
        const { data } = await api.post("/complaints/attachments", form);
        evidenceUrl = data?.url || null;
      }

      const { queued } = await queueOrSend({
        path: "/me/worker/complaints",
        body: { ...payload, incidentDate: payload.incidentDate || null, evidenceUrl },
        clientUuid: newUuid(),
      });
      setNotice(
        queued
          ? "নেটওয়ার্ক নেই — আপনার অভিযোগ এই ফোনে রাখা হয়েছে, নেটওয়ার্ক এলে নিজে থেকেই চলে যাবে।"
          : "আপনার অভিযোগ অফিসে পৌঁছেছে। অবস্থা নিচে দেখতে পাবেন।",
      );
      if (!queued) await load();
      return true;
    } catch (err) {
      setError(apiError(err, "অভিযোগ পাঠানো যায়নি।"));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!title.trim()) {
      setError("অভিযোগের একটি শিরোনাম লিখুন।");
      return;
    }
    if (!body.trim()) {
      setError("কী হয়েছে সেটি লিখুন।");
      return;
    }
    const ok = await fileCase({
      category,
      priority,
      title: title.trim(),
      body: body.trim(),
      incidentDate,
      confidential,
      audio,
    });
    if (ok) {
      setTitle("");
      setBody("");
      setIncidentDate("");
      setConfidential(false);
      setPriority("MEDIUM");
      setAudio(null);
      setDetailOpen(false);
    }
  };

  if (loading) {
    return (
      <div className="grid h-64 place-items-center text-sm text-[#14493B]/60">
        {"লোড হচ্ছে…"}
      </div>
    );
  }

  const cases = data?.cases || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold text-[#14493B]">
            প্রশাসককে রিপোর্ট করুন
          </h1>
          <p className="text-sm text-[#14493B]/60">
            কোনো সমস্যা হলে এখানে জানান — অফিস সরাসরি দেখতে পাবে
          </p>
        </div>
        <span
          title={
            live
              ? "সংযুক্ত। অফিস উত্তর দিলে সঙ্গে সঙ্গে দেখতে পাবেন।"
              : "সংযোগ নেই। তথ্য ঠিক আছে, তবে নিজে থেকে হালনাগাদ হবে না।"
          }
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ${
            live ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
          }`}
        >
          <span
            className={`h-2 w-2 rounded-full ${
              live ? "animate-pulse bg-emerald-500" : "bg-slate-400"
            }`}
          />
          {live ? "লাইভ" : "অফলাইন"}
        </span>
      </div>

      {error && (
        <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">
          {error}
        </p>
      )}
      {notice && (
        <p className="flex flex-wrap items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900 ring-1 ring-emerald-200">
          <LuCircleCheck size={15} className="shrink-0" />
          {notice}
          <button
            type="button"
            onClick={() => setNotice("")}
            className="ml-auto text-xs font-bold text-emerald-800"
          >
            ঠিক আছে
          </button>
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-4">
        <Kpi label="মোট অভিযোগ" value={data?.total} />
        <Kpi label="সমাধান হয়েছে" value={data?.resolved} tone="text-emerald-700" />
        <Kpi label="তদন্ত চলছে" value={data?.investigating} tone="text-amber-700" />
        <Kpi label="জরুরি" value={data?.urgent} tone="text-rose-700" />
      </div>

      {/* Two taps, no reading. The detailed form is still there underneath for
          anyone with something the six tiles do not cover. */}
      <QuickReport onFile={fileCase} busy={busy} />

      <div className={`${CARD} overflow-hidden`}>
        <button
          type="button"
          onClick={() => setDetailOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-2 bg-[#C0F28B] px-5 py-3 text-left"
        >
          <span className="font-bold text-[#14493B]">
            নিজে লিখে জানাতে চান?
          </span>
          <span className="text-xs font-bold text-[#14493B]/60">
            {detailOpen ? "বন্ধ করুন" : "খুলুন"}
          </span>
        </button>
        <div className={`space-y-4 p-5 ${detailOpen ? "" : "hidden"}`}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-bold text-[#14493B]" htmlFor="wr-cat">
                কী নিয়ে সমস্যা?
              </label>
              <select
                id="wr-cat"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-xl border border-[#13483B]/30 bg-white px-4 py-2.5 text-sm text-[#14493B] outline-none focus:border-[#14493B]"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-bold text-[#14493B]" htmlFor="wr-date">
                কবে হয়েছিল? <span className="font-normal opacity-60">(না জানলে খালি রাখুন)</span>
              </label>
              <input
                id="wr-date"
                type="date"
                value={incidentDate}
                onChange={(e) => setIncidentDate(e.target.value)}
                className="w-full rounded-xl border border-[#13483B]/30 bg-white px-4 py-2.5 text-sm text-[#14493B] outline-none focus:border-[#14493B]"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-bold text-[#14493B]" htmlFor="wr-title">
              সংক্ষেপে কী সমস্যা?
            </label>
            <input
              id="wr-title"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setError("");
              }}
              placeholder="যেমন: গত মাসের বেতন কম পেয়েছি"
              className="w-full rounded-xl border border-[#13483B]/30 bg-white px-4 py-2.5 text-sm text-[#14493B] outline-none focus:border-[#14493B]"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-bold text-[#14493B]" htmlFor="wr-body">
              বিস্তারিত বলুন
            </label>
            <textarea
              id="wr-body"
              rows={4}
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
                setError("");
              }}
              placeholder="কী হয়েছে, কোথায় হয়েছে, কে ছিল…"
              className="w-full resize-y rounded-xl border border-[#13483B]/30 bg-white px-4 py-2.5 text-sm text-[#14493B] outline-none focus:border-[#14493B]"
            />
            {/* The title and body above are still required — a case with no
                text is unsearchable and unsortable in the admin queue. The
                recording adds what the box cannot hold.

                Not offered on a confidential complaint: a voice identifies the
                speaker, which is exactly what confidential mode removes. The
                server refuses one too, in MeWorkerService.fileCase. */}
            {confidential ? (
              <p className="mt-3 rounded-xl bg-[#F4FFE9] px-3 py-2 text-[11px] text-[#14493B]/65">
                গোপনীয় অভিযোগে কণ্ঠ রেকর্ড করা যায় না — কণ্ঠ শুনে আপনাকে
                চেনা যেত।
              </p>
            ) : (
              <VoiceNote blob={audio} onChange={setAudio} disabled={busy} />
            )}
          </div>

          <div>
            <span className="mb-1.5 block text-sm font-bold text-[#14493B]">
              কতটা জরুরি?
            </span>
            <div className="inline-flex overflow-hidden rounded-xl ring-1 ring-[#13483B]/25">
              {PRIORITIES.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPriority(p.value)}
                  className={`px-4 py-2 text-sm font-bold transition ${
                    priority === p.value
                      ? "bg-[#14493B] text-white"
                      : "bg-white text-[#14493B]/70 hover:bg-[#F4FFE9]"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* CONFIDENTIAL — worded to match exactly what the server does. */}
          <label
            className={`flex cursor-pointer items-start gap-3 rounded-xl px-4 py-3 ring-1 transition ${
              confidential ? "bg-[#F4FFE9] ring-[#13483B]/25" : "bg-white ring-[#13483B]/15"
            }`}
          >
            <input
              type="checkbox"
              checked={confidential}
              onChange={(e) => {
                setConfidential(e.target.checked);
                // Ticking it AFTER recording must throw the recording away, or
                // the request is refused at the server and they lose it there
                // instead — with a rejection instead of an explanation.
                if (e.target.checked) setAudio(null);
              }}
              className="mt-0.5 h-4 w-4 accent-[#14493B]"
            />
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-sm font-bold text-[#14493B]">
                <LuShieldCheck size={15} /> গোপনীয় অভিযোগ
              </span>
              <span className="mt-0.5 block text-xs text-[#14493B]/65">
                অফিস আপনার অভিযোগ দেখবে, কিন্তু কে জমা দিয়েছে সেটি দেখতে পাবে না।
                আপনার নাম, কর্মী আইডি ও ক্ষেত্রের নাম কোথাও দেখানো হবে না।
              </span>
            </span>
          </label>

          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#14493B] px-6 py-3 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-50"
          >
            <LuSend size={16} /> {busy ? "পাঠানো হচ্ছে…" : "অভিযোগ জমা দিন"}
          </button>

          <p className="flex items-start gap-2 text-[11px] text-[#14493B]/45">
            <LuInfo size={13} className="mt-0.5 shrink-0" />
            নেটওয়ার্ক না থাকলেও লিখে রাখতে পারেন — নেটওয়ার্ক এলে নিজে থেকেই চলে যাবে।
          </p>
        </div>
      </div>

      {/* Their own cases */}
      <div className={`${CARD} overflow-hidden`}>
        <div className="bg-[#C0F28B] px-5 py-3">
          <h2 className="font-bold text-[#14493B]">আপনার অভিযোগসমূহ</h2>
        </div>
        {cases.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-[#14493B]/50">
            আপনি এখনো কোনো অভিযোগ জমা দেননি।
          </p>
        ) : (
          <ul className="divide-y divide-[#13483B]/8">
            {cases.map((c) => {
              const s = STATUS_BN[c.status] || STATUS_BN.OPEN;
              return (
                <li key={c.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-[#14493B]">{c.title}</p>
                      <p className="mt-0.5 text-xs text-[#14493B]/55">
                        {c.category} · {dateBn(c.createdAt)}
                        {c.incidentDate ? ` · ঘটনা ${dateBn(c.incidentDate)}` : ""}
                      </p>
                    </div>
                    <span
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ${s.tone}`}
                    >
                      <s.icon size={12} /> {s.label}
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {c.confidential && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#F4FFE9] px-2 py-0.5 text-[10px] font-bold text-[#14493B] ring-1 ring-[#13483B]/15">
                        <LuShieldCheck size={11} /> গোপনীয়
                      </span>
                    )}
                    {c.priority === "URGENT" && (
                      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                        জরুরি
                      </span>
                    )}
                  </div>

                  {/* THE OFFICE'S ACTUAL WORDS.
                      This line used to read "অফিস উত্তর দিয়েছে" and nothing
                      more — the worker was told an answer existed and never
                      shown one. A boolean is not a reply. The text comes from
                      /me/worker/complaints, which reads case_reply for cases
                      this worker submitted. */}
                  {Array.isArray(c.replies) && c.replies.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      {c.replies.map((r) => (
                        <div
                          key={r.id}
                          className="rounded-xl bg-[#F1EFE8] p-3 ring-1 ring-[#13483B]/10"
                        >
                          <div className="mb-1.5 flex items-center gap-2">
                            <span className="grid h-7 w-7 place-items-center rounded-full bg-[#14493B] text-[11px] font-bold text-white">
                              অ
                            </span>
                            <div>
                              <p className="text-xs font-bold text-[#14493B]">
                                অফিস
                              </p>
                              <p className="text-[10px] text-[#14493B]/50">
                                {dateBn(r.createdAt)}
                              </p>
                            </div>
                          </div>
                          <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#14493B]/85">
                            {r.body}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    /* Said explicitly. Silence and "I have not looked" are
                       indistinguishable otherwise. */
                    <p className="mt-2 flex items-center gap-1.5 text-[11px] text-[#14493B]/45">
                      <LuClock size={12} /> অফিস এখনো কিছু জানায়নি
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
