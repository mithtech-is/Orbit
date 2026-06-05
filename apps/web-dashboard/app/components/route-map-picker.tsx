"use client";

import type { JSX } from "react";
import { useEffect, useRef } from "react";
import maplibregl, { type Map as MlMap, type Marker, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { OutletSummary } from "@orbit/api-client";

const MAP_STYLE: StyleSpecification = {
  version: 8,
  sources: { osm: { type: "raster", tiles: ["https://a.tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, attribution: "© OpenStreetMap contributors" } },
  layers: [{ id: "osm", type: "raster", source: "osm" }]
};

/**
 * Visual route-builder map: every geolocated outlet is a clickable dot —
 * blue when selected for the plan, grey otherwise. Clicking toggles it. Keeps
 * the checkbox table in sync via the shared `selectedIds` + `onToggle`.
 */
export function RouteMapPicker({ outlets, selectedIds, onToggle }: {
  outlets: OutletSummary[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
}): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const onToggleRef = useRef(onToggle);
  useEffect(() => { onToggleRef.current = onToggle; });

  // Initialise the map once.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;
    const first = outlets[0];
    const center: [number, number] = first ? [first.longitude, first.latitude] : [77.59, 12.97];
    const map = new maplibregl.Map({ container, style: MAP_STYLE, center, zoom: 11 });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), "top-right");
    mapRef.current = map;
    // Keep MapLibre's canvas the same size as the container (it can be created
    // before the layout settles, leaving the canvas stale → markers drift on zoom
    // and the map overflows its box).
    map.once("load", () => map.resize());
    const ro = new ResizeObserver(() => mapRef.current?.resize());
    ro.observe(container);
    return () => { ro.disconnect(); map.remove(); mapRef.current = null; };
    // Init once on mount; outlets[0] is only used for the initial center.
  }, []);

  // (Re)draw markers whenever the outlet set or selection changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const draw = () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      outlets.forEach((o) => {
        const sel = selectedIds.has(o.id);
        // MapLibre positions the OUTER element via `transform: translate(...)`.
        // The hover effect must NOT touch that transform (doing so snapped the dot
        // to the top-left corner), so the visual dot is an inner element we scale.
        const el = document.createElement("div");
        el.style.cssText = "width:16px;height:16px;cursor:pointer;";
        el.title = o.name + (sel ? " (selected)" : "");
        const dot = document.createElement("div");
        dot.style.cssText = `width:16px;height:16px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.25);transition:transform .12s ease;background:${sel ? "#2563eb" : "#9ca3af"}`;
        el.appendChild(dot);
        el.addEventListener("mouseenter", () => { dot.style.transform = "scale(1.3)"; });
        el.addEventListener("mouseleave", () => { dot.style.transform = "scale(1)"; });
        el.addEventListener("click", (e) => { e.stopPropagation(); onToggleRef.current(o.id); });
        const marker = new maplibregl.Marker({ element: el }).setLngLat([o.longitude, o.latitude]).addTo(map);
        markersRef.current.push(marker);
      });
    };
    if (map.loaded()) draw(); else map.once("load", draw);
  }, [outlets, selectedIds]);

  return (
    <div style={{ position: "relative", width: "100%", maxWidth: "100%", marginBottom: 12 }}>
      <div ref={containerRef} style={{ height: 300, width: "100%", borderRadius: 8, overflow: "hidden", border: "1px solid var(--border)" }} />
      <div style={{ position: "absolute", bottom: 8, left: 8, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 8px", fontSize: 11, color: "var(--text-secondary)" }}>
        ● selected &nbsp; ○ tap a dot to add/remove
      </div>
    </div>
  );
}
