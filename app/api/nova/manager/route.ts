import { currentContext } from "@/lib/auth";
import { boot } from "@/lib/boot";
import { managerStatus, runManagerCycle, setManagerGoal } from "@/lib/nova/manager";
import { isNovaOperator } from "@/lib/nova/operator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function authorized(request: Request): Promise<boolean> {
  const ctx = await currentContext(request);
  return Boolean(ctx && isNovaOperator(ctx.user.email));
}

export async function GET(request: Request) {
  await boot();
  if (!(await authorized(request))) return Response.json({ error: "Operator access required." }, { status: 403 });
  return Response.json(await managerStatus());
}

export async function POST(request: Request) {
  await boot();
  if (!(await authorized(request))) return Response.json({ error: "Operator access required." }, { status: 403 });
  let body: { action?: string; goal?: string };
  try { body = await request.json() as { action?: string; goal?: string }; }
  catch { return Response.json({ error: "Expected JSON." }, { status: 400 }); }
  if (body.action === "run") {
    const result = await runManagerCycle();
    return Response.json(result, { status: result.status === "failed" ? 500 : 200 });
  }
  if (body.action === "set_goal" && typeof body.goal === "string") {
    try { return Response.json({ goal: await setManagerGoal(body.goal) }); }
    catch (error) { return Response.json({ error: (error as Error).message }, { status: 400 }); }
  }
  return Response.json({ error: "Unknown manager action." }, { status: 400 });
}
