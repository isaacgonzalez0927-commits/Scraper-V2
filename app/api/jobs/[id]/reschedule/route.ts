import { NextResponse } from "next/server";
import { boot } from "@/lib/boot";
import { requireWritableContext } from "@/lib/trial";
import { scheduleJob } from "@/lib/operations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await boot();
  const { org } = await requireWritableContext("/calendar");
  const { id } = await params;
  const form = await req.formData();
  const scheduledStart = String(form.get("scheduled_start") || "");
  if (scheduledStart) {
    try { await scheduleJob(org.id, Number(id), { start: scheduledStart }); }
    catch (error) {
      const url=new URL("/calendar",req.url);
      url.searchParams.set("error",error instanceof Error?error.message:"This job could not be scheduled.");
      return NextResponse.redirect(url,303);
    }
  }
  return NextResponse.redirect(new URL("/calendar", req.url), 303);
}
