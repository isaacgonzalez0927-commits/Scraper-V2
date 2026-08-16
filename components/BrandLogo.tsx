type BrandLogoProps = {
  className?: string;
  /** Full lockup (icon + sere), or cropped icon mark for invoice headers. */
  crop?: "lockup" | "icon";
};

/** Your logo file at public/sere-logo.png — not generated, not SVG. */
export function BrandLogo({ className, crop = "lockup" }: BrandLogoProps) {
  const classes = [className, crop === "icon" ? "brand-mark-crop" : ""].filter(Boolean).join(" ");
  return (
    <img
      className={classes}
      src="/sere-logo.png"
      alt={crop === "lockup" ? "Sere" : ""}
    />
  );
}
