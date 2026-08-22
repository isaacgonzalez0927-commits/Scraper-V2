import { BrandLogo } from "@/components/BrandLogo";
import { ThemeToggle } from "@/components/ThemeToggle";

/**
 * Every screen you see before the shop opens: sign in, create, reset, the
 * trade question, and the setup wizard. Same frame every time.
 */
export function AuthShell({
  title,
  sub,
  wide,
  children,
  foot,
}: {
  title?: string;
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
        {title ? <h1 className="auth-title">{title}</h1> : null}
        {sub ? <p className="auth-sub">{sub}</p> : null}
        {children}
        {foot ? <div className="auth-foot">{foot}</div> : null}
      </div>
    </div>
  );
}
