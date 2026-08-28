import { CreateSereKeyButton } from "@/components/ConnectStripe";

export function StripeKeyTutorial({
  live = false,
  compact = false,
  children,
}: {
  live?: boolean;
  compact?: boolean;
  children?: React.ReactNode;
}) {
  const prefix = live ? "rk_live_" : "rk_test_";
  if (compact) {
    return (
      <div className="connect-flow connect-flow-compact">
        <CreateSereKeyButton
          live={live}
          className="btn btn-connect btn-stripe btn-sm"
        />
        {children}
      </div>
    );
  }
  return (
    <div className="connect-flow">
      <CreateSereKeyButton
        live={live}
        className="btn btn-connect btn-stripe btn-connect-hero"
      />
      <p className="help">
        Paste the <code>{prefix}</code> key it shows you. Never paste{" "}
        <code>sk_</code>. That one can move money.
      </p>
      {children}
      <details className="disclosure">
        <summary>What the Sere key can do</summary>
        <ul className="key-perms">
          <li>
            <strong>Read:</strong> Balance, Charges, Payouts, Connect → Accounts
          </li>
          <li>
            <strong>Write:</strong> Customers, Invoices, Invoice Items, Checkout
            Sessions, Payment Intents
          </li>
        </ul>
        <p className="help mt-1">Leave everything else None. No Refunds Write.</p>
      </details>
    </div>
  );
}
