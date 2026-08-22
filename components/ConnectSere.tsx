import { BrandLogo } from "@/components/BrandLogo";

/** Official Sere connect control — same idea as Stripe's Connect button. */
export const CONNECT_SERE_HREF = "/signup";

export function connectButtonClass(extra?: string): string {
  return ["btn", "btn-connect", extra].filter(Boolean).join(" ");
}

export function ConnectSereButton({
  href = CONNECT_SERE_HREF,
  label = "Connect Sere",
}: {
  href?: string;
  label?: string;
}) {
  return (
    <a className="btn btn-connect btn-sere" href={href}>
      <BrandLogo crop="icon" className="btn-connect-mark" />
      {label}
    </a>
  );
}
