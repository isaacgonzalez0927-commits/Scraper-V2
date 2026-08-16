type BrandMarkProps = {
  className?: string;
  /** Render size in CSS pixels (square). */
  size?: number;
};

/**
 * Inline Sere mark — folded ribbon S. Drawn inline so gradients stay crisp and
 * paths can overlap at seams (no hairline gaps from external SVG scaling).
 */
export function BrandMark({ className, size }: BrandMarkProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="sere-top" x1="18" y1="16" x2="84" y2="42" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8D5BFF" />
          <stop offset="1" stopColor="#5929DB" />
        </linearGradient>
        <linearGradient id="sere-bottom" x1="19" y1="83" x2="78" y2="54" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2C168C" />
          <stop offset="1" stopColor="#6032E8" />
        </linearGradient>
        <linearGradient id="sere-fold" x1="18" y1="43" x2="47" y2="62" gradientUnits="userSpaceOnUse">
          <stop stopColor="#EEE7FF" />
          <stop offset="1" stopColor="#BDA6FF" />
        </linearGradient>
      </defs>
      <g shapeRendering="geometricPrecision" paintOrder="stroke fill">
        {/* Bottom ribbon — drawn first */}
        <path
          d="m40 54 14-12c4-4 9-4 13 0l18 18c4 4 3 9-1 13L64 91c-3 3-6 4-11 4H13c-5 0-7-5-3-9l29-28c3-3 3-3 1-4Z"
          fill="url(#sere-bottom)"
          stroke="#4f2fd4"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        {/* Top ribbon */}
        <path
          d="M51 8h35c5 0 7 5 3 9L65 41c-5 5-9 7-16 7H17c-6 0-8-7-4-11l29-25c3-3 5-4 9-4Z"
          fill="url(#sere-top)"
          stroke="#6d45e8"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        {/* Fold highlight — on top to cover seams */}
        <path
          d="m12 36 18 17c4 4 5 8 1 12L12 83c-4 4-11 1-9-5l8-32c1-3 0-4 1-6Z"
          fill="url(#sere-fold)"
          stroke="#d8caff"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}
