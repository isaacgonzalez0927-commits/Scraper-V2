import { NextResponse } from "next/server";
import { boot } from "@/lib/boot";
import { requireContext } from "@/lib/auth";
import { searchOrg } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  await boot();
  const { org } = await requireContext();
  const q = new URL(req.url).searchParams.get("q") || "";
  if (q.trim().length < 2) {
    return NextResponse.json({ customers: [], jobs: [], invoices: [] });
  }
  return NextResponse.json(await searchOrg(org.id, q.trim()));
}
