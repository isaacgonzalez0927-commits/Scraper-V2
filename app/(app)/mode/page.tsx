import { chooseShopModeAction } from "@/app/actions";
import {
  CONNECT_QUICKBOOKS_HREF,
  CONNECT_SQUARE_HREF,
  CONNECT_STRIPE_HREF,
  CreateSereKeyButton,
} from "@/components/ConnectStripe";
import { Banner } from "@/components/ui";
import { Shell } from "@/components/Shell";
import { loadApp } from "@/lib/page";
import { parseShopMode } from "@/lib/shop-mode";

export default async function ModePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { shell } = await loadApp();
  const q = await searchParams;
  const mode = parseShopMode(shell.shopMode);
  const inSandbox = mode === "sandbox";

  return (
    <Shell {...shell} path="/mode" title="">
      <Banner error={q.error} ok={q.ok} />

      <section className="mode-live">
        <h1 className="mode-live-title">
          Connect a payment platform to continue in Live
        </h1>
        <p className="mode-live-sub">
          {inSandbox
            ? "Create a Sere Stripe key with the permissions already filled. Then paste it in Sere."
            : "This shop already left Sandbox. You can still connect a processor."}
        </p>

        <div className="mode-live-primary">
          <CreateSereKeyButton live className="btn btn-connect btn-stripe btn-connect-hero" />
          <a className="mode-live-next" href={CONNECT_STRIPE_HREF}>
            Then paste the key in Sere
          </a>
        </div>

        <div className="mode-live-alts" aria-label="Other connections">
          <a className="btn btn-connect btn-stripe btn-sm" href={CONNECT_STRIPE_HREF}>
            Stripe
          </a>
          <a className="btn btn-connect btn-square btn-sm" href={CONNECT_SQUARE_HREF}>
            Square
          </a>
          <a className="btn btn-connect btn-quickbooks btn-sm" href={CONNECT_QUICKBOOKS_HREF}>
            QuickBooks
          </a>
        </div>

        {inSandbox ? (
          <form action={chooseShopModeAction} className="mode-live-skip">
            <input type="hidden" name="mode" value="desk" />
            <button className="btn btn-ghost btn-sm" type="submit">
              Continue without a processor
            </button>
          </form>
        ) : null}
      </section>
    </Shell>
  );
}
