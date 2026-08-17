# Connect your domain

Sere runs on Vercel. Pointing `sere.cash` (or any domain you own) at it takes three
steps: add the domain to the project, point DNS at Vercel, then tell Sere what its
public address is.

Budget about an hour of waiting for DNS, though it is often minutes.

## 1. Add the domain to the Vercel project

1. Open your project on [vercel.com](https://vercel.com).
2. Go to **Settings**, then **Domains**.
3. Type your domain, for example `sere.cash`, and select **Add**.
4. When Vercel offers to add `www.sere.cash` as well, accept. Serving `www` and
   redirecting the apex to it (or the reverse) avoids surprises with cookies later.

Vercel now shows a card per domain with the exact DNS records it wants. Those values
are what you copy in the next step. Do not use values from a blog post, including this
one, if they differ from your dashboard.

## 2. Point DNS at Vercel

You have two options. Pick one.

### Option A: keep DNS at your registrar (recommended)

At your registrar (Namecheap, GoDaddy, Cloudflare, Porkbun, and so on), open the DNS
records for the domain and add what the Vercel card shows. In most cases that is:

| Type  | Name         | Value                                     |
| ----- | ------------ | ----------------------------------------- |
| A     | `@` or blank | The IP on your Vercel domain card, commonly `76.76.21.21` |
| CNAME | `www`        | The CNAME target on your Vercel domain card |

An apex domain cannot use a CNAME, which is why the root uses an A record.

Delete any old A, AAAA, or CNAME records for `@` and `www` that point somewhere else.
Two conflicting records is the most common reason a domain never goes live.

If your registrar is Cloudflare, set the proxy status of both records to **DNS only**
(grey cloud) until Vercel reports the domain as valid.

### Option B: let Vercel run DNS

Change the nameservers at your registrar to Vercel's:

```
ns1.vercel-dns.com
ns2.vercel-dns.com
```

This hands the whole zone to Vercel, so copy over any records you still need first,
especially `MX` records for email. Choose this option if you want a wildcard subdomain.

## 3. Wait for the certificate

Refresh **Settings**, then **Domains** in Vercel. Each domain moves to **Valid
Configuration** and Vercel issues an HTTPS certificate automatically. To watch DNS
propagate from your own machine:

```bash
dig a sere.cash +short
dig cname www.sere.cash +short
```

## 4. Tell Sere its public address

Invoice links, emailed invoices, and the Stripe return URL all need the real origin.

1. In Vercel, open **Settings**, then **Environment Variables**.
2. Add `SERE_PUBLIC_BASE_URL` with the value `https://sere.cash` (no trailing slash),
   for the Production environment.
3. Redeploy. Environment variables are read at boot, so an existing deployment keeps
   the old value until you redeploy.

Without this variable Sere falls back to the host of the incoming request, which works
but means preview deployments can hand out preview links to your customers.

## 5. Check it

- Open `https://sere.cash` and sign in.
- Go to **Settings**, then **Integrations**. The **Your domain** card should show your
  domain and say it was set by `SERE_PUBLIC_BASE_URL`.
- Open any invoice. The customer link in the **Customer link** card should start with
  your domain.

## If something is wrong

| What you see | Usual cause |
| ------------ | ----------- |
| Vercel says **Invalid Configuration** | An old A or CNAME record still exists, or the new record has not propagated. |
| The site loads but shows a certificate warning | The certificate is still being issued. Wait, then reload. |
| Invoice links use `vercel.app` | `SERE_PUBLIC_BASE_URL` is missing, or you have not redeployed since adding it. |
| A domain says it is used by another account | Add the TXT record Vercel shows to prove you own the domain. |
