import { redirect } from "next/navigation";
import { requireContext } from "@/lib/auth";
import { boot } from "@/lib/boot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  await boot();
  await requireContext();
  redirect("/overview?guide=open");
}
