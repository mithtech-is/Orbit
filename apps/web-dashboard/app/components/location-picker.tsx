"use client";

import type { JSX } from "react";
import { useRef, useState } from "react";
import { LocateFixed, Search, MapPin } from "lucide-react";
import { apiClient, safeFetch } from "../api-service";
import { LeadMapPin, type LatLng } from "./lead-map-pin";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/**
 * Reusable, coordinate-free location picker. Three ways to set a place — none of
 * which require typing latitude/longitude:
 *   1. Search an address / place (backend geocoder → coordinate)
 *   2. Use the device's current location
 *   3. Drop / drag a pin on the map
 * The resolved place is shown as a human-readable address (reverse-geocoded),
 * never raw numbers. Controlled via {value, onChange}.
 */
export function LocationPicker({ value, onChange, fallbackCenter }: {
  value: LatLng | null;
  onChange: (loc: LatLng | null) => void;
  fallbackCenter?: LatLng | null;
}): JSX.Element {
  const [query, setQuery] = useState("");
  const [label, setLabel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const lastReverse = useRef<string>("");

  async function search() {
    const q = query.trim();
    if (!q) return;
    setBusy(true); setErr(null);
    const r = await safeFetch(() => apiClient.geocode(q), null);
    setBusy(false);
    if (r) {
      onChange({ latitude: r.latitude, longitude: r.longitude });
      setLabel(r.label);
      lastReverse.current = `${r.latitude.toFixed(5)},${r.longitude.toFixed(5)}`;
      setQuery("");
    } else {
      setErr(`Couldn't find “${q}”. Try a more specific address, or drop a pin on the map.`);
    }
  }

  function useMyLocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setErr("This browser can't access location — search an address or drop a pin instead."); return;
    }
    setBusy(true); setErr(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => { handleMapChange({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }); setLabel("My current location"); setBusy(false); },
      () => { setErr("Couldn't get your location. Allow access, search an address, or drop a pin."); setBusy(false); },
      { enableHighAccuracy: true, timeout: 10_000 }
    );
  }

  /** Pin moved via map click/drag (or current location) — refresh the readable label. */
  function handleMapChange(loc: LatLng | null) {
    onChange(loc);
    setErr(null);
    if (!loc) { setLabel(null); lastReverse.current = ""; return; }
    const key = `${loc.latitude.toFixed(5)},${loc.longitude.toFixed(5)}`;
    if (key === lastReverse.current) return;
    lastReverse.current = key;
    setLabel("Pinned location");
    void safeFetch(() => apiClient.reverseGeocode(loc.latitude, loc.longitude), null).then((r) => {
      if (r?.label && lastReverse.current === key) setLabel(r.label);
    });
  }

  return (
    <div className="grid min-w-0 gap-2">
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
        <Button type="button" size="sm" onClick={useMyLocation} disabled={busy}>
          <LocateFixed className="h-4 w-4" /> {busy ? "Locating…" : "My location"}
        </Button>
        <div className="flex flex-1 items-center gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void search(); } }}
            placeholder="Search address or place…"
          />
          <Button type="button" variant="outline" size="sm" onClick={() => void search()} disabled={busy || !query.trim()}>
            <Search className="h-4 w-4" /> Find
          </Button>
        </div>
      </div>

      {label ? (
        <div className="flex w-full min-w-0 items-center gap-2 rounded-md border border-success/30 bg-success/10 px-2.5 py-1.5 text-xs text-foreground">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-success" />
          <span className="min-w-0 flex-1 truncate" title={label}>{label}</span>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Search an address, use your location, or drop a pin on the map below.</p>
      )}
      {err ? <p className="text-xs text-destructive">{err}</p> : null}

      <LeadMapPin value={value} onChange={handleMapChange} fallbackCenter={fallbackCenter} />
    </div>
  );
}
