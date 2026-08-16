type BrandLogoProps = {
  className?: string;
  /** Icon only, or full icon + wordmark image. */
  variant?: "mark" | "lockup";
};

/** Raster Sere logo — use the real PNG assets, not reconstructed SVG paths. */
export function BrandLogo({ className, variant = "mark" }: BrandLogoProps) {
  const src = variant === "lockup" ? "/logo-lockup.png" : "/logo-mark.png";
  return <img className={className} src={src} alt={variant === "lockup" ? "Sere" : ""} />;
}
