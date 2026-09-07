"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { NOVA_NAME } from "@/lib/nova/identity";
import { SERENITY_NAME } from "@/lib/serenity";
import { NovaOrb, type OrbPhase } from "./NovaOrb";

/**
 * Shared console chrome for two different people.
 *
 * Serenity: shop owners, /api/serenity/*, board and books.
 * Nova: operator only, /api/nova/*, cold outreach. Same orb, different brain.
 */

export type ConsoleKind = "serenity" | "nova";

type Line = { role: "you" | "bot"; text: string; tools?: string[] };

type Status = {
  shop?: string;
  trade?: string;
  headline: string;
  clock: { timeWithZone: string; weekday: string; date: string };
  online: boolean;
  model: string;
  writable?: boolean;
  credit?: { remaining: string; exhausted: boolean };
  counts?: { finishedNotInvoiced?: number };
  followUps?: string[];
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

const SERENITY_PROMPTS = [
  "What's on today",
  "Who owes me money",
  "What did I actually make this month",
  "Anything finished I never billed",
];

const NOVA_PROMPTS = [
  "What's the pipeline",
  "Find HVAC shops in Fort Myers",
  "Run a tick",
  "Can we send",
];

export function NovaConsole({
  kind,
  ownerName,
}: {
  kind: ConsoleKind;
  ownerName: string;
}) {
  const name = kind === "nova" ? NOVA_NAME : SERENITY_NAME;
  const statusUrl = kind === "nova" ? "/api/nova/status" : "/api/serenity/status";
  const chatUrl = kind === "nova" ? "/api/nova/chat" : "/api/serenity/chat";
  const prompts = kind === "nova" ? NOVA_PROMPTS : SERENITY_PROMPTS;

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
        const response = await fetch(statusUrl, { cache: "no-store" });
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
  }, [statusUrl]);

  useEffect(() => {
    if (lines.length) endRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "end" });
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
      setLines((prev) => [...prev, { role: "you", text }, { role: "bot", text: "" }]);
      setPhase("thinking");

      try {
        const response = await fetch(chatUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text }),
        });
        if (!response.ok || !response.body) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(payload.error || `${name} is not answering.`);
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
            const kindEvent = /^event:\s*(\w+)/m.exec(block)?.[1];
            const raw = /^data:\s*(.*)$/m.exec(block)?.[1];
            if (!kindEvent || !raw) continue;
            let data: { delta?: string; reply?: string; tools?: string[]; error?: string };
            try {
              data = JSON.parse(raw);
            } catch {
              continue;
            }
            if (kindEvent === "delta" && data.delta) {
              streamed += data.delta;
              setLines((prev) => {
                const next = [...prev];
                next[next.length - 1] = { role: "bot", text: streamed };
                return next;
              });
            } else if (kindEvent === "done") {
              finalText = data.reply || streamed;
              setLines((prev) => {
                const next = [...prev];
                next[next.length - 1] = { role: "bot", text: finalText, tools: data.tools };
                return next;
              });
            } else if (kindEvent === "error") {
              throw new Error(data.error || `${name} hit a problem.`);
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
    [busy, chatUrl, name, speak, voice],
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
      ? "Listening. Tap to stop"
      : phase === "thinking"
        ? "Working"
        : phase === "speaking"
          ? "Speaking. Tap to stop"
          : `Tap to talk to ${name}`;

  const finished = status?.counts?.finishedNotInvoiced || 0;
  const subtitle = status
    ? kind === "nova"
      ? status.headline
      : `${status.shop} · ${status.headline}`
    : kind === "nova"
      ? "Reading the pipeline\u2026"
      : "Reading the shop\u2026";

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
          <h1 className="nova-title">{name}</h1>
          <p className="nova-sub">{subtitle}</p>
          <p className="nova-meta">
            {kind === "serenity"
              ? !status ? "Connecting…" : status.online ? status.writable === false ? "Ready · view only" : "Ready to help" : "Connect Serenity in Settings to start."
              : status?.online
                ? `${status.model}${status.writable === false ? " · read only" : ""}`
                : `No model key on the server. ${name} cannot answer yet.`}
            {kind === "serenity" && status?.credit
              ? ` · ${status.credit.remaining} left`
              : ""}
            {status ? ` · ${status.clock.timeWithZone}` : ""}
          </p>
        </div>
      </header>

      {kind === "serenity" && finished > 0 ? (
        <a className="nova-flag" href="/collect">
          <strong>
            {finished} finished, never invoiced
          </strong>
          <span>Work you already did. Bill it.</span>
        </a>
      ) : null}

      {error ? <p className="nova-error">{error}</p> : null}

      <div className="nova-thread" role="log" aria-label={`${name} conversation`}>
        {lines.length === 0 ? (
          <div className="nova-empty">
            {kind === "nova" ? (
              <p>
                The pipeline is yours, {ownerName}. I find shops, research them,
                draft, review, and send. I will not talk about a shop&apos;s jobs
                or books. That is {SERENITY_NAME}.
              </p>
            ) : (
              <p>
                Ask about today’s schedule, unpaid invoices, or your next follow-up, {ownerName}.
                I’ll check the shop’s records before I answer.
              </p>
            )}
            {status?.followUps?.length ? (
              <ul className="nova-followups">
                {status.followUps.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          lines.map((line, i) => (
            <div key={`${line.role}-${i}`} className={`nova-line nova-line-${line.role === "you" ? "you" : "nova"}`}>
              <p>{line.text || (line.role === "bot" ? "…" : "")}</p>
              {kind === "nova" && line.tools?.length ? (
                <span className="nova-tools">read: {line.tools.join(", ")}</span>
              ) : null}
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>

      <div className="nova-prompts">
        {prompts.map((prompt) => (
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
          placeholder={busy ? "Working\u2026" : `Ask ${name}`}
          aria-label={`Ask ${name}`}
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
