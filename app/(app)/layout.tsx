import { boot } from "@/lib/boot";
import { requireContext } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await boot();
  await requireContext();
  return children;
}
