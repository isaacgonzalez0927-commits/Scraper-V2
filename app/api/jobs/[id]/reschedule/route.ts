import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { boot } from "@/lib/boot";
import { requireContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { jobs } from "@/lib/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await boot();
  const { org } = await requireContext();
  const { id } = await params;
  const form = await req.formData();
  const scheduledStart = String(form.get("scheduled_start") || "");
  if (scheduledStart) {
    await db()
      .update(jobs)
      .set({ scheduledStart, status: "scheduled" })
      .where(and(eq(jobs.id, Number(id)), eq(jobs.organizationId, org.id)));
  }
  return NextResponse.redirect(new URL("/calendar", req.url), 303);
}
