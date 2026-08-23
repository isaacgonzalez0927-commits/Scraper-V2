import { eq } from "drizzle-orm";
import { dataStoreSummary, db, ensureSchema } from "./db";
import { users } from "./schema";
import { seedHarborAir, DEMO_EMAIL } from "./seed";

let ready = false;
let loggedEnv = false;

function logDatabaseEnv() {
  if (loggedEnv) return;
  loggedEnv = true;
  const store = dataStoreSummary();
  console.info("Sere database env", {
    vercel: Boolean(process.env.VERCEL),
    urlSet: store.urlSet,
    tokenSet: store.tokenSet,
    durable: store.durable,
    kind: store.kind,
  });
}

export async function boot() {
  if (ready) return;
  logDatabaseEnv();
  try {
    await ensureSchema();
    if (process.env.SERE_AUTO_SEED !== "0") {
      const existing = await db().select({ id: users.id }).from(users).where(eq(users.email, DEMO_EMAIL)).limit(1);
      if (!existing.length) await seedHarborAir();
    }
    ready = true;
  } catch (error) {
    console.error("Sere boot failed", error);
    throw error;
  }
}
