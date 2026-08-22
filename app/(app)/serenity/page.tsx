import { NovaConsole } from "@/components/nova/NovaConsole";
import { Shell } from "@/components/Shell";
import { loadApp } from "@/lib/page";
import { SERENITY_NAME, SERENITY_PATH } from "@/lib/serenity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function SerenityPage() {
  const { shell, user } = await loadApp();
  const firstName = user.name.trim().split(/\s+/)[0] || user.name;
  return (
    <Shell {...shell} path={SERENITY_PATH} title={SERENITY_NAME} sub={null}>
      <NovaConsole ownerName={firstName} />
    </Shell>
  );
}
