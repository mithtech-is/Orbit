"use client";

import type { JSX } from "react";
import { useEffect, useRef } from "react";
import maplibregl, { type Map as MlMap, type Marker, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const MAP_STYLE: StyleSpecification = {
  version: 8,
  sources: { osm: { type: "raster", tiles: ["https://a.tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, attribution: "© OpenStreetMap contributors" } },
  layers: [{ id: "osm", type: "raster", source: "osm" }]
};

export interface LatLng { latitude: number; longitude: number }

/**
 * Single-pin location picker for a lead. Click the map to drop a pin, drag the
 * pin to fine-tune. Emits `null` when cleared. Centres on the current pin, else
 * the supplied fallback (e.g. the chosen outlet), else Bengaluru.
 */
export function LeadMapPin({ value, onChange, fallbackCenter }: {
  value: LatLng | null;
  onChange: (loc: LatLng | null) => void;
  fallbackCenter?: LatLng | null;
}): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; });

  // Initialise the map once. Clicking the map drops/moves the pin.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;
    const c = value ?? fallbackCenter ?? { latitude: 12.97, longitude: 77.59 };
    const map = new maplibregl.Map({ container, style: MAP_STYLE, center: [c.longitude, c.latitude], zoom: value ? 14 : 11 });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), "top-right");
    map.on("click", (e) => onChangeRef.current({ latitude: e.lngLat.lat, longitude: e.lngLat.lng }));
    mapRef.current = map;
    // The map is usually created while its dialog is still animating open, so the
    // container hasn't reached its final size. If we don't re-sync, MapLibre's
    // canvas stays the wrong size — the pin then drifts toward a corner as you zoom
    // and the map spills outside its box. Resize on load and on every container
    // size change to keep canvas and container in lock-step.
    map.once("load", () => map.resize());
    const ro = new ResizeObserver(() => mapRef.current?.resize());
    ro.observe(container);
    return () => { ro.disconnect(); map.remove(); mapRef.current = null; markerRef.current = null; };
    // Init once on mount; value/fallback only seed the initial centre.
  }, []);

  // Keep the marker in sync with the controlled value.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!value) {
      if (markerRef.current) { markerRef.current.remove(); markerRef.current = null; }
      return;
    }
    if (!markerRef.current) {
      const marker = new maplibregl.Marker({ color: "#2563eb", draggable: true });
      marker.on("dragend", () => { const ll = marker.getLngLat(); onChangeRef.current({ latitude: ll.lat, longitude: ll.lng }); });
      marker.setLngLat([value.longitude, value.latitude]).addTo(map);
      markerRef.current = marker;
    } else {
      markerRef.current.setLngLat([value.longitude, value.latitude]);
    }
  }, [value]);

  return (
    <div style={{ position: "relative", width: "100%", maxWidth: "100%" }}>
      <div ref={containerRef} style={{ height: 220, width: "100%", borderRadius: 8, overflow: "hidden", border: "1px solid var(--border)" }} />
      {/* Top-left so it never collides with the zoom controls (top-right) or the
          MapLibre attribution (bottom). Sized to content, not full width. */}
      <div style={{ position: "absolute", top: 8, left: 8, maxWidth: "calc(100% - 60px)", display: "inline-flex", alignItems: "center", gap: 8, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 8px", fontSize: 11, color: "var(--text-secondary)" }}>
        <span>{value ? "📍 Pinned — drag to fine-tune" : "Click the map to drop a pin · drag to fine-tune"}</span>
        {value ? (
          <button type="button" onClick={() => onChange(null)} style={{ color: "var(--primary)", fontWeight: 600, background: "none", border: "none", cursor: "pointer", fontSize: 11 }}>Clear</button>
        ) : null}
      </div>
    </div>
  );
}
