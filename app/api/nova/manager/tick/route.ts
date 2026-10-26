/**
 * Scheduled Nova strategy cycle. Only the platform cron or trusted operator
 * automation may invoke it. Never accept a secret through a query parameter.
 */
import { boot } from "@/lib/boot";
import { runManagerCycle } from "@/lib/nova/manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const header = request.headers.get("authorization") || "";
  const provided = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const secrets = [process.env.CRON_SECRET, process.env.NEXUS_CRON_SECRET].filter(Boolean);
  if (!provided || !secrets.includes(provided)) {
    return Response.json({ error: "Unauthorized scheduler." }, { status: 401 });
  }
  await boot();
  const result = await runManagerCycle();
  return Response.json(result, { status: result.status === "failed" ? 500 : 200 });
}
