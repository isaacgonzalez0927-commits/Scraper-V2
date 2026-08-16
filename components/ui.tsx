import { formatMoney } from "@/lib/money";
import { label } from "@/lib/labels";

export function Money({ cents }: { cents: number }) {
  return <span className="money">{formatMoney(cents)}</span>;
}

export function Badge({ status }: { status: string }) {
  return <span className={`badge badge-${status}`}>{label(status)}</span>;
}

export function Flash({
  error,
  ok,
  notice,
}: {
  error?: string;
  ok?: string;
  notice?: string;
}) {
  if (error) return <div className="flash flash-error">{error}</div>;
  if (ok) return <div className="flash flash-success">{ok}</div>;
  if (notice) return <div className="notice">{notice}</div>;
  return null;
}

export function Empty({ title, body, href, action }: { title: string; body: string; href: string; action: string }) {
  return (
    <div className="card empty">
      <h3>{title}</h3>
      <p>{body}</p>
      <a className="btn" href={href}>{action}</a>
    </div>
  );
}
