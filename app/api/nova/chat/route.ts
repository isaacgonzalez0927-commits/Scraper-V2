/**
 * Nova's streaming chat endpoint.
 *
 * Server-sent events so tokens land as they are written rather than after a
 * long silence. Ported from RideBy's /api/nova/chat, minus the SDK.
 */

import { currentContext } from "@/lib/auth";
import { boot } from "@/lib/boot";
import { NovaError, runNova } from "@/lib/nova/chat";
import { DEMO_EMAIL } from "@/lib/seed";
import { ensureTrialClock, shopAccess } from "@/lib/trial";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  await boot();
  const ctx = await currentContext();
  if (!ctx) return Response.json({ error: "Sign in first." }, { status: 401 });

  let message = "";
  try {
    const body = (await request.json()) as { message?: string };
    message = String(body.message || "").trim();
  } catch {
    return Response.json({ error: "Send a message." }, { status: 400 });
  }
  if (!message) return Response.json({ error: "Say what you need." }, { status: 400 });

  const isDemo = ctx.user.email === DEMO_EMAIL;
  const org = await ensureTrialClock(ctx.org, isDemo);
  const access = shopAccess(org, isDemo);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      try {
        const result = await runNova(
          {
            organizationId: org.id,
            isDemo,
            writable: !access.frozen && !isDemo,
            now: new Date(),
            ownerName: ctx.user.name.trim().split(/\s+/)[0] || ctx.user.name,
            shopName: org.name,
          },
          message,
          { onDelta: (delta) => send("delta", { delta }) },
        );
        send("done", {
          reply: result.reply,
          tools: result.toolCalls.map((call) => call.name),
        });
      } catch (error) {
        const text =
          error instanceof NovaError
            ? error.message
            : `Nova hit a problem: ${(error as Error).message}`;
        send("error", { error: text });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
