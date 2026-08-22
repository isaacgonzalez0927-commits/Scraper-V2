import { and, desc, eq, isNull, ne } from "drizzle-orm";
import { headers } from "next/headers";
import { requireContext } from "./auth";
import { buildBrief } from "./assistant";
import { tradeCopy } from "./business";
import { db } from "./db";
import { integrationStatus } from "./integrations";
import { unreadCount } from "./queries";
import { customers, invoices, jobs } from "./schema";
import { DEMO_EMAIL } from "./seed";
import { buildSetupGuide, type SetupSnapshot } from "./sere-setup";
import { isSereIosUserAgent } from "./serenity";
import { parseShopMode } from "./shop-mode";
import { ensureTrialClock, shopAccess } from "./trial";

export async function loadApp() {
  const ctx = await requireContext();
  const isDemo = ctx.user.email === DEMO_EMAIL;
  const org = await ensureTrialClock(ctx.org, isDemo);
  const access = shopAccess(org, isDemo);
  const voice = tradeCopy(org.businessType);
  const native = isSereIosUserAgent((await headers()).get("user-agent") || "");
  const [unread, brief, setup] = await Promise.all([
    unreadCount(org.id),
    buildBrief(org.id, ctx.user.name, org.businessType),
    isDemo ? Promise.resolve(null) : loadSetupForShell(org, voice),
  ]);
  return {
    ...ctx,
    org,
    access,
    unread,
    voice,
    brief,
    shell: {
      orgName: org.name,
      userName: ctx.user.name,
      unread,
      isDemo,
      frozen: access.frozen,
      trialBanner: access.banner,
      tradeName: voice.name,
      worker: voice.worker,
      jobsLabel: voice.jobs,
      customersLabel: voice.customers,
      searchHint: voice.searchHint,
      brief,
      setup,
      shopMode: parseShopMode(org.operatingMode),
      native,
    },
  };
}

async function loadSetupForShell(
  org: {
    id: number;
    name: string;
    phone: string;
    email: string;
    businessType: string;
    operatingMode?: string;
  },
  voice: ReturnType<typeof tradeCopy>,
) {
  const [customerRows, jobRows, invoiceRows, integrations] = await Promise.all([
    db()
      .select({ id: customers.id, name: customers.name })
      .from(customers)
      .where(and(eq(customers.organizationId, org.id), isNull(customers.archivedAt)))
      .orderBy(desc(customers.id))
      .limit(1),
    db()
      .select({ id: jobs.id, title: jobs.title })
      .from(jobs)
      .where(eq(jobs.organizationId, org.id))
      .orderBy(desc(jobs.id))
      .limit(1),
    db()
      .select({ id: invoices.id })
      .from(invoices)
      .where(and(eq(invoices.organizationId, org.id), ne(invoices.status, "void")))
      .limit(1),
    integrationStatus(org.id),
  ]);
  const snapshot: SetupSnapshot = {
    shopName: org.name,
    shopPhone: org.phone,
    shopEmail: org.email,
    trade: org.businessType,
    customers: customerRows.length,
    jobs: jobRows.length,
    invoices: invoiceRows.length,
    stripe: integrations.stripe.connected,
    shopMode: org.operatingMode,
    latestCustomerId: customerRows[0]?.id,
    latestCustomerName: customerRows[0]?.name,
    latestJobId: jobRows[0]?.id,
    latestJobTitle: jobRows[0]?.title,
  };
  return { guide: buildSetupGuide(snapshot, voice) };
}
