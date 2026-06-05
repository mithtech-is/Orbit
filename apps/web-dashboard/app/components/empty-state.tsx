"use client";

import type { JSX, ReactNode } from "react";

export type EmptyKind =
  | "visits" | "leads" | "outlets" | "customers" | "orders" | "notifications"
  | "territories" | "routes" | "reports" | "users" | "audit" | "sync" | "search" | "generic";

/**
 * A friendly, animated empty state so no screen is ever blank. Each `kind`
 * renders a small line-art illustration (gently floating, with a drawn-in
 * stroke + pulsing accent) relevant to that screen, plus a title, message, and
 * optional action. See .emptyState/.emptyArt animations in styles.css.
 */
export function EmptyState({ kind = "generic", title, message, action }: {
  kind?: EmptyKind;
  title: string;
  message: string;
  action?: ReactNode;
}): JSX.Element {
  return (
    <div className="emptyState">
      <div className="emptyArt">{art(kind)}</div>
      <h3>{title}</h3>
      <p>{message}</p>
      {action ? <div className="emptyAction">{action}</div> : null}
    </div>
  );
}

const S = { fill: "none", stroke: "var(--primary)", strokeWidth: 4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const accent = { fill: "var(--primary)" };

function art(kind: EmptyKind): JSX.Element {
  switch (kind) {
    case "notifications":
      return (
        <svg viewBox="0 0 100 100" role="img" aria-hidden>
          <path className="draw" d="M30 44a20 20 0 0 1 40 0c0 16 6 20 6 24H24c0-4 6-8 6-24Z" {...S} />
          <path d="M44 80a6 6 0 0 0 12 0" {...S} />
          <circle className="spark" cx="72" cy="30" r="7" {...accent} />
        </svg>
      );
    case "visits":
      return (
        <svg viewBox="0 0 100 100" role="img" aria-hidden>
          <path className="draw" d="M50 16c-13 0-23 10-23 23 0 17 23 41 23 41s23-24 23-41c0-13-10-23-23-23Z" {...S} />
          <circle className="spark" cx="50" cy="39" r="8" {...accent} />
        </svg>
      );
    case "routes":
      return (
        <svg viewBox="0 0 100 100" role="img" aria-hidden>
          <path className="draw" d="M24 76c0-10 10-12 22-12s22-4 22-16-10-12-10-12" {...S} />
          <circle cx="24" cy="78" r="6" {...accent} /><circle className="spark" cx="74" cy="24" r="6" {...accent} />
        </svg>
      );
    case "leads":
      return (
        <svg viewBox="0 0 100 100" role="img" aria-hidden>
          <circle className="draw" cx="50" cy="38" r="16" {...S} />
          <path d="M26 78c0-13 11-20 24-20s24 7 24 20" {...S} />
          <circle className="spark" cx="74" cy="30" r="6" {...accent} />
        </svg>
      );
    case "outlets":
    case "customers":
      return (
        <svg viewBox="0 0 100 100" role="img" aria-hidden>
          <path className="draw" d="M24 44 50 24l26 20v32H24Z" {...S} />
          <path d="M44 76V58h12v18" {...S} />
          <circle className="spark" cx="50" cy="44" r="5" {...accent} />
        </svg>
      );
    case "orders":
      return (
        <svg viewBox="0 0 100 100" role="img" aria-hidden>
          <path className="draw" d="M30 30h44l-4 40H34Z" {...S} />
          <path d="M40 30a10 10 0 0 1 20 0" {...S} />
          <circle className="spark" cx="50" cy="50" r="6" {...accent} />
        </svg>
      );
    case "territories":
      return (
        <svg viewBox="0 0 100 100" role="img" aria-hidden>
          <path className="draw" d="M28 28 44 34l14-6 14 8v34l-14-6-14 6-16-6Z" {...S} />
          <path d="M44 34v34M58 28v34" {...S} />
          <circle className="spark" cx="58" cy="50" r="5" {...accent} />
        </svg>
      );
    case "reports":
      return (
        <svg viewBox="0 0 100 100" role="img" aria-hidden>
          <path d="M26 74h48" {...S} />
          <rect className="draw" x="34" y="50" width="10" height="24" {...S} />
          <rect x="50" y="38" width="10" height="36" {...S} fill="var(--primary-soft)" />
          <rect className="spark" x="66" y="28" width="10" height="46" {...accent} />
        </svg>
      );
    case "users":
      return (
        <svg viewBox="0 0 100 100" role="img" aria-hidden>
          <circle className="draw" cx="40" cy="38" r="13" {...S} />
          <path d="M20 76c0-12 9-18 20-18s20 6 20 18" {...S} />
          <circle className="spark" cx="68" cy="40" r="9" {...accent} />
        </svg>
      );
    case "sync":
      return (
        <svg viewBox="0 0 100 100" role="img" aria-hidden>
          <path className="draw" d="M30 40a22 22 0 0 1 38-8M70 60a22 22 0 0 1-38 8" {...S} />
          <path d="M64 24v10h-10M36 76V66h10" {...S} />
          <circle className="spark" cx="50" cy="50" r="5" {...accent} />
        </svg>
      );
    case "audit":
      return (
        <svg viewBox="0 0 100 100" role="img" aria-hidden>
          <rect className="draw" x="30" y="24" width="40" height="52" rx="4" {...S} />
          <path d="M38 38h24M38 50h24M38 62h14" {...S} />
          <circle className="spark" cx="68" cy="66" r="6" {...accent} />
        </svg>
      );
    case "search":
      return (
        <svg viewBox="0 0 100 100" role="img" aria-hidden>
          <circle className="draw" cx="44" cy="44" r="18" {...S} />
          <path d="M58 58 76 76" {...S} />
          <circle className="spark" cx="44" cy="44" r="4" {...accent} />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 100 100" role="img" aria-hidden>
          <rect className="draw" x="26" y="30" width="48" height="40" rx="6" {...S} />
          <path d="M26 44h48" {...S} />
          <circle className="spark" cx="50" cy="57" r="6" {...accent} />
        </svg>
      );
  }
}
