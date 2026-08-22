import { eq } from "drizzle-orm";
import {
  connectEmailAction,
  connectOpenAIAction,
  connectPaypalAction,
  connectQuickbooksAction,
  connectSquareAction,
  connectStripeAction,
  disconnectEmailAction,
  disconnectOpenAIAction,
  disconnectPaypalAction,
  disconnectQuickbooksAction,
  disconnectSquareAction,
  disconnectStripeAction,
  logoutAction,
  saveSettingsAction,
  sendTestEmailAction,
  startStripeConnectAction,
} from "@/app/actions";
import { ConnectSereButton } from "@/components/ConnectSere";
import { OpenAIKeyLink, OpenAILimitsLink, SquareKeyLink, SquareKeyTutorial } from "@/components/ConnectStripe";
import { StripeKeyTutorial } from "@/components/StripeKeyTutorial";
import { ThemeChooser } from "@/components/ThemeToggle";
import { Banner, Card } from "@/components/ui";
import { Shell } from "@/components/Shell";
import { db } from "@/lib/db";
import { integrationStatus } from "@/lib/integrations";
import { prettyDate } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { loadApp } from "@/lib/page";
import { stripeConnectEnabled } from "@/lib/stripe";
import { absoluteBaseUrl } from "@/lib/url";
import { TRADE_LIST } from "@/lib/business";
import { formatPlanPrice, PLANS } from "@/lib/pricing";
import { serviceItems } from "@/lib/schema";

const TABS = [
  { key: "company", name: "Company" },
  { key: "invoices", name: "Invoices" },
  { key: "integrations", name: "Integrations" },
  { key: "account", name: "Account" },
];

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; error?: string; ok?: string }>;
}) {
  const { org, user, shell, voice, access } = await loadApp();
  const q = await searchParams;
  const tab = TABS.some((t) => t.key === q.tab) ? (q.tab as string) : "company";
  const [services, integrations, base] = await Promise.all([
    db().select().from(serviceItems).where(eq(serviceItems.organizationId, org.id)),
    integrationStatus(org.id),
    absoluteBaseUrl(),
  ]);
  const webhookUrl = `${base}/api/webhooks/stripe`;
  const oneClick = stripeConnectEnabled();
  const demoShop = shell.isDemo;

  return (
    <Shell
      {...shell}
      path="/settings"
      title="Settings"
      sub={<p className="page-sub">Your company, your invoice defaults, and the accounts Sere connects to.</p>}
    >
      <nav className="tabs">
        {TABS.map((t) => (
          <a key={t.key} className={`tab${tab === t.key ? " active" : ""}`} href={`/settings?tab=${t.key}`}>
            {t.name}
          </a>
        ))}
      </nav>

      <Banner error={q.error} ok={q.ok} />

      {tab === "integrations" &&
      (integrations.stripe.unreadable ||
        integrations.email.unreadable ||
        integrations.square.unreadable ||
        integrations.paypal.unreadable ||
        integrations.quickbooks.unreadable ||
        integrations.openai.unreadable) ? (
        <Banner warn="Saved credentials could not be read. This happens when SERE_SECRET_KEY changes. Paste the keys again to reconnect." />
      ) : null}

      {tab === "company" ? (
        <form action={saveSettingsAction} className="card form-grid narrow">
          <input type="hidden" name="section" value="company" />
          <div className="field"><label>Business name</label><input name="name" defaultValue={org.name} /></div>
          <div className="field"><label>Phone</label><input name="phone" defaultValue={org.phone} /></div>
          <div className="field"><label>Email</label><input name="email" defaultValue={org.email} /></div>
          <div className="field"><label>Tax ID</label><input name="tax_id" defaultValue={org.taxId} /></div>
          <div className="field full">
            <label>What you do</label>
            <select name="business_type" defaultValue={org.businessType || "general"}>
              {TRADE_LIST.map((trade) => (
                <option key={trade.key} value={trade.key}>{trade.name}</option>
              ))}
            </select>
            <p className="help">
              {voice.signupHint} {voice.jobs} use {voice.worker.toLowerCase()}{" "}
              language, and {voice.customers.toLowerCase()} get {voice.short}{" "}
              fields. Starter services were added at signup — this only changes
              words and fields.
            </p>
          </div>
          <div className="field full"><label>Street address</label><input name="address_line1" defaultValue={org.addressLine1} /></div>
          <div className="field"><label>City</label><input name="city" defaultValue={org.city} /></div>
          <div className="field">
            <label>State and ZIP</label>
            <div className="field-pair">
              <input name="state" defaultValue={org.state} />
              <input name="postal_code" defaultValue={org.postalCode} />
            </div>
          </div>
          <div className="form-actions">
            <button className="btn" type="submit">Save company</button>
            <p className="help">This is the name and address printed on every invoice.</p>
          </div>
        </form>
      ) : null}

      {tab === "invoices" ? (
        <div className="grid narrow">
          <form action={saveSettingsAction} className="card form-grid narrow">
            <input type="hidden" name="section" value="invoices" />
            <div className="field"><label>Invoice prefix</label><input name="invoice_prefix" defaultValue={org.invoicePrefix} /></div>
            <div className="field"><label>Payment terms in days</label><input name="payment_terms_days" type="number" defaultValue={org.paymentTermsDays} /></div>
            <div className="field"><label>Default tax rate %</label><input name="default_tax" defaultValue={(org.defaultTaxBps / 100).toFixed(2)} /></div>
            <div className="field"><label>Next invoice number</label><input value={`${org.invoicePrefix}${org.nextInvoiceNumber}`} readOnly /></div>
            <div className="field full"><label>Default notes on every invoice</label><textarea name="default_invoice_notes" defaultValue={org.defaultInvoiceNotes} /></div>
            <div className="form-actions">
              <button className="btn" type="submit">Save invoice defaults</button>
            </div>
          </form>

          <Card title="Saved services" note="Reusable line items you can drop onto any invoice.">
            {services.length ? (
              <ul className="list">
                {services.map((s) => (
                  <li key={s.id}>
                    <div>
                      <span className="strong">{s.name}</span>
                      {s.description ? <div className="tiny">{s.description}</div> : null}
                    </div>
                    <span className="money">{formatMoney(s.unitPriceCents)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">Nothing saved yet. Add the work you quote most often.</p>
            )}
            <form action={saveSettingsAction} className="form-grid mt-2">
              <input type="hidden" name="section" value="service" />
              <div className="field"><label>Name</label><input name="service_name" placeholder="Capacitor replacement" /></div>
              <div className="field"><label>Price</label><input name="service_price" placeholder="285.00" /></div>
              <div className="field full"><label>Description</label><input name="service_description" placeholder="Parts and labor" /></div>
              <div className="form-actions">
                <button className="btn btn-secondary" type="submit">Add service</button>
              </div>
            </form>
          </Card>
        </div>
      ) : null}

      {tab === "integrations" ? (
        <div className="grid narrow">
          <Card
            id="stripe"
            title="Stripe"
            note="Read the shop's Stripe so Overview shows cash that actually landed, not just invoices you typed in."
            action={
              <span
                className={`badge badge-${
                  integrations.stripe.connected ? "paid" : integrations.stripe.unreadable ? "partial" : "draft"
                }`}
              >
                {integrations.stripe.connected
                  ? "Connected"
                  : integrations.stripe.unreadable
                    ? "Needs reconnecting"
                    : "Not connected"}
              </span>
            }
          >
            {demoShop ? (
              <Banner>
                <div>
                  <strong>This is the shared demo shop.</strong>
                  <p className="mt-1">
                    Connect Stripe from your own shop so keys are not saved where anyone can open the demo.
                  </p>
                  <p className="mt-1">
                    <ConnectSereButton />
                  </p>
                </div>
              </Banner>
            ) : null}

            {integrations.stripe.connected ? (
              <>
                <div className="kv">
                  <div className="kv-row"><span className="kv-key">Account</span><span className="kv-value">{integrations.stripe.label}</span></div>
                  {integrations.stripe.updatedAt ? (
                    <div className="kv-row"><span className="kv-key">Connected on</span><span className="kv-value">{prettyDate(integrations.stripe.updatedAt)}</span></div>
                  ) : null}
                  <div className="kv-row">
                    <span className="kv-key">Connected with</span>
                    <span className="kv-value">
                      {integrations.stripe.fromEnv
                        ? "Deployment environment variables"
                        : integrations.stripe.viaOAuth
                          ? "Connect Stripe"
                          : "Restricted key"}
                    </span>
                  </div>
                </div>
                {integrations.stripe.viaOAuth && process.env.STRIPE_WEBHOOK_SECRET ? (
                  <Banner>
                    <div>
                      <strong>Overview is reading this Stripe account.</strong>
                      <p className="mt-1">
                        Available balance, pending funds, and payouts show on Overview and Reports.
                        No webhook is needed for that.
                      </p>
                    </div>
                  </Banner>
                ) : (
                  <Banner>
                    <div>
                      <strong>Cash, invoices, and payouts.</strong>
                      <p className="mt-1">
                        Overview reads the live Stripe balance. Customers and
                        invoices you save in Sere also appear in Stripe. Add a
                        webhook below so customers and invoices created in
                        Stripe come back into Sere.
                      </p>
                    </div>
                  </Banner>
                )}
              </>
            ) : !demoShop ? (
              <>
                <StripeKeyTutorial />
                <form id="stripe-keys-form" action={connectStripeAction} className="connect-paste mt-2">
                  <input
                    className="input"
                    name="stripe_secret_key"
                    type="password"
                    placeholder="rk_test_..."
                    autoComplete="off"
                    required
                  />
                  <button className="btn btn-connect btn-stripe" type="submit">
                    Connect
                  </button>
                </form>
                <details className="disclosure">
                  <summary>Webhook, so Stripe customers, invoices, and payments come back into Sere</summary>
                  <p className="help mt-1">
                    In Stripe, Developers → Webhooks → Add endpoint. Events:{" "}
                    <code>customer.created</code>, <code>customer.updated</code>,{" "}
                    <code>customer.deleted</code>, <code>invoice.created</code>,{" "}
                    <code>invoice.paid</code>, <code>invoice.voided</code>,{" "}
                    <code>checkout.session.completed</code>.
                    Paste the <code>whsec_...</code> it gives you, then reconnect the key above
                    with this field filled in.
                  </p>
                  <div className="copy-row mt-1">
                    <span className="copy-value">{webhookUrl}</span>
                    <button className="btn btn-secondary btn-sm" type="button" data-copy={webhookUrl}>
                      Copy
                    </button>
                  </div>
                  <div className="field full mt-2">
                    <label>Webhook signing secret</label>
                    <input
                      name="stripe_webhook_secret"
                      type="password"
                      placeholder="whsec_..."
                      autoComplete="off"
                      form="stripe-keys-form"
                    />
                  </div>
                </details>
                {oneClick ? (
                  <details className="disclosure mt-2">
                    <summary>One-click Connect (optional)</summary>
                    <p className="help mt-1">
                      Needs a verified Stripe platform account. Restricted keys above work
                      without that.
                    </p>
                    <form action={startStripeConnectAction} className="mt-2">
                      <button className="btn btn-sm btn-secondary" type="submit">
                        Connect with Stripe OAuth
                      </button>
                    </form>
                  </details>
                ) : null}
              </>
            ) : null}

            {!demoShop && integrations.stripe.connected ? (
              <details className="disclosure" open={false}>
                <summary>Update restricted key</summary>
                <StripeKeyTutorial defaultOpen={false} />
                <form id="stripe-keys-update-form" action={connectStripeAction} className="form-grid mt-2">
                  <div className="field full">
                    <label>Restricted key</label>
                    <input
                      name="stripe_secret_key"
                      type="password"
                      placeholder="rk_test_... or rk_live_..."
                      autoComplete="off"
                    />
                    <p className="help">Stored encrypted. Sere shows it back to nobody, including us.</p>
                  </div>
                  <div className="field">
                    <label>Publishable key (optional)</label>
                    <input name="stripe_publishable_key" placeholder="pk_live_..." autoComplete="off" />
                  </div>
                  <div className="field">
                    <label>Webhook signing secret (optional)</label>
                    <input name="stripe_webhook_secret" type="password" placeholder="whsec_..." autoComplete="off" />
                  </div>
                  <div className="form-actions">
                    <button className="btn btn-sm" type="submit">
                      Update Stripe key
                    </button>
                  </div>
                </form>
              </details>
            ) : null}

            {integrations.stripe.connected && !integrations.stripe.fromEnv && !demoShop ? (
              <form action={disconnectStripeAction} className="mt-2">
                <button className="btn btn-ghost btn-sm" type="submit">Disconnect Stripe</button>
              </form>
            ) : null}
          </Card>

          <p className="section-label mt-1">Also works with</p>
          <p className="muted">
            Square is the same idea: paste the access token and tap Connect Square.
            Overview then shows cash that actually landed in Square. OpenAI is for
            the Sere assistant. PayPal and QuickBooks stay optional extras.
          </p>

          <Card
            id="square"
            title="Square"
              note="Read the shop's Square so Overview shows payments and payouts, not just invoices you typed in."
              action={
                <span
                  className={`badge badge-${
                    integrations.square.connected ? "paid" : integrations.square.unreadable ? "partial" : "draft"
                  }`}
                >
                  {integrations.square.connected
                    ? "Connected"
                    : integrations.square.unreadable
                      ? "Needs reconnecting"
                      : "Not connected"}
                </span>
              }
            >
              {integrations.square.connected ? (
                <>
                  <div className="kv">
                    <div className="kv-row">
                      <span className="kv-key">Account</span>
                      <span className="kv-value">{integrations.square.label}</span>
                    </div>
                    {integrations.square.updatedAt ? (
                      <div className="kv-row">
                        <span className="kv-key">Connected on</span>
                        <span className="kv-value">{prettyDate(integrations.square.updatedAt)}</span>
                      </div>
                    ) : null}
                  </div>
                  <Banner>
                    <div>
                      <strong>Overview is reading this Square account.</strong>
                      <p className="mt-1">
                        Taken this month and payouts to the bank show on Overview and Reports.
                        A webhook is only if you also want invoice checkout recorded.
                      </p>
                    </div>
                  </Banner>
                  <div className="copy-row mt-2">
                    <span className="copy-value">{`${base}/api/webhooks/square`}</span>
                    <button className="btn btn-secondary btn-sm" type="button" data-copy={`${base}/api/webhooks/square`}>
                      Copy
                    </button>
                  </div>
                  {!demoShop ? (
                    <form action={disconnectSquareAction} className="mt-2">
                      <button className="btn btn-ghost btn-sm" type="submit">Disconnect Square</button>
                    </form>
                  ) : null}
                </>
              ) : demoShop ? (
                <p className="muted">Create your shop to connect Square.</p>
              ) : (
                <>
                  <SquareKeyTutorial />
                  <p className="help">
                    Create an app if you do not have one. <SquareKeyLink />.
                  </p>
                  <form action={connectSquareAction} className="form-grid mt-2">
                    <div className="field full">
                      <label>Access token</label>
                      <input
                        name="square_access_token"
                        type="password"
                        autoComplete="off"
                        required
                        placeholder="EAAA..."
                      />
                      <p className="help">
                        Stored encrypted. Sere never shows it again. Used to read
                        payments and payouts.
                      </p>
                    </div>
                    <details className="disclosure">
                      <summary>Optional: location, sandbox, webhook</summary>
                      <div className="form-grid mt-2">
                        <div className="field">
                          <label>Location ID (optional)</label>
                          <input name="square_location_id" placeholder="L..." autoComplete="off" />
                          <p className="help">Blank uses the first active location.</p>
                        </div>
                        <div className="field">
                          <label>Webhook signature key</label>
                          <input name="square_webhook_key" type="password" autoComplete="off" />
                        </div>
                        <label className="checkbox">
                          <input type="checkbox" name="square_sandbox" value="1" />
                          Sandbox token
                        </label>
                      </div>
                    </details>
                    <div className="form-actions">
                      <button className="btn btn-connect btn-square" type="submit">
                        Connect Square
                      </button>
                    </div>
                  </form>
                </>
              )}
          </Card>

          <Card
            id="openai"
            title="Sere assistant"
            note="GPT answers in English about this shop. Completing or moving a job still goes through Sere. gpt-4o-mini plus a $5 monthly budget in OpenAI is enough."
            action={
              <span
                className={`badge badge-${
                  integrations.openai.connected ? "paid" : integrations.openai.unreadable ? "partial" : "draft"
                }`}
              >
                {integrations.openai.connected
                  ? "Connected"
                  : integrations.openai.unreadable
                    ? "Needs reconnecting"
                    : "Not connected"}
              </span>
            }
          >
            {integrations.openai.connected ? (
              <>
                <div className="kv">
                  <div className="kv-row">
                    <span className="kv-key">Account</span>
                    <span className="kv-value">{integrations.openai.label}</span>
                  </div>
                  {integrations.openai.updatedAt ? (
                    <div className="kv-row">
                      <span className="kv-key">Connected on</span>
                      <span className="kv-value">{prettyDate(integrations.openai.updatedAt)}</span>
                    </div>
                  ) : null}
                  <div className="kv-row">
                    <span className="kv-key">Connected with</span>
                    <span className="kv-value">
                      {integrations.openai.fromEnv
                        ? "Deployment environment variable"
                        : "API key"}
                    </span>
                  </div>
                </div>
                <Banner>
                  <div>
                    <strong>
                      {integrations.openai.fromEnv
                        ? "The assistant is using the deployment OpenAI key."
                        : "The assistant can use GPT on this shop."}
                    </strong>
                    <p className="mt-1">
                      {integrations.openai.fromEnv
                        ? "All shops share this key, including the demo. Set a monthly budget in OpenAI so a busy week cannot run past it. $5 is enough for gpt-4o-mini."
                        : "Questions about the board go to this shop's OpenAI account. The model cannot write jobs or invoices on its own."}{" "}
                      <OpenAILimitsLink />.
                    </p>
                  </div>
                </Banner>
                {integrations.openai.connected && !integrations.openai.fromEnv && !demoShop ? (
                  <form action={disconnectOpenAIAction} className="mt-2">
                    <button className="btn btn-ghost btn-sm" type="submit">Disconnect OpenAI</button>
                  </form>
                ) : null}
              </>
            ) : demoShop ? (
              <p className="muted">
                Create your shop to paste a shop key. A deployment{" "}
                <code>OPENAI_API_KEY</code> also turns GPT on for every shop,
                including this demo.
              </p>
            ) : (
              <>
                <p className="help">
                  Put <code>OPENAI_API_KEY</code> on the server, or paste a key
                  below. Use gpt-4o-mini and <OpenAILimitsLink /> — $5 a month
                  is plenty. Starts with <code>sk-</code> or <code>sk-proj-</code>.{" "}
                  <OpenAIKeyLink />.
                </p>
                <form action={connectOpenAIAction} className="form-grid mt-2">
                  <div className="field full">
                    <label>API key</label>
                    <input
                      name="openai_api_key"
                      type="password"
                      autoComplete="off"
                      required
                      placeholder="sk-... or sk-proj-..."
                      spellCheck={false}
                    />
                    <p className="help">
                      Stored encrypted. Sere never shows it again. Used only for
                      the assistant on this shop.
                    </p>
                  </div>
                  <details className="disclosure">
                    <summary>Optional: model</summary>
                    <div className="field full mt-2">
                      <label>Model</label>
                      <input
                        name="openai_model"
                        defaultValue="gpt-4o-mini"
                        placeholder="gpt-4o-mini"
                        autoComplete="off"
                      />
                      <p className="help">Leave gpt-4o-mini if you are capping spend at a few dollars a month.</p>
                    </div>
                  </details>
                  <div className="form-actions">
                    <button className="btn btn-connect btn-openai" type="submit">
                      Connect OpenAI
                    </button>
                  </div>
                </form>
              </>
            )}
            {!demoShop && integrations.openai.fromEnv ? (
              <details className="disclosure">
                <summary>Or paste a shop key to bill this shop separately</summary>
                <form action={connectOpenAIAction} className="form-grid mt-2">
                  <div className="field full">
                    <label>API key</label>
                    <input
                      name="openai_api_key"
                      type="password"
                      autoComplete="off"
                      required
                      placeholder="sk-... or sk-proj-..."
                      spellCheck={false}
                    />
                  </div>
                  <div className="form-actions">
                    <button className="btn" type="submit">Use this shop&apos;s key</button>
                  </div>
                </form>
              </details>
            ) : null}
          </Card>

          <Card
            title="PayPal"
              note="Checkout for invoices. Shown under Stripe when both are connected."
              action={
                <span
                  className={`badge badge-${
                    integrations.paypal.connected ? "paid" : integrations.paypal.unreadable ? "partial" : "draft"
                  }`}
                >
                  {integrations.paypal.connected
                    ? "Connected"
                    : integrations.paypal.unreadable
                      ? "Needs reconnecting"
                      : "Not connected"}
                </span>
              }
            >
              {integrations.paypal.connected ? (
                <>
                  <div className="kv">
                    <div className="kv-row">
                      <span className="kv-key">Account</span>
                      <span className="kv-value">{integrations.paypal.label}</span>
                    </div>
                    {integrations.paypal.updatedAt ? (
                      <div className="kv-row">
                        <span className="kv-key">Connected on</span>
                        <span className="kv-value">{prettyDate(integrations.paypal.updatedAt)}</span>
                      </div>
                    ) : null}
                  </div>
                  <div className="copy-row mt-2">
                    <span className="copy-value">{`${base}/api/webhooks/paypal`}</span>
                    <button className="btn btn-secondary btn-sm" type="button" data-copy={`${base}/api/webhooks/paypal`}>
                      Copy
                    </button>
                  </div>
                  {!demoShop ? (
                    <form action={disconnectPaypalAction} className="mt-2">
                      <button className="btn btn-ghost btn-sm" type="submit">Disconnect PayPal</button>
                    </form>
                  ) : null}
                </>
              ) : demoShop ? (
                <p className="muted">Create your shop to connect PayPal.</p>
              ) : (
                <form action={connectPaypalAction} className="form-grid">
                  <div className="field full">
                    <label>Client ID</label>
                    <input name="paypal_client_id" autoComplete="off" required />
                  </div>
                  <div className="field full">
                    <label>Client secret</label>
                    <input name="paypal_client_secret" type="password" autoComplete="off" required />
                  </div>
                  <div className="field full">
                    <label>Webhook ID (optional)</label>
                    <input name="paypal_webhook_id" autoComplete="off" />
                  </div>
                  <label className="checkbox">
                    <input type="checkbox" name="paypal_sandbox" value="1" />
                    Sandbox
                  </label>
                  <div className="form-actions">
                    <button className="btn btn-connect btn-secondary" type="submit">Connect PayPal</button>
                  </div>
                </form>
              )}
          </Card>

          <Card
            title="QuickBooks"
              note="Books link only. Invoices and card checkout still live in Sere."
              action={
                <span
                  className={`badge badge-${
                    integrations.quickbooks.connected ? "paid" : integrations.quickbooks.unreadable ? "partial" : "draft"
                  }`}
                >
                  {integrations.quickbooks.connected
                    ? "Connected"
                    : integrations.quickbooks.unreadable
                      ? "Needs reconnecting"
                      : "Not connected"}
                </span>
              }
            >
              {integrations.quickbooks.connected ? (
                <>
                  <div className="kv">
                    <div className="kv-row">
                      <span className="kv-key">Company</span>
                      <span className="kv-value">{integrations.quickbooks.label}</span>
                    </div>
                    {integrations.quickbooks.updatedAt ? (
                      <div className="kv-row">
                        <span className="kv-key">Connected on</span>
                        <span className="kv-value">{prettyDate(integrations.quickbooks.updatedAt)}</span>
                      </div>
                    ) : null}
                  </div>
                  {!demoShop ? (
                    <form action={disconnectQuickbooksAction} className="mt-2">
                      <button className="btn btn-ghost btn-sm" type="submit">Disconnect QuickBooks</button>
                    </form>
                  ) : null}
                </>
              ) : demoShop ? (
                <p className="muted">Create your shop to connect QuickBooks.</p>
              ) : (
                <form action={connectQuickbooksAction} className="form-grid">
                  <div className="field full">
                    <label>Access token</label>
                    <input name="quickbooks_access_token" type="password" autoComplete="off" required />
                  </div>
                  <div className="field full">
                    <label>Company (realm) ID</label>
                    <input name="quickbooks_realm_id" autoComplete="off" required />
                  </div>
                  <label className="checkbox">
                    <input type="checkbox" name="quickbooks_sandbox" value="1" />
                    Sandbox
                  </label>
                  <div className="form-actions">
                    <button className="btn btn-connect btn-secondary" type="submit">Connect QuickBooks</button>
                  </div>
                </form>
              )}
          </Card>

          <Card
            title="Email"
            note="Send invoices straight to your customers instead of copying a link."
            action={
              <span
                className={`badge badge-${
                  integrations.email.connected ? "paid" : integrations.email.unreadable ? "partial" : "draft"
                }`}
              >
                {integrations.email.connected
                  ? "Connected"
                  : integrations.email.unreadable
                    ? "Needs reconnecting"
                    : "Not connected"}
              </span>
            }
          >
            {integrations.email.connected ? (
              <div className="kv">
                <div className="kv-row"><span className="kv-key">Sending as</span><span className="kv-value">{integrations.email.label}</span></div>
                <div className="kv-row"><span className="kv-key">Source</span><span className="kv-value">{integrations.email.fromEnv ? "Deployment environment variables" : "Saved in Sere"}</span></div>
              </div>
            ) : (
              <Banner>
                <div>
                  <strong>Two steps.</strong>
                  <p className="mt-1">
                    1. Create a free account at resend.com, add your domain, and add the DNS records they show you.
                    <br />
                    2. Create an API key and paste it below with the address you want invoices to come from.
                  </p>
                </div>
              </Banner>
            )}

            <form action={connectEmailAction} className="form-grid">
              <div className="field full">
                <label>Resend API key</label>
                <input name="email_api_key" type="password" placeholder="re_..." autoComplete="off" />
              </div>
              <div className="field">
                <label>From address</label>
                <input name="email_from" type="email" placeholder={`billing@${(org.email.split("@")[1] || "yourshop.com")}`} />
              </div>
              <div className="field">
                <label>From name</label>
                <input name="email_from_name" defaultValue={org.name} />
              </div>
              <div className="field full">
                <label>Reply to (optional)</label>
                <input name="email_reply_to" type="email" placeholder={org.email} />
              </div>
              <div className="form-actions">
                <button className="btn" type="submit">
                  {integrations.email.connected ? "Update email settings" : "Connect email"}
                </button>
              </div>
            </form>

            {integrations.email.connected ? (
              <div className="row mt-2">
                <form action={sendTestEmailAction}>
                  <button className="btn btn-secondary btn-sm" type="submit">Send test to {user.email}</button>
                </form>
                {!integrations.email.fromEnv ? (
                  <form action={disconnectEmailAction}>
                    <button className="btn btn-ghost btn-sm" type="submit">Disconnect email</button>
                  </form>
                ) : null}
              </div>
            ) : null}
          </Card>

          <Card title="Your domain" note="The address your customers see on invoice links.">
            <div className="kv">
              <div className="kv-row">
                <span className="kv-key">Public address</span>
                <span className="kv-value">{base || "Not detected"}</span>
              </div>
              <div className="kv-row">
                <span className="kv-key">Set by</span>
                <span className="kv-value">
                  {process.env.SERE_PUBLIC_BASE_URL ? "SERE_PUBLIC_BASE_URL" : "The host of this request"}
                </span>
              </div>
            </div>
            <Banner>
              <div>
                <strong>To use your own domain.</strong>
                <p className="mt-1">
                  Add the domain to your Vercel project, point your registrar at Vercel with the records
                  Vercel lists, then set <code>SERE_PUBLIC_BASE_URL</code> to{" "}
                  <code>https://yourdomain.com</code> and redeploy. Invoice links and the Stripe webhook
                  URL then use your domain.
                </p>
              </div>
            </Banner>
          </Card>
        </div>
      ) : null}

      {tab === "account" ? (
        <div className="grid narrow">
          <form action={saveSettingsAction} className="card form-grid narrow">
            <input type="hidden" name="section" value="account" />
            <div className="field"><label>Your name</label><input name="user_name" defaultValue={user.name} /></div>
            <div className="field"><label>Email</label><input name="user_email" type="email" defaultValue={user.email} readOnly /></div>
            <div className="field"><label>Current password</label><input name="current_password" type="password" autoComplete="current-password" /></div>
            <div className="field"><label>New password</label><input name="new_password" type="password" minLength={8} autoComplete="new-password" /></div>
            <div className="form-actions">
              <button className="btn" type="submit">Save account</button>
              <p className="help">Leave the password fields empty to keep your current password.</p>
            </div>
          </form>
          <Card
            title="Plan"
            note={
              demoShop
                ? "Harbor Air is the demo. It is not on a trial."
                : access.status === "expired"
                  ? "Trial ended. You can look. When billing opens, pick Shop or Crew and the shop opens again."
                  : access.status === "trial"
                    ? `${access.banner} Shop is $39/month after that. We are not taking cards yet.`
                    : `You are on ${access.plan === "crew" ? "Crew" : "Shop"}.`
            }
          >
            <ul className="plan-settings">
              {PLANS.map((plan) => (
                <li key={plan.key}>
                  <div>
                    <strong>{plan.name}</strong>
                    <span className="tiny">{plan.priceNote}</span>
                  </div>
                  <span className="money">{formatPlanPrice(plan)}/mo</span>
                </li>
              ))}
            </ul>
            <p className="help mt-2">
              14 days of the book, then the shop freezes. Shop is live Stripe or
              Square cash. Crew is seats plus the assistant; texts and the tech
              phone are next. Card fees stay with your processor.
            </p>
          </Card>
          <Card title="Appearance">
            <p className="help">
              Light, dark, or match the phone. This stays on this browser.
            </p>
            <div className="mt-2">
              <ThemeChooser />
            </div>
          </Card>
          <Card title="Session">
            <form action={logoutAction}>
              <button className="btn btn-secondary" type="submit">Sign out</button>
            </form>
          </Card>
        </div>
      ) : null}
    </Shell>
  );
}
