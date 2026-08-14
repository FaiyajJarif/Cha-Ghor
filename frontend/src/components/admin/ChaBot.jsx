import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LuBot, LuX, LuSend, LuCode } from "react-icons/lu";
import api from "../../api/client";

// Floating Cha Bot widget. Sends questions to the read-only /chatbot/ask
// endpoint (text-to-SQL over curated views) and shows the answer. The SQL it
// ran is available behind a "View query" toggle for transparency.
export default function ChaBot({ suggestions = [] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: "bot",
      text: "Hi! I'm Cha Bot. Ask me about workers, attendance, payroll, loans, or finance - e.g. total wages paid last month, or active loans by zone.",
    },
  ]);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  const send = async (text) => {
    const question = (text ?? q).trim();
    if (!question || busy) return;
    setQ("");
    setMessages((m) => [...m, { role: "user", text: question }]);
    setBusy(true);
    try {
      const { data } = await api.post("/chatbot/ask", { question });
      setMessages((m) => [
        ...m,
        {
          role: "bot",
          text: data.answer || "No answer.",
          sql: data.sql,
          provider: data.provider,
        },
      ]);
    } catch (err) {
      const status = err?.response?.status;
      const detail =
        err?.response?.data?.message ||
        (typeof err?.response?.data === "string" ? err.response.data : "");
      let text;
      if (!err?.response) {
        text =
          "Cha Bot can't reach the server. Check your connection and that the backend is running.";
      } else if (status === 503) {
        text =
          "Cha Bot is offline right now - the AI service isn't running. Start it and try again.";
      } else if (status === 502) {
        text = "Cha Bot couldn't process that question. Please try rephrasing it.";
      } else if (status === 401 || status === 403) {
        text = "Your session has expired. Please log in again.";
      } else {
        text = detail || "Something went wrong. Please try again in a moment.";
      }
      setMessages((m) => [...m, { role: "bot", text: String(text), error: true }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Open Cha Bot"
        className="fixed bottom-5 right-5 z-[80] grid h-14 w-14 place-items-center rounded-full bg-cg-dark text-white shadow-lg transition hover:bg-cg-darker"
      >
        {open ? <LuX size={22} /> : <LuBot size={24} />}
      </button>

      {open &&
        createPortal(
          <div className="fixed bottom-24 right-5 z-[80] flex h-[70vh] max-h-[560px] w-[92vw] max-w-sm flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-cg-green/15">
            <div className="flex items-center gap-2 bg-cg-dark px-4 py-3 text-white">
              <LuBot size={20} />
              <div className="leading-tight">
                <p className="font-bold">Cha Bot</p>
                <p className="text-[11px] text-white/70">
                  Read-only · workers, payroll, loans, finance
                </p>
              </div>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto bg-cg-lime/20 p-3 text-sm">
              {messages.map((m, i) => (
                <Bubble key={i} m={m} />
              ))}
              {busy && (
                <p className="text-xs text-cg-ink/50">Cha Bot is thinking…</p>
              )}
              <div ref={endRef} />
            </div>

            {suggestions.length > 0 && (
              <div className="flex flex-wrap gap-1.5 border-t border-cg-green/10 bg-white px-3 py-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    disabled={busy}
                    className="rounded-full bg-cg-lime px-2.5 py-1 text-xs font-medium text-cg-green hover:bg-cg-lime/70 disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
              className="flex items-center gap-2 border-t border-cg-green/10 p-2"
            >
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Ask about the workforce…"
                className="flex-1 rounded-lg bg-cg-lime/30 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-cg-green"
              />
              <button
                disabled={busy}
                aria-label="Send"
                className="grid h-9 w-9 place-items-center rounded-lg bg-cg-dark text-white disabled:opacity-50"
              >
                <LuSend size={16} />
              </button>
            </form>
          </div>,
          document.body,
        )}
    </>
  );
}

function Bubble({ m }) {
  const [showSql, setShowSql] = useState(false);
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-cg-dark px-3 py-2 text-white">
          {m.text}
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-start">
      <div
        className={`max-w-[90%] rounded-2xl rounded-bl-sm px-3 py-2 ${
          m.error
            ? "bg-red-50 text-red-700 ring-1 ring-red-200"
            : "bg-white text-cg-ink ring-1 ring-cg-green/10"
        }`}
      >
        <div className="whitespace-pre-wrap">{m.text}</div>
        {m.sql && (
          <div className="mt-1.5">
            <button
              onClick={() => setShowSql((s) => !s)}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-cg-green hover:underline"
            >
              <LuCode size={12} /> {showSql ? "Hide" : "View"} query
            </button>
            {showSql && (
              <pre className="mt-1 overflow-x-auto rounded-lg bg-cg-ink/90 p-2 text-[11px] text-cg-lime">
                {m.sql}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
