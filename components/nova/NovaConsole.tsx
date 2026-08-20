"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { NovaOrb, type OrbPhase } from "./NovaOrb";

/**
 * Nova's console.
 *
 * Ported from RideBy's NovaConsole: the same phase model (idle, listening,
 * thinking, speaking), the same streamed reply, the same tap-the-orb-to-talk
 * interaction. Rebuilt in Sere's CSS rather than copied class for class, and
 * voice uses the browser's own speech APIs so there is no third service to pay
 * for or key to hold.
 */

type Line = { role: "you" | "nova"; text: string; tools?: string[] };

type Status = {
  shop: string;
  trade: string;
  headline: string;
  clock: { timeWithZone: string; weekday: string; date: string };
  online: boolean;
  model: string;
  writable: boolean;
  plan: string;
  money: { collectedThisWeek: string; overdue: string; profitThisMonth: string };
  counts: {
    today: number;
    tomorrow: number;
    unscheduled: number;
    finishedNotInvoiced: number;
    overdue: number;
    drafts: number;
  };
  followUps: string[];
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

function recognizer(): SpeechRecognitionLike | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

const PROMPTS = [
  "What's on today",
  "Who owes me money",
  "What did I actually make this month",
  "Anything finished I never billed",
];

export function NovaConsole({ ownerName }: { ownerName: string }) {
  const [lines, setLines] = useState<Line[]>([]);
  const [draft, setDraft] = useState("");
  const [phase, setPhase] = useState<OrbPhase>("idle");
  const [status, setStatus] = useState<Status | null>(null);
  const [voice, setVoice] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const busy = phase === "thinking" || phase === "speaking";

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const response = await fetch("/api/nova/status", { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as Status;
        if (alive) setStatus(payload);
      } catch {
        // A missing status strip is not worth an error message.
      }
    };
    load();
    const timer = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [lines, phase]);

  const speak = useCallback(
    (text: string) => {
      if (!voice || typeof window === "undefined" || !window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05;
      utterance.onstart = () => setPhase("speaking");
      utterance.onend = () => setPhase("idle");
      window.speechSynthesis.speak(utterance);
    },
    [voice],
  );

  const send = useCallback(
    async (message: string) => {
      const text = message.trim();
      if (!text || busy) return;
      setError("");
      setDraft("");
      setLines((prev) => [...prev, { role: "you", text }, { role: "nova", text: "" }]);
      setPhase("thinking");

      try {
        const response = await fetch("/api/nova/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text }),
        });
        if (!response.ok || !response.body) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(payload.error || "Nova is not answering.");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let streamed = "";
        let finalText = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() || "";
          for (const block of events) {
            const kind = /^event:\s*(\w+)/m.exec(block)?.[1];
            const raw = /^data:\s*(.*)$/m.exec(block)?.[1];
            if (!kind || !raw) continue;
            let data: { delta?: string; reply?: string; tools?: string[]; error?: string };
            try {
              data = JSON.parse(raw);
            } catch {
              continue;
            }
            if (kind === "delta" && data.delta) {
              streamed += data.delta;
              setLines((prev) => {
                const next = [...prev];
                next[next.length - 1] = { role: "nova", text: streamed };
                return next;
              });
            } else if (kind === "done") {
              finalText = data.reply || streamed;
              setLines((prev) => {
                const next = [...prev];
                next[next.length - 1] = { role: "nova", text: finalText, tools: data.tools };
                return next;
              });
            } else if (kind === "error") {
              throw new Error(data.error || "Nova hit a problem.");
            }
          }
        }

        if (finalText && voice) speak(finalText);
        else setPhase("idle");
      } catch (caught) {
        setError((caught as Error).message);
        setLines((prev) => prev.filter((line, i) => !(i === prev.length - 1 && !line.text)));
        setPhase("idle");
      }
    },
    [busy, speak, voice],
  );

  const listen = useCallback(() => {
    if (busy) return;
    if (phase === "listening") {
      recRef.current?.stop();
      setPhase("idle");
      return;
    }
    const rec = recognizer();
    if (!rec) {
      setError("This browser will not do speech. Type instead.");
      return;
    }
    recRef.current = rec;
    rec.lang = "en-US";
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (event) => {
      const said = event.results?.[0]?.[0]?.transcript || "";
      if (said) void send(said);
    };
    rec.onend = () => setPhase((p) => (p === "listening" ? "idle" : p));
    rec.onerror = () => setPhase("idle");
    setPhase("listening");
    setVoice(true);
    rec.start();
  }, [busy, phase, send]);

  const label =
    phase === "listening"
      ? "Listening — tap to stop"
      : phase === "thinking"
        ? "Working"
        : phase === "speaking"
          ? "Speaking — tap to stop"
          : "Tap to talk to Nova";

  return (
    <div className="nova">
      <header className="nova-head">
        <NovaOrb
          phase={phase}
          ariaLabel={label}
          onClick={() => {
            if (phase === "speaking") {
              window.speechSynthesis?.cancel();
              setPhase("idle");
              return;
            }
            listen();
          }}
        />
        <div className="nova-head-copy">
          <h1 className="nova-title">Nova</h1>
          <p className="nova-sub">
            {status
              ? `${status.shop} · ${status.headline}`
              : "Reading the shop\u2026"}
          </p>
          <p className="nova-meta">
            {status?.online
              ? `${status.model}${status.writable ? "" : " · read only"}`
              : "No model key on the server — Nova cannot answer yet."}
            {status ? ` · ${status.clock.timeWithZone}` : ""}
          </p>
        </div>
      </header>

      {status && status.counts.finishedNotInvoiced > 0 ? (
        <a className="nova-flag" href="/jobs?status=completed">
          <strong>
            {status.counts.finishedNotInvoiced} finished, never invoiced
          </strong>
          <span>Work you already did. Bill it.</span>
        </a>
      ) : null}

      {error ? <p className="nova-error">{error}</p> : null}

      <div className="nova-thread">
        {lines.length === 0 ? (
          <div className="nova-empty">
            <p>
              Ask me anything about {status?.shop || "the shop"}, {ownerName}. I read the
              board and the books before I answer, and I will tell you when I do not know.
            </p>
            {status?.followUps.length ? (
              <ul className="nova-followups">
                {status.followUps.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          lines.map((line, i) => (
            <div key={`${line.role}-${i}`} className={`nova-line nova-line-${line.role}`}>
              <p>{line.text || (line.role === "nova" ? "…" : "")}</p>
              {line.tools?.length ? (
                <span className="nova-tools">read: {line.tools.join(", ")}</span>
              ) : null}
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>

      <div className="nova-prompts">
        {PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            className="nova-prompt"
            disabled={busy}
            onClick={() => void send(prompt)}
          >
            {prompt}
          </button>
        ))}
      </div>

      <form
        className="nova-composer"
        onSubmit={(event) => {
          event.preventDefault();
          void send(draft);
        }}
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={busy ? "Working\u2026" : "Ask Nova"}
          aria-label="Ask Nova"
          enterKeyHint="send"
          disabled={busy}
        />
        <button
          type="button"
          className={`btn btn-secondary${voice ? " nova-on" : ""}`}
          onClick={() => {
            const next = !voice;
            setVoice(next);
            if (!next) window.speechSynthesis?.cancel();
          }}
          aria-pressed={voice}
        >
          {voice ? "Voice on" : "Voice off"}
        </button>
        <button className="btn" type="submit" disabled={busy || !draft.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
