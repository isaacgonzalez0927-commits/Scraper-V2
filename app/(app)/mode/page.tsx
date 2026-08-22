import { chooseShopModeAction } from "@/app/actions";
import { Banner, Card } from "@/components/ui";
import { Shell } from "@/components/Shell";
import { loadApp } from "@/lib/page";
import { DESK_MODE_NAME, parseShopMode, shopModeLabel } from "@/lib/shop-mode";

export default async function ModePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { shell } = await loadApp();
  const q = await searchParams;
  const mode = parseShopMode(shell.shopMode);
  const left = mode !== "sandbox";

  return (
    <Shell
      {...shell}
      path="/mode"
      title="How the shop runs"
      sub={
        <p className="page-sub">
          You are in {shopModeLabel(mode)}. Sandbox is practice, like Stripe test
          mode. At the end of setup, pick Live or {DESK_MODE_NAME}.
        </p>
      }
    >
      <Banner error={q.error} ok={q.ok} />

      {left ? (
        <Banner>
          <div>
            <strong>This shop already left Sandbox.</strong>
            <p className="mt-1">
              You can still switch. Live wants Stripe or Square. {DESK_MODE_NAME}{" "}
              stays live with no processor.
            </p>
          </div>
        </Banner>
      ) : (
        <Banner>
          <div>
            <strong>Sandbox is for practice.</strong>
            <p className="mt-1">
              Use test keys only. The customers and invoices you already added
              stay in this shop when you leave.
            </p>
          </div>
        </Banner>
      )}

      <div className="grid mode-grid">
        <Card
          title="Go live"
          note="Connect Stripe or Square. Overview then shows cash that actually landed."
        >
          <p className="help">
            Restricted Stripe keys or a Square token. Never paste a full{" "}
            <code>sk_</code> key.
          </p>
          <form action={chooseShopModeAction} className="mt-2">
            <input type="hidden" name="mode" value="live" />
            <button className="btn" type="submit">
              Go live and connect
            </button>
          </form>
        </Card>

        <Card
          title={DESK_MODE_NAME}
          note="Live shop. No integrations. Less useful until you connect."
        >
          <p className="help">
            Real customers and real invoices. You type payments in. Overview
            will not show money that actually landed in Stripe or Square.
          </p>
          <form action={chooseShopModeAction} className="mt-2">
            <input type="hidden" name="mode" value="desk" />
            <button className="btn btn-secondary" type="submit">
              Continue in {DESK_MODE_NAME}
            </button>
          </form>
        </Card>
      </div>
    </Shell>
  );
}
