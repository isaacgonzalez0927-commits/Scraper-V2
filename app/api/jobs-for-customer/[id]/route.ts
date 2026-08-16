import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { boot } from "@/lib/boot";
import { requireContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { jobs } from "@/lib/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await boot();
  const { org } = await requireContext();
  const { id } = await params;
  const rows = await db()
    .select({ id: jobs.id, title: jobs.title })
    .from(jobs)
    .where(and(eq(jobs.organizationId, org.id), eq(jobs.customerId, Number(id))));
  return NextResponse.json(rows);
}
