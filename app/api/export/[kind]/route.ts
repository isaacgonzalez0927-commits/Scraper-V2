import { NextResponse } from "next/server";
import { boot } from "@/lib/boot";
import { currentContext } from "@/lib/auth";
import { buildExport, isExportKind } from "@/lib/export";
import { isoDate } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ kind: string }> },
) {
  await boot();
  const ctx = await currentContext();
  if (!ctx) {
    return NextResponse.redirect(new URL("/login", _request.url));
  }
  const { kind } = await context.params;
  if (!isExportKind(kind)) {
    return NextResponse.json({ error: "Unknown export." }, { status: 404 });
  }
  const { filename, body } = await buildExport(ctx.org.id, kind, isoDate(new Date()));
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
