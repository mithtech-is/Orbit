import type { JSX } from "react";

interface LogoProps {
  /** Pixel size of the square mark. Defaults to 28 (sidebar). */
  size?: number;
  /** Optional override for the mark colour. Defaults to var(--primary). */
  color?: string;
}

/**
 * Orbit brand mark — a rounded square with a curved route arrow pointing
 * up-and-to-the-right, evoking "route + direction" in one glyph. Inline SVG so
 * we don't ship an extra asset and it inherits the theme colour automatically.
 *
 * Used in the sidebar (compact) and on the login card (larger).
 */
export function Logo({ size = 28, color }: LogoProps): JSX.Element {
  const fill = color ?? "var(--primary)";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect x="1" y="1" width="30" height="30" rx="8" fill={fill} />
      {/* Curving route line from bottom-left, sweeping up through the badge.
          Stroke gives it the "trail" feel; the round cap is the start marker. */}
      <path
        d="M8 23 C 11 17, 16 14, 20 13"
        stroke="#ffffff"
        strokeWidth="2.4"
        strokeLinecap="round"
        fill="none"
      />
      {/* Destination arrow head — small chevron at the route's end. */}
      <path
        d="M17 9 L23 11 L21 17"
        stroke="#ffffff"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Start dot for extra clarity at small sizes. */}
      <circle cx="8" cy="23" r="1.6" fill="#ffffff" />
    </svg>
  );
}
