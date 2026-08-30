import { startPrimaryCheckout } from "@/lib/checkout";
import { boot } from "@/lib/boot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  await boot();
  const { token } = await params;
  return startPrimaryCheckout(token);
}
