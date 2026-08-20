import { NovaConsole } from "@/components/nova/NovaConsole";
import { Shell } from "@/components/Shell";
import { loadApp } from "@/lib/page";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function NovaPage() {
  const { shell, user } = await loadApp();
  const firstName = user.name.trim().split(/\s+/)[0] || user.name;
  return (
    <Shell {...shell} path="/nova" title="Nova" sub={null}>
      <NovaConsole ownerName={firstName} />
    </Shell>
  );
}
