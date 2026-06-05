"use client";

import { useEffect, useState } from "react";
import { apiClient, safeFetch } from "./api-service";

/**
 * Currency formatting driven by the organisation's configured currency
 * (organisation-settings.currency) rather than a hardcoded ₹. Falls back to the
 * ISO code prefix for currencies not in the symbol map.
 */
const SYMBOLS: Record<string, string> = {
  INR: "₹", USD: "$", EUR: "€", GBP: "£", AUD: "A$", CAD: "C$",
  SGD: "S$", JPY: "¥", AED: "AED ", ZAR: "R", NZD: "NZ$"
};

let cached: string | null = null;
let inflight: Promise<string> | null = null;

export function currencySymbol(code?: string | null): string {
  if (!code) return SYMBOLS.INR;
  return SYMBOLS[code.toUpperCase()] ?? `${code.toUpperCase()} `;
}

/** Minor units (cents/paise) → "₹1,234.50" in the org currency. */
export function formatMinor(cents: number, code?: string | null): string {
  return `${currencySymbol(code)}${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** The org currency code, fetched once and cached for the session. */
export function useOrgCurrency(): string {
  const [code, setCode] = useState<string>(cached ?? "INR");
  useEffect(() => {
    if (cached) { setCode(cached); return; }
    if (!inflight) {
      inflight = safeFetch(() => apiClient.getOrganisationSettings(), null).then((s) => {
        cached = s?.currency || "INR";
        return cached;
      });
    }
    let alive = true;
    void inflight.then((c) => { if (alive) setCode(c); });
    return () => { alive = false; };
  }, []);
  return code;
}
