import { eq } from "drizzle-orm";
import {
  connectEmailAction,
  connectStripeAction,
  disconnectEmailAction,
  disconnectStripeAction,
  logoutAction,
  saveSettingsAction,
  sendTestEmailAction,
} from "@/app/actions";
import { Banner, Card } from "@/components/ui";
import { Shell } from "@/components/Shell";
import { db } from "@/lib/db";
import { integrationStatus } from "@/lib/integrations";
import { prettyDate } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { loadApp } from "@/lib/page";
import { absoluteBaseUrl } from "@/lib/url";
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
  const { org, user, shell } = await loadApp();
  const q = await searchParams;
  const tab = TABS.some((t) => t.key === q.tab) ? (q.tab as string) : "company";
  const [services, integrations, base] = await Promise.all([
    db().select().from(serviceItems).where(eq(serviceItems.organizationId, org.id)),
    integrationStatus(org.id),
    absoluteBaseUrl(),
  ]);
  const webhookUrl = `${base}/api/webhooks/stripe`;

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

      {tab === "integrations" && (integrations.stripe.unreadable || integrations.email.unreadable) ? (
        <Banner warn="Saved credentials could not be read. This happens when SERE_SECRET_KEY changes. Paste the keys again to reconnect." />
      ) : null}

      {tab === "company" ? (
        <form action={saveSettingsAction} className="card form-grid narrow">
          <input type="hidden" name="section" value="company" />
          <div className="field"><label>Business name</label><input name="name" defaultValue={org.name} /></div>
          <div className="field"><label>Phone</label><input name="phone" defaultValue={org.phone} /></div>
          <div className="field"><label>Email</label><input name="email" defaultValue={org.email} /></div>
          <div className="field"><label>Tax ID</label><input name="tax_id" defaultValue={org.taxId} /></div>
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
            title="Stripe"
            note="Let customers pay an invoice by card. The money lands in your own Stripe account."
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
            {integrations.stripe.connected ? (
              <>
                <div className="kv">
                  <div className="kv-row"><span className="kv-key">Account</span><span className="kv-value">{integrations.stripe.label}</span></div>
                  {integrations.stripe.updatedAt ? (
                    <div className="kv-row"><span className="kv-key">Connected on</span><span className="kv-value">{prettyDate(integrations.stripe.updatedAt)}</span></div>
                  ) : null}
                  <div className="kv-row"><span className="kv-key">Source</span><span className="kv-value">{integrations.stripe.fromEnv ? "Deployment environment variables" : "Saved in Sere"}</span></div>
                </div>
                <Banner>
                  <div>
                    <strong>Send Stripe your webhook.</strong>
                    <p className="mt-1">
                      In Stripe, open Developers, then Webhooks, then add this endpoint and select the
                      event <code>checkout.session.completed</code>.
                    </p>
                    <div className="copy-row mt-1">
                      <span className="copy-value">{webhookUrl}</span>
                      <button className="btn btn-secondary btn-sm" type="button" data-copy={webhookUrl}>Copy</button>
                    </div>
                    <p className="mt-1">
                      Paste the signing secret it gives you (<code>whsec_...</code>) into the form below.
                      Payments still get recorded without it, but the webhook is what catches a customer
                      who closes the tab mid payment.
                    </p>
                  </div>
                </Banner>
              </>
            ) : (
              <Banner>
                <div>
                  <strong>Three steps.</strong>
                  <p className="mt-1">
                    1. Create a Stripe account at stripe.com and finish their business verification.
                    <br />
                    2. In Stripe, open Developers, then API keys, and copy your secret key.
                    <br />
                    3. Paste it below. Use a test key first if you want to try a fake card.
                  </p>
                </div>
              </Banner>
            )}

            <form action={connectStripeAction} className="form-grid">
              <div className="field full">
                <label>Secret key</label>
                <input name="stripe_secret_key" type="password" placeholder="sk_live_..." autoComplete="off" />
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
                <button className="btn" type="submit">
                  {integrations.stripe.connected ? "Update Stripe keys" : "Connect Stripe"}
                </button>
                <p className="help">Sere calls Stripe once to confirm the key before saving it.</p>
              </div>
            </form>

            {integrations.stripe.connected && !integrations.stripe.fromEnv ? (
              <form action={disconnectStripeAction} className="mt-2">
                <button className="btn btn-ghost btn-sm" type="submit">Disconnect Stripe</button>
              </form>
            ) : null}
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
