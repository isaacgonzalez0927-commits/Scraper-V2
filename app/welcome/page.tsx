import { chooseTradeAction } from "../actions";
import { AuthShell } from "@/components/AuthShell";
import { requireContext } from "@/lib/auth";
import { boot } from "@/lib/boot";
import { TRADE_LIST } from "@/lib/business";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TRADES = TRADE_LIST.filter((trade) => trade.key !== "other");

export default async function WelcomePage() {
  await boot();
  const { user } = await requireContext();
  const firstName = user.name.trim().split(/\s+/)[0] || user.name;
  return (
    <AuthShell
      title={`One question, ${firstName}`}
      sub="What kind of shop is this? Sere then uses your words — calls, work orders, appointments — and starts you with that trade's prices."
      wide
    >
      <form action={chooseTradeAction} className="trade-grid">
        {TRADES.map((trade) => (
          <button
            key={trade.key}
            className="trade-pick"
            type="submit"
            name="business_type"
            value={trade.key}
          >
            <strong>{trade.name}</strong>
            <span>{trade.signupHint}</span>
          </button>
        ))}
      </form>
      <form action={chooseTradeAction} className="trade-skip">
        <button className="btn btn-ghost btn-block" type="submit" name="business_type" value="other">
          Skip — keep it generic
        </button>
      </form>
      <p className="auth-fine">You can change this any time in Settings.</p>
    </AuthShell>
  );
}
