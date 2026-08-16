import { eq } from "drizzle-orm";
import { logoutAction, saveSettingsAction } from "@/app/actions";
import { Flash } from "@/components/ui";
import { Shell } from "@/components/Shell";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { loadApp } from "@/lib/page";
import { serviceItems } from "@/lib/schema";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; error?: string }>;
}) {
  const { org, user, shell } = await loadApp();
  const q = await searchParams;
  const tab = q.tab || "company";
  const services = await db().select().from(serviceItems).where(eq(serviceItems.organizationId, org.id));
  const stripeReady = Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PUBLISHABLE_KEY);
  const smtpReady = Boolean(process.env.SERE_SMTP_HOST);

  return (
    <Shell {...shell} path="/settings" title="Settings">
      <Flash error={q.error} />
      <div className="filters">
        {["company", "invoices", "payments", "account"].map((key) => (
          <a key={key} className={`chip ${tab === key ? "active" : ""}`} href={`/settings?tab=${key}`}>
            {key[0].toUpperCase() + key.slice(1)}
          </a>
        ))}
      </div>

      {tab === "company" ? (
        <form action={saveSettingsAction} className="card form-grid">
          <input type="hidden" name="section" value="company" />
          <div className="field"><label>Business name</label><input name="name" defaultValue={org.name} /></div>
          <div className="field"><label>Phone</label><input name="phone" defaultValue={org.phone} /></div>
          <div className="field"><label>Email</label><input name="email" defaultValue={org.email} /></div>
          <div className="field"><label>Tax ID</label><input name="tax_id" defaultValue={org.taxId} /></div>
          <div className="field full"><label>Address</label><input name="address_line1" defaultValue={org.addressLine1} /></div>
          <div className="field"><label>City</label><input name="city" defaultValue={org.city} /></div>
          <div className="field">
            <label>State / ZIP</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input name="state" defaultValue={org.state} />
              <input name="postal_code" defaultValue={org.postalCode} />
            </div>
          </div>
          <div className="field full"><button className="btn" type="submit">Save company</button></div>
        </form>
      ) : null}

      {tab === "invoices" ? (
        <>
          <form action={saveSettingsAction} className="card form-grid">
            <input type="hidden" name="section" value="invoices" />
            <div className="field"><label>Invoice prefix</label><input name="invoice_prefix" defaultValue={org.invoicePrefix} /></div>
            <div className="field"><label>Payment terms (days)</label><input name="payment_terms_days" type="number" defaultValue={org.paymentTermsDays} /></div>
            <div className="field"><label>Default tax %</label><input name="default_tax" defaultValue={(org.defaultTaxBps / 100).toFixed(2)} /></div>
            <div className="field full"><label>Default notes</label><textarea name="default_invoice_notes" defaultValue={org.defaultInvoiceNotes} /></div>
            <div className="field full"><button className="btn" type="submit">Save invoice defaults</button></div>
          </form>
          <form action={saveSettingsAction} className="card form-grid" style={{ marginTop: 14 }}>
            <input type="hidden" name="section" value="service" />
            <div className="field full"><strong>Reusable services</strong></div>
            {services.map((s) => (
              <p key={s.id}>{s.name} · {formatMoney(s.unitPriceCents)}</p>
            ))}
            <div className="field"><label>Name</label><input name="service_name" placeholder="Capacitor replacement" /></div>
            <div className="field"><label>Price</label><input name="service_price" placeholder="285.00" /></div>
            <div className="field full"><label>Description</label><input name="service_description" /></div>
            <div className="field full"><button className="btn btn-secondary" type="submit">Add service</button></div>
          </form>
        </>
      ) : null}

      {tab === "payments" ? (
        <section className="card">
          <div className="card-title">Payment provider</div>
          {stripeReady ? (
            <p>Stripe keys are present. Online card checkout can be wired to the public invoice page.</p>
          ) : (
            <>
              <p>Online payments are not connected yet. Sere still records card, ACH, cash, and check by hand.</p>
              <div className="notice">
                Required environment variables for Stripe:<br />
                <code>STRIPE_SECRET_KEY</code><br />
                <code>STRIPE_PUBLISHABLE_KEY</code><br />
                <code>STRIPE_WEBHOOK_SECRET</code>
              </div>
            </>
          )}
          <p className="tiny" style={{ marginTop: 12 }}>
            Email invoices need <code>SERE_SMTP_HOST</code>, <code>SERE_SMTP_PORT</code>, <code>SERE_SMTP_USER</code>, <code>SERE_SMTP_PASSWORD</code>, <code>SERE_SMTP_FROM</code>.
            {smtpReady ? " SMTP is configured." : " SMTP is not configured — send will mark the invoice sent and show the share link."}
          </p>
        </section>
      ) : null}

      {tab === "account" ? (
        <>
          <form action={saveSettingsAction} className="card form-grid">
            <input type="hidden" name="section" value="account" />
            <div className="field"><label>Name</label><input name="user_name" defaultValue={user.name} /></div>
            <div className="field"><label>Email</label><input name="user_email" type="email" defaultValue={user.email} readOnly /></div>
            <div className="field"><label>Current password</label><input name="current_password" type="password" /></div>
            <div className="field"><label>New password</label><input name="new_password" type="password" minLength={8} /></div>
            <div className="field full"><button className="btn" type="submit">Save account</button></div>
          </form>
          <form action={logoutAction} style={{ marginTop: 12 }}>
            <button className="btn btn-ghost" type="submit">Sign out</button>
          </form>
        </>
      ) : null}
    </Shell>
  );
}
