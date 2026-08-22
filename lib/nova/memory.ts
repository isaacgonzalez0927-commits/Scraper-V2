/**
 * Nova's memory: what was said, and what was learned.
 *
 * Ported from RideBy's Nova, with Supabase swapped for Sere's libSQL/Drizzle.
 * Everything is scoped to one organization. Sere is multi-tenant and one
 * shop's lessons must never leak into another shop's context.
 *
 * Two stores, on purpose:
 * - messages: the running conversation, so Nova has continuity
 * - memory: durable lessons and preferences, keyed so they update in place
 *   instead of piling up duplicates
 */

import { and, desc, eq } from "drizzle-orm";
import { db, nowISO } from "../db";
import { novaMemory, novaMessages } from "../schema";

export type NovaRole = "user" | "assistant" | "tool";

export type NovaMemoryKind = "note" | "lesson" | "preference" | "fact";

export type NovaMessage = {
  id: number;
  role: NovaRole;
  content: string;
  toolName: string;
  createdAt: string;
};

export type NovaMemoryRow = {
  id: number;
  kind: string;
  key: string;
  content: string;
  updatedAt: string;
};

export async function saveNovaMessage(
  organizationId: number,
  input: { role: NovaRole; content: string; toolName?: string },
): Promise<void> {
  await db().insert(novaMessages).values({
    organizationId,
    role: input.role,
    content: input.content.slice(0, 8000),
    toolName: input.toolName || "",
    createdAt: nowISO(),
  });
}

/** Oldest first, so it can be replayed straight into a messages array. */
export async function recentNovaMessages(
  organizationId: number,
  limit = 30,
): Promise<NovaMessage[]> {
  const rows = await db()
    .select()
    .from(novaMessages)
    .where(eq(novaMessages.organizationId, organizationId))
    .orderBy(desc(novaMessages.id))
    .limit(limit);
  return rows
    .map((row) => ({
      id: row.id,
      role: row.role as NovaRole,
      content: row.content,
      toolName: row.toolName,
      createdAt: row.createdAt,
    }))
    .reverse();
}

export async function loadNovaMemories(
  organizationId: number,
  limit = 25,
): Promise<NovaMemoryRow[]> {
  const rows = await db()
    .select()
    .from(novaMemory)
    .where(eq(novaMemory.organizationId, organizationId))
    .orderBy(desc(novaMemory.updatedAt))
    .limit(limit);
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    key: row.key,
    content: row.content,
    updatedAt: row.updatedAt,
  }));
}

/**
 * Keyed lessons update in place. Without this, "the owner prefers morning
 * follow-ups" would be stored forty times and crowd out everything else.
 */
export async function rememberNova(
  organizationId: number,
  input: { kind: NovaMemoryKind; content: string; key?: string },
): Promise<void> {
  const key = (input.key || "").trim();
  const stamp = nowISO();
  if (key) {
    const [existing] = await db()
      .select({ id: novaMemory.id })
      .from(novaMemory)
      .where(and(eq(novaMemory.organizationId, organizationId), eq(novaMemory.key, key)));
    if (existing) {
      await db()
        .update(novaMemory)
        .set({ kind: input.kind, content: input.content, updatedAt: stamp })
        .where(eq(novaMemory.id, existing.id));
      return;
    }
  }
  await db().insert(novaMemory).values({
    organizationId,
    kind: input.kind,
    key,
    content: input.content,
    createdAt: stamp,
    updatedAt: stamp,
  });
}

export async function forgetNovaThread(organizationId: number): Promise<void> {
  await db().delete(novaMessages).where(eq(novaMessages.organizationId, organizationId));
}

export function memoryBlock(memories: NovaMemoryRow[]): string {
  if (!memories.length) return "(nothing yet)";
  return memories
    .map((m) => `- [${m.kind}] ${m.key ? `${m.key}: ` : ""}${m.content}`)
    .join("\n");
}
