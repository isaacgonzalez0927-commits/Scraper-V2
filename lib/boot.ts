import { eq } from "drizzle-orm";
import { ensureSchema, db } from "./db";
import { users } from "./schema";
import { seedHarborAir, DEMO_EMAIL } from "./seed";

let ready = false;

export async function boot() {
  if (ready) return;
  await ensureSchema();
  if (process.env.SERE_AUTO_SEED !== "0") {
    const existing = await db().select({ id: users.id }).from(users).where(eq(users.email, DEMO_EMAIL)).limit(1);
    if (!existing.length) await seedHarborAir();
  }
  ready = true;
}
