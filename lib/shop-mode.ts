import { eq } from "drizzle-orm";
import { db } from "./db";
import { organizations } from "./schema";

/**
 * Shop operating modes, like Stripe test vs live.
 *
 * sandbox: practice. Test processor keys only. The book you build stays.
 * desk: live shop with no Stripe or Square. Payments you type are the cash.
 * live: real shop, processor connected or chosen.
 *
 * Existing shops with a blank column stay live so a deploy does not sandbox them.
 */

export const SHOP_MODES = ["sandbox", "desk", "live"] as const;
export type ShopMode = (typeof SHOP_MODES)[number];

/** Live, no processor. Named so the shop can say it out loud. */
export const DESK_MODE_NAME = "Desk mode";

export function parseShopMode(
  value: string | null | undefined,
  fallback: ShopMode = "live",
): ShopMode {
  if (value === "sandbox" || value === "desk" || value === "live") return value;
  return fallback;
}

export function shopModeLabel(mode: ShopMode): string {
  if (mode === "sandbox") return "Sandbox";
  if (mode === "desk") return DESK_MODE_NAME;
  return "Live";
}

export function leftSandbox(mode: ShopMode): boolean {
  return mode !== "sandbox";
}

export type ModeBanner = {
  tone: "sandbox" | "desk";
  title: string;
  body: string;
  href: string;
};

export function shopModeBanner(mode: ShopMode): ModeBanner | null {
  if (mode === "sandbox") {
    return {
      tone: "sandbox",
      title: "Sandbox",
      body: "Practice, like Stripe test mode. Use test keys only. The book you build stays when you leave Sandbox.",
      href: "/mode",
    };
  }
  if (mode === "desk") {
    return {
      tone: "desk",
      title: DESK_MODE_NAME,
      body: "Live shop, no Stripe or Square. You type payments in. Overview will not show cash that actually landed. Less useful until you connect.",
      href: "/settings?tab=integrations",
    };
  }
  return null;
}

export function parseModeChoice(value: string): "live" | "desk" | null {
  if (value === "live" || value === "desk") return value;
  return null;
}

/** A live processor key or production Square token leaves Sandbox and Desk. */
export function modeAfterProcessor(
  current: ShopMode,
  processor: "test" | "live",
): ShopMode {
  if (processor === "live") return "live";
  return current;
}

export function stripeKeyEnv(key: string): "test" | "live" | null {
  const trimmed = key.trim();
  if (trimmed.startsWith("rk_test_")) return "test";
  if (trimmed.startsWith("rk_live_")) return "live";
  return null;
}

export async function writeShopMode(orgId: number, mode: ShopMode): Promise<void> {
  await db()
    .update(organizations)
    .set({ operatingMode: mode })
    .where(eq(organizations.id, orgId));
}

export async function promoteShopAfterProcessor(
  orgId: number,
  current: string | undefined,
  processor: "test" | "live",
): Promise<ShopMode> {
  const now = parseShopMode(current);
  const next = modeAfterProcessor(now, processor);
  if (next !== now) await writeShopMode(orgId, next);
  return next;
}
