/**
 * The cron endpoint. Ported from RideBy's /api/nexus/tick.
 *
 * Protected by a shared secret rather than a session, because a scheduler has
 * no cookie. Runs one small tick so a scheduled call every few minutes moves
 * the pipeline without any single request doing too much.
 */

import { boot } from "@/lib/boot";
import { runTick } from "@/lib/nexus/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request): boolean {
  const secret = (process.env.NEXUS_CRON_SECRET || "").trim();
  if (!secret) return false;
  const header = request.headers.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const url = new URL(request.url);
  return bearer === secret || url.searchParams.get("secret") === secret;
}

async function handle(request: Request) {
  if (!authorized(request)) {
    return Response.json(
      { error: "Set NEXUS_CRON_SECRET and pass it as a bearer token." },
      { status: 401 },
    );
  }
  await boot();
  const jobs = Number(new URL(request.url).searchParams.get("jobs")) || undefined;
  const result = await runTick({ jobs: jobs ? Math.min(12, Math.max(1, jobs)) : undefined });
  return Response.json(result);
}

export const GET = handle;
export const POST = handle;
