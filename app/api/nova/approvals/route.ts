/**
 * Explicit operator authorization for outbound prospect contact.
 * An AI review score can only recommend a draft; it can never approve sending.
 */
import { currentContext } from "@/lib/auth";
import { boot } from "@/lib/boot";
import { db, nowISO } from "@/lib/db";
import { logAction } from "@/lib/nexus/jobs";
import { isNovaOperator } from "@/lib/nova/operator";
import { nexusCompanies, nexusDrafts } from "@/lib/schema";
import { and, desc, eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authorized(request: Request): Promise<boolean> {
  const ctx = await currentContext(request);
  return Boolean(ctx && isNovaOperator(ctx.user.email));
}

export async function GET(request: Request) {
  await boot();
  if (!(await authorized(request))) return Response.json({ error: "Operator access required." }, { status: 403 });
  const rows = await db()
    .select({
      id: nexusDrafts.id, company: nexusCompanies.name, trade: nexusCompanies.trade,
      email: nexusDrafts.toEmail, subject: nexusDrafts.subject, body: nexusDrafts.body,
      score: nexusDrafts.confidence, reviewedAt: nexusDrafts.reviewedAt,
    })
    .from(nexusDrafts)
    .innerJoin(nexusCompanies, eq(nexusDrafts.companyId, nexusCompanies.id))
    .where(eq(nexusDrafts.status, "pending_approval"))
    .orderBy(desc(nexusDrafts.id)).limit(30);
  return Response.json({ drafts: rows });
}

export async function POST(request: Request) {
  await boot();
  if (!(await authorized(request))) return Response.json({ error: "Operator access required." }, { status: 403 });
  let body: { id?: unknown; action?: unknown };
  try { body = await request.json() as { id?: unknown; action?: unknown }; }
  catch { return Response.json({ error: "Expected JSON." }, { status: 400 }); }
  const id = Number(body.id);
  const action = body.action;
  if (!Number.isSafeInteger(id) || id < 1 || (action !== "approve" && action !== "reject")) {
    return Response.json({ error: "Expected draft id and approve/reject." }, { status: 400 });
  }
  const stamp = nowISO();
  const [changed] = await db().update(nexusDrafts).set({
    status: action === "approve" ? "approved" : "rejected",
    humanApprovedAt: action === "approve" ? stamp : null,
    rejectionReason: action === "reject" ? "Operator rejected." : "",
    updatedAt: stamp,
  }).where(and(eq(nexusDrafts.id, id), eq(nexusDrafts.status, "pending_approval")))
    .returning({ id: nexusDrafts.id });
  if (!changed) return Response.json({ error: "Draft is no longer awaiting approval." }, { status: 409 });
  await logAction({
    action: action === "approve" ? "outreach.operator.approved" : "outreach.operator.rejected",
    entityType: "draft", entityId: id, actor: "operator",
    detail: action === "approve" ? "Human approved this exact reviewed draft." : "Human rejected the draft.",
  });
  return Response.json({ ok: true, id, status: action === "approve" ? "approved" : "rejected" });
}
