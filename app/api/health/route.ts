import { databaseHostInfo } from "@/lib/db-env";
import { isDurableDatabase } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** No secrets. Used to see which Vercel project is serving this host. */
export async function GET() {
  const host = databaseHostInfo();
  return Response.json({
    ok: host.urlSet && host.tokenSet,
    durable: isDurableDatabase(),
    ...host,
  });
}
