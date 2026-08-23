import { NovaConsole } from "@/components/nova/NovaConsole";
import { requireContext } from "@/lib/auth";
import { NOVA_FORBIDDEN, NOVA_NAME, NOVA_PATH, isNovaOperator } from "@/lib/nova/operator";
import { SERENITY_PATH } from "@/lib/serenity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function NovaPage() {
  const ctx = await requireContext();
  const firstName = ctx.user.name.trim().split(/\s+/)[0] || ctx.user.name;

  if (!isNovaOperator(ctx.user.email)) {
    return (
      <main className="nova-gate">
        <p className="nova-gate-kicker">Sere</p>
        <h1>Nova is not Serenity</h1>
        <p>{NOVA_FORBIDDEN}</p>
        <p>
          Serenity helps you run this shop: the board, the books, the jobs.
          Nova is a separate operator tool and is not part of your shop.
        </p>
        <a className="btn" href={SERENITY_PATH}>
          Go to Serenity
        </a>
      </main>
    );
  }

  return (
    <main className="nova-desk">
      <p className="nova-desk-kicker">
        Operator only · {NOVA_PATH} · not a shop page ·{" "}
        <a href="/overview">Shop</a>
      </p>
      <NovaConsole kind="nova" ownerName={firstName} />
    </main>
  );
}
