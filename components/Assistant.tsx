"use client";

import { useEffect, useRef, useState } from "react";
import type { AssistantBrief, AssistantLink, AssistantReply } from "@/lib/assistant";

type ChatItem = { role: "user" | "sere"; text: string; links: AssistantLink[]; did?: string };

const CHAT_KEY = "sere-assistant-v1";
const CHAT_CAP = 40;

function loadChat(): ChatItem[] {
  try {
    const raw = localStorage.getItem(CHAT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatItem[];
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(-CHAT_CAP);
  } catch {
    return [];
  }
}

export function AssistantDock({
  brief,
  tradeName,
}: {
  brief: AssistantBrief;
  tradeName: string;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<ChatItem[]>([]);
  const end = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const badge = brief.alerts.length;

  useEffect(() => {
    setItems(loadChat());
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(CHAT_KEY, JSON.stringify(items.slice(-CHAT_CAP)));
    } catch {
      // Private mode or quota. Chat still works for this session.
    }
  }, [items]);

  useEffect(() => {
    document.documentElement.classList.toggle("locked", open);
    document.body.classList.toggle("locked", open);
    return () => {
      document.documentElement.classList.remove("locked");
      document.body.classList.remove("locked");
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setTimeout(() => field.current?.focus(), 50);
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    function onSlash(event: KeyboardEvent) {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      setOpen(true);
    }
    window.addEventListener("keydown", onSlash);
    return () => window.removeEventListener("keydown", onSlash);
  }, []);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [items, open]);

  async function ask(message: string) {
    const trimmed = message.trim();
    if (!trimmed || busy) return;
    setText("");
    setItems((prev) => [...prev, { role: "user", text: trimmed, links: [] }]);
    setBusy(true);
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });
      const data = (await response.json()) as AssistantReply & { error?: string };
      setItems((prev) => [
        ...prev,
        {
          role: "sere",
          text: data.text || data.error || "I could not do that.",
          links: data.links || [],
          did: data.did,
        },
      ]);
    } catch {
      setItems((prev) => [
        ...prev,
        { role: "sere", text: "I could not reach the assistant just now.", links: [] },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        className="icon-btn assistant-launch"
        type="button"
        aria-label="Open Sere assistant"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <AssistantMark />
        {badge ? <span className="dot">{badge > 9 ? "9+" : badge}</span> : null}
      </button>

      {open ? (
        <div className="assistant-root">
          <button className="assistant-scrim" type="button" aria-label="Close assistant" onClick={() => setOpen(false)} />
          <section className="assistant-panel" role="dialog" aria-label="Sere assistant">
            <header className="assistant-head">
              <div>
                <p className="assistant-kicker">{brief.gpt ? "Sere · GPT" : "Sere"}</p>
                <h2>{brief.greeting}</h2>
                <p className="tiny">{brief.summary}</p>
              </div>
              <button className="icon-btn" type="button" aria-label="Close" onClick={() => setOpen(false)}>
                <CloseMark />
              </button>
            </header>

            <div className="assistant-body">
              {brief.alerts.length ? (
                <div className="assistant-alerts">
                  {brief.alerts.map((alert) => (
                    <a key={alert.title} className={`assistant-alert tone-${alert.tone}`} href={alert.href}>
                      <strong>{alert.title}</strong>
                      <span>{alert.body}</span>
                    </a>
                  ))}
                </div>
              ) : (
                <p className="muted">Nothing needs you right now. Ask me to move a job or pull cash numbers.</p>
              )}
              {!brief.gpt ? (
                <p className="tiny">Sere is on rules for this shop. Ask for today&apos;s jobs or overdue invoices.</p>
              ) : null}

              {items.map((item, i) => (
                <div key={`${item.role}-${i}`} className={`assistant-msg ${item.role}`}>
                  <p>{item.text}</p>
                  {item.links.length ? (
                    <div className="assistant-links">
                      {item.links.map((link) => (
                        <a key={link.href + link.label} href={link.href}>{link.label}</a>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
              {busy ? <p className="tiny">Working…</p> : null}
              <div ref={end} />
            </div>

            <div className="assistant-chips">
              {brief.suggestions.map((chip) => (
                <button key={chip} type="button" className="chip" onClick={() => ask(chip)}>
                  {chip}
                </button>
              ))}
            </div>

            <form
              className="assistant-compose"
              onSubmit={(event) => {
                event.preventDefault();
                ask(text);
              }}
            >
              <input
                ref={field}
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder={`Ask Sere, or move a ${tradeName.toLowerCase()} job`}
                autoComplete="off"
                enterKeyHint="send"
              />
              <button className="btn" type="submit" disabled={busy || !text.trim()}>Send</button>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}

function AssistantMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
      <path d="M12 3.5 13.6 8.4 18.5 10 13.6 11.6 12 16.5 10.4 11.6 5.5 10 10.4 8.4z" />
      <path d="M18 15.5 18.7 17.3 20.5 18 18.7 18.7 18 20.5 17.3 18.7 15.5 18 17.3 17.3z" />
    </svg>
  );
}

function CloseMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6 18 18M18 6 6 18" />
    </svg>
  );
}
