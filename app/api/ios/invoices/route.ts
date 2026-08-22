import { iosInvoices, requireIosContext } from "@/lib/ios";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const ctx = await requireIosContext(request);
  if (!ctx) return Response.json({ error: "Sign in first." }, { status: 401 });
  return Response.json({ invoices: await iosInvoices(ctx.org.id) });
}
