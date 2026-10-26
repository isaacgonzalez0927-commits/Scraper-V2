"use client";

import { useCallback, useEffect, useState } from "react";

type ManagerRun = {
  day: string;
  status: string;
  action: string;
  city: string;
  trade: string;
  rationale: string;
  outcome: string;
};

type ManagerData = {
  enabled: boolean;
  goal: string;
  cities: string[];
  trades: string[];
  runs: ManagerRun[];
  pipeline: {
    total: number;
    queued: number;
    sent: number;
    replies: number;
    signups: number;
    approvalRequired: number;
    sendEnabled: boolean;
  };
};

type PendingDraft = {
  id: number;
  company: string;
  trade: string;
  email: string;
  subject: string;
  body: string;
  score: number;
};

async function json<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...options });
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error || "Request failed.");
  return body;
}

export function NovaManagerPanel() {
  const [manager, setManager] = useState<ManagerData | null>(null);
  const [pending, setPending] = useState<PendingDraft[]>([]);
  const [goal, setGoal] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [status, approvals] = await Promise.all([
        json<ManagerData>("/api/nova/manager"),
        json<{ drafts: PendingDraft[] }>("/api/nova/approvals"),
      ]);
      setManager(status);
      setPending(approvals.drafts);
      setGoal((old) => old || status.goal);
    } catch (error) {
      setNotice((error as Error).message);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 60_000);
    return () => clearInterval(timer);
  }, [refresh]);

  const change = useCallback(async (url: string, data: Record<string, unknown>) => {
    setBusy(true);
    setNotice("");
    try {
      const result = await json<{ status?: string }>(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      setNotice(result.status === "already_run"
        ? "Today's management cycle already ran. No duplicate search was charged."
        : result.status === "disabled"
          ? "Autonomous execution is not enabled in this environment."
          : "Saved. Nova's workspace is updated.");
      await refresh();
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const respond = async (draft: PendingDraft, action: "approve" | "reject") => {
    const question = action === "approve"
      ? "Approve this exact email to " + draft.email + " for sending when the sending safeguards allow it?"
      : "Reject this draft to " + draft.email + "?";
    if (!window.confirm(question)) return;
    await change("/api/nova/approvals", { id: draft.id, action });
  };

  const latest = manager?.runs[0];
  const stat = manager?.pipeline;

  return (
    <section aria-label="Nova growth manager" style={{
      border: "1px solid var(--line)", background: "var(--surface)",
      borderRadius: 14, padding: 18, marginBottom: 18,
    }}>
      <header style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <p style={{ margin: 0, color: "var(--ink-3)", fontSize: 11, letterSpacing: ".08em" }}>NOVA OPERATIONS</p>
          <h2 style={{ margin: "4px 0", fontSize: 20 }}>Growth manager</h2>
          <p style={{ margin: 0, fontSize: 13, color: "var(--ink-3)" }}>
            {manager?.enabled ? "Management enabled · external emails need approval" :
              "Preview mode · management cycle disabled"}
          </p>
        </div>
        <button type="button" className="btn btn-secondary" disabled={!manager?.enabled || busy}
          onClick={() => void change("/api/nova/manager", { action: "run" })}>
          {busy ? "Working…" : "Run today's plan"}
        </button>
      </header>

      {stat ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(95px, 1fr))", gap: 10, marginTop: 18 }}>
          {[
            ["Prospects", stat.total], ["Work queued", stat.queued],
            ["Recent sends", stat.sent], ["Replies", stat.replies],
            ["Signups", stat.signups], ["Needs review", stat.approvalRequired],
          ].map(([label, value]) => (
            <div key={String(label)} style={{
              padding: 10, background: "var(--surface-2)",
              border: "1px solid var(--line)", borderRadius: 10,
            }}>
              <strong style={{ display: "block", fontSize: 21 }}>{value}</strong>
              <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{label}</span>
            </div>
          ))}
        </div>
      ) : null}

      <form style={{ display: "grid", gap: 8, marginTop: 18 }}
        onSubmit={(event) => {
          event.preventDefault();
          void change("/api/nova/manager", { action: "set_goal", goal });
        }}>
        <label htmlFor="nova-growth-goal" style={{ fontSize: 13, fontWeight: 650 }}>Current objective</label>
        <textarea id="nova-growth-goal" rows={2} value={goal} onChange={(event) => setGoal(event.target.value)}
          style={{
            color: "var(--ink)", background: "var(--surface-2)",
            border: "1px solid var(--line-2)", borderRadius: 10,
            padding: 10, font: "inherit", width: "100%", resize: "vertical",
          }}/>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <small style={{ color: "var(--ink-3)" }}>
            Target cities: {manager?.cities.length ? manager.cities.join(" · ") : "none configured; no paid discovery"}
          </small>
          <button type="submit" className="btn btn-secondary" disabled={busy || goal.trim().length < 10}>
            Save objective
          </button>
        </div>
      </form>

      {latest ? (
        <div style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 12, marginTop: 18 }}>
          <strong style={{ fontSize: 13 }}>Latest decision · {latest.day} · {latest.status}</strong>
          <p style={{ margin: "6px 0", fontSize: 13 }}>
            {latest.action.replace(/_/g, " ")}
            {latest.city ? " · " + latest.city : ""}
            {latest.trade ? " · " + latest.trade : ""}
          </p>
          <p style={{ margin: "6px 0", fontSize: 13, color: "var(--ink-2)" }}>{latest.rationale}</p>
          <p style={{ margin: 0, fontSize: 12, color: "var(--ink-3)" }}>{latest.outcome}</p>
        </div>
      ) : null}

      {notice && <p role="status" style={{ color: "var(--ink-2)", fontSize: 13 }}>{notice}</p>}

      <div style={{ marginTop: 20 }}>
        <h3 style={{ margin: "0 0 6px", fontSize: 16 }}>Approval inbox ({pending.length})</h3>
        <p style={{ color: "var(--ink-3)", fontSize: 12, margin: "0 0 12px" }}>
          AI review is never permission to send. Read the exact recipient and message first.
        </p>
        {!pending.length ? (
          <p style={{ color: "var(--ink-3)", fontSize: 13 }}>No drafts need your decision.</p>
        ) : pending.map((draft) => (
          <article key={draft.id} style={{ padding: 14, border: "1px solid var(--line)", borderRadius: 10, marginBottom: 10 }}>
            <strong>{draft.company} · {draft.trade}</strong>
            <p style={{ color: "var(--ink-3)", fontSize: 12, margin: "6px 0" }}>
              To: {draft.email} · AI score {draft.score}/100
            </p>
            <strong style={{ display: "block", fontSize: 13, marginTop: 10 }}>{draft.subject}</strong>
            <p style={{ fontSize: 13, whiteSpace: "pre-wrap", marginBottom: 12 }}>{draft.body}</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <button type="button" className="btn btn-primary" disabled={busy}
                onClick={() => void respond(draft, "approve")}>Approve this email</button>
              <button type="button" className="btn btn-secondary" disabled={busy}
                onClick={() => void respond(draft, "reject")}>Reject</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
