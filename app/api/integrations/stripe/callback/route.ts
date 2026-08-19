import { redirect } from "next/navigation";
import { boot } from "@/lib/boot";
import { currentContext } from "@/lib/auth";
import { saveIntegration } from "@/lib/integrations";
import { DEMO_EMAIL } from "@/lib/seed";
import { accountLabel, exchangeStripeConnectCode, readConnectState, retrieveAccount } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INTEGRATIONS_TAB = "/settings?tab=integrations";

function fail(message: string): never {
  redirect(`${INTEGRATIONS_TAB}&error=${encodeURIComponent(message)}`);
}

/**
 * Stripe sends the shop back here after they approve Connect. The signed state
 * ties the code to the logged-in company so another tab cannot steal it.
 */
export async function GET(request: Request) {
  await boot();
  const url = new URL(request.url);
  const denied = url.searchParams.get("error_description") || url.searchParams.get("error");
  if (denied) fail(denied.replace(/\+/g, " "));

  const ctx = await currentContext();
  if (!ctx) {
    redirect(`/login?error=${encodeURIComponent("Sign in again, then connect Stripe from Settings.")}`);
  }
  if (ctx.user.email === DEMO_EMAIL) {
    fail("Create your own shop to connect Stripe. The demo is shared.");
  }

  const parsed = readConnectState(url.searchParams.get("state"));
  if (!parsed || parsed.organizationId !== ctx.org.id || parsed.userId !== ctx.user.id) {
    fail("That Stripe connection expired. Try Connect Stripe again.");
  }

  const code = url.searchParams.get("code") || "";
  if (!code) fail("Stripe did not return an authorization code.");

  let label = "";
  let accountId = "";
  let accessToken = "";
  let publishableKey = "";
  let refreshToken = "";
  try {
    const token = await exchangeStripeConnectCode(code);
    accountId = token.stripe_user_id;
    accessToken = token.access_token;
    publishableKey = token.stripe_publishable_key || "";
    refreshToken = token.refresh_token || "";
    if (!accountId || !accessToken) throw new Error("Stripe did not return a connected account.");
    label = accountLabel(await retrieveAccount(accessToken));
  } catch (error) {
    fail((error as Error).message);
  }

  await saveIntegration(
    ctx.org.id,
    "stripe",
    {
      connectedVia: "oauth",
      accountId,
      accessToken,
      refreshToken,
      publishableKey,
    },
    label || accountId,
  );
  redirect(`${INTEGRATIONS_TAB}&ok=${encodeURIComponent(`Stripe connected to ${label || accountId}.`)}`);
}
