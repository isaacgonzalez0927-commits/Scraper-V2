import { NextResponse } from "next/server";
import { boot } from "@/lib/boot";
import { currentContext } from "@/lib/auth";
import { runAssistant } from "@/lib/assistant";
import { DEMO_EMAIL } from "@/lib/seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  await boot();
  const ctx = await currentContext();
  if (!ctx) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  let message = "";
  try {
    const body = (await request.json()) as { message?: string };
    message = String(body.message || "").trim();
  } catch {
    return NextResponse.json({ error: "Send a message." }, { status: 400 });
  }
  if (!message) {
    return NextResponse.json({ error: "Say what you need." }, { status: 400 });
  }
  const reply = await runAssistant(
    ctx.org.id,
    ctx.user.name,
    ctx.org.businessType,
    message,
    new Date(),
    ctx.user.email === DEMO_EMAIL,
  );
  return NextResponse.json(reply);
}
