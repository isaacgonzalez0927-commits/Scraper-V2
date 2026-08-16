type BrandLogoProps = {
  className?: string;
  /** Full lockup (icon + sere), or icon mark only (invoices). */
  crop?: "lockup" | "icon";
};

/** UI lockup: public/sere-logo.png. Home screen uses public/sere-icon.png via manifest. */
export function BrandLogo({ className, crop = "lockup" }: BrandLogoProps) {
  const src = crop === "icon" ? "/sere-icon.png" : "/sere-logo.png";
  return (
    <img
      className={className}
      src={src}
      alt={crop === "lockup" ? "Sere" : ""}
    />
  );
}
