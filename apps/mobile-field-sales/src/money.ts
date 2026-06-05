import { useEffect, useState } from "react";
import { apiClient } from "./api-service";

/**
 * Currency formatting driven by the organisation's configured currency (from
 * /api/v1/organisation-settings) — nothing about the symbol is hardcoded into a
 * screen. The code→symbol map covers common currencies; anything else falls back
 * to the ISO code prefix so it's never wrong, just less pretty.
 */
const SYMBOLS: Record<string, string> = {
  INR: "₹", USD: "$", EUR: "€", GBP: "£", AUD: "A$", CAD: "C$",
  SGD: "S$", JPY: "¥", AED: "AED ", ZAR: "R", NZD: "NZ$"
};

let cachedCurrency: string | null = null;
let inflight: Promise<string> | null = null;

export function currencySymbol(code?: string | null): string {
  if (!code) return SYMBOLS.INR;
  return SYMBOLS[code.toUpperCase()] ?? `${code.toUpperCase()} `;
}

/** Minor units (cents/paise) → "₹1,234.50" using the org currency. */
export function formatMinor(cents: number, code?: string | null): string {
  return `${currencySymbol(code)}${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Compact form for KPIs: "₹1.2k" / "₹500". */
export function formatMinorCompact(cents: number, code?: string | null): string {
  const sym = currencySymbol(code);
  const v = cents / 100;
  return v >= 1000 ? `${sym}${(v / 1000).toFixed(1)}k` : `${sym}${Math.round(v)}`;
}

/**
 * The org's currency code, fetched once and cached for the app session so every
 * money display stays in sync with the back office without each screen re-fetching.
 */
export function useOrgCurrency(): string {
  const [code, setCode] = useState<string>(cachedCurrency ?? "INR");
  useEffect(() => {
    if (cachedCurrency) { setCode(cachedCurrency); return; }
    if (!inflight) {
      inflight = apiClient
        .getOrganisationSettings()
        .then((s) => { cachedCurrency = s.currency || "INR"; return cachedCurrency; })
        .catch(() => "INR");
    }
    let alive = true;
    void inflight.then((c) => { if (alive) setCode(c); });
    return () => { alive = false; };
  }, []);
  return code;
}
