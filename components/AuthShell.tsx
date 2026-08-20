import { BrandLogo } from "@/components/BrandLogo";
import { ThemeToggle } from "@/components/ThemeToggle";

/**
 * Every screen you see before the shop opens: sign in, create, reset, and the
 * one setup question. Same frame every time so nothing feels like a new app.
 */
export function AuthShell({
  title,
  sub,
  wide,
  children,
  foot,
}: {
  title: string;
  sub?: React.ReactNode;
  wide?: boolean;
  children: React.ReactNode;
  foot?: React.ReactNode;
}) {
  return (
    <div className="auth">
      <div className={wide ? "auth-card auth-card-wide" : "auth-card"}>
        <header className="auth-head">
          <BrandLogo className="brand-lockup" />
          <ThemeToggle />
        </header>
        <h1 className="auth-title">{title}</h1>
        {sub ? <p className="auth-sub">{sub}</p> : null}
        {children}
        {foot ? <div className="auth-foot">{foot}</div> : null}
      </div>
    </div>
  );
}
