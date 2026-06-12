"use client";

import type { JSX } from "react";

import { useCallback, useEffect, useRef, useState } from "react";
import maplibregl, { type LngLatBoundsLike, type Map, type Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { TrackingLocationRecordedEvent } from "@orbit/api-client";
import { apiClient, safeFetch } from "../api-service";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTrackingSocket, type TrackingSocketState } from "@/lib/use-tracking-socket";

type BadgeVariant = "success" | "default" | "warning" | "destructive" | "secondary";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:9000";

/**
 * A rep is only "live" while their last ping is within this window. Must match
 * the backend `TRACKING_LIVE_WINDOW_SECONDS` (default 300s) so the seed fetch
 * and the client-side prune agree. Once a rep's last ping ages past this, we
 * drop their marker rather than leaving a stale dot on the map forever.
 */
const LIVE_WINDOW_SECONDS = Number(process.env.NEXT_PUBLIC_TRACKING_LIVE_WINDOW_SECONDS) || 300;

/**
 * Default MapLibre style — free, no API key. Uses the OpenStreetMap raster
 * tiles served via openstreetmap.org. For production deployments respect
 * the OSM tile usage policy and set `NEXT_PUBLIC_MAP_STYLE_URL` to your own
 * MapTiler / Stadia / self-hosted style URL.
 */
const MAP_STYLE_URL =
  process.env.NEXT_PUBLIC_MAP_STYLE_URL ||
  "data:application/json;charset=utf-8," +
    encodeURIComponent(
      JSON.stringify({
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://a.tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution: "© OpenStreetMap contributors"
          }
        },
        layers: [{ id: "osm", type: "raster", source: "osm" }]
      })
    );

interface RepLatest {
  repUserId: string;
  workSessionId: string;
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  recordedAt: string;
}

function statusCopy(state: TrackingSocketState): { label: string; variant: BadgeVariant } {
  switch (state) {
    case "open": return { label: "Connected", variant: "success" };
    case "connecting": return { label: "Connecting…", variant: "default" };
    case "reconnecting": return { label: "Reconnecting…", variant: "warning" };
    case "unauthorized": return { label: "Sign in required", variant: "destructive" };
    case "error": return { label: "Connection lost", variant: "destructive" };
    default: return { label: "Idle", variant: "secondary" };
  }
}

function buildMarkerElement(label: string, color: string): HTMLDivElement {
  const el = document.createElement("div");
  el.style.cssText =
    `background:${color};color:#fff;font-weight:600;font-size:11px;` +
    "padding:6px 10px;border-radius:999px;box-shadow:0 1px 6px rgba(0,0,0,0.25);" +
    "border:2px solid #ffffff;white-space:nowrap;font-family:Inter,system-ui,sans-serif;";
  el.textContent = label;
  return el;
}

function updateMarkerColor(el: HTMLDivElement, color: string): void {
  el.style.background = color;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === "\"" ? "&quot;" : "&#39;"
  );
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff) || diff < 0) return new Date(iso).toLocaleTimeString();
  const sec = Math.floor(diff / 1000);
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return new Date(iso).toLocaleString();
}

function freshnessColor(iso: string): string {
  const ageSec = (Date.now() - new Date(iso).getTime()) / 1000;
  if (ageSec < 60) return "#00aaff";       // fresh — primary blue
  if (ageSec < 5 * 60) return "#c2620f";   // amber — getting stale
  return "#9ca3af";                         // gray — stale (>5 min)
}

export default function LiveMapPage(): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const markersRef = useRef<Record<string, Marker>>({});
  const repsRef = useRef<Record<string, RepLatest>>({});
  const [mapError, setMapError] = useState<string | null>(null);
  const [reps, setReps] = useState<Record<string, RepLatest>>({});
  const [mapReady, setMapReady] = useState(false);
  const [token, setToken] = useState<string | null | undefined>(undefined);

  // Read the auth token on the client only (localStorage is unavailable in SSR).
  useEffect(() => {
    setToken(window.localStorage.getItem("field_sales_token"));
  }, []);

  // Initialise MapLibre once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE_URL,
      center: [0, 20],
      zoom: 1.5,
      attributionControl: { compact: true }
    });
    map.on("load", () => setMapReady(true));
    map.on("error", (e) => {
      if (e?.error && (e.error as Error).message?.includes("Failed to fetch")) {
        setMapError("Map tiles failed to load. Check your network connection.");
      }
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), "top-right");
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Seed the map with the latest known position per active session. Called on
  // every (re)connect so positions that changed while the socket was down still
  // appear — without it the page would stay empty until the next live ping, and
  // any movement during an outage would be silently missed.
  const seedLatestPositions = useCallback(async () => {
    const latest = await safeFetch(() => apiClient.listLatestPositions(), null);
    if (!latest || latest.items.length === 0) return;
    const next: Record<string, RepLatest> = { ...repsRef.current };
    for (const row of latest.items) {
      next[row.repUserId] = {
        repUserId: row.repUserId,
        workSessionId: row.workSessionId,
        latitude: row.latitude,
        longitude: row.longitude,
        accuracyMeters: row.accuracyMeters,
        recordedAt: row.recordedAt
      };
    }
    repsRef.current = next;
    setReps(next);
  }, []);

  const handleTrackingMessage = useCallback((data: string) => {
    try {
      const parsed = JSON.parse(data) as TrackingLocationRecordedEvent | { type: string };
      if (parsed.type !== "tracking.location.recorded") return;
      const ev = parsed as TrackingLocationRecordedEvent;
      const latest: RepLatest = {
        repUserId: ev.repUserId,
        workSessionId: ev.workSessionId,
        latitude: ev.latitude,
        longitude: ev.longitude,
        accuracyMeters: ev.accuracyMeters,
        recordedAt: ev.recordedAt
      };
      repsRef.current = { ...repsRef.current, [ev.repUserId]: latest };
      setReps(repsRef.current);
    } catch {
      // ignore malformed frames
    }
  }, []);

  // Live updates over the shared reconnecting tracking socket. `token === undefined`
  // means we haven't read localStorage yet (keep the hook idle); `null` means
  // signed out (the hook reports `unauthorized`).
  const { state, attempts, retry } = useTrackingSocket({
    wsUrl: WS_URL,
    token,
    enabled: token !== undefined,
    onMessage: handleTrackingMessage,
    onOpen: () => { void seedLatestPositions(); }
  });

  // Prune reps whose last ping has aged out of the live window. Without this a
  // marker added from a real ping would linger on the map forever once the rep
  // stops pinging (app closed, session ended) — exactly the "fake live location"
  // we're guarding against. Runs every 15s; the backend seed/query already
  // applies the same window server-side, this keeps a long-open dashboard honest.
  useEffect(() => {
    const prune = () => {
      const cutoff = Date.now() - LIVE_WINDOW_SECONDS * 1000;
      let changed = false;
      const next: Record<string, RepLatest> = {};
      for (const [id, rep] of Object.entries(repsRef.current)) {
        if (new Date(rep.recordedAt).getTime() >= cutoff) {
          next[id] = rep;
        } else {
          changed = true;
        }
      }
      if (changed) {
        repsRef.current = next;
        setReps(next);
      }
    };
    const t = setInterval(prune, 15_000);
    return () => clearInterval(t);
  }, []);

  // Sync markers with reps state whenever either changes.
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    const repIds = new Set(Object.keys(reps));

    for (const [id, marker] of Object.entries(markersRef.current)) {
      if (!repIds.has(id)) {
        marker.remove();
        delete markersRef.current[id];
      }
    }

    for (const rep of Object.values(reps)) {
      const lngLat: [number, number] = [rep.longitude, rep.latitude];
      const color = freshnessColor(rep.recordedAt);
      const popupHtml =
        `<div style="font-family:Inter,system-ui,sans-serif;font-size:12px;color:#111827;">
           <div style="font-weight:600;margin-bottom:2px;">${escapeHtml(rep.repUserId)}</div>
           <div style="color:#6b7280;">Updated ${escapeHtml(relativeTime(rep.recordedAt))}</div>
           <div style="color:#6b7280;">Session ${escapeHtml(rep.workSessionId)}</div>
           ${rep.accuracyMeters !== null ? `<div style="color:#6b7280;">Accuracy ±${Math.round(rep.accuracyMeters)} m</div>` : ""}
         </div>`;
      const existing = markersRef.current[rep.repUserId];
      if (existing) {
        existing.setLngLat(lngLat);
        const el = existing.getElement() as HTMLDivElement | null;
        if (el) updateMarkerColor(el, color);
        existing.getPopup()?.setHTML(popupHtml);
      } else {
        const popup = new maplibregl.Popup({ offset: 14, closeButton: false }).setHTML(popupHtml);
        const marker = new maplibregl.Marker({ element: buildMarkerElement(rep.repUserId, color) })
          .setLngLat(lngLat)
          .setPopup(popup)
          .addTo(map);
        markersRef.current[rep.repUserId] = marker;
      }
    }

    const repList = Object.values(reps);
    if (repList.length === 1) {
      map.easeTo({ center: [repList[0].longitude, repList[0].latitude], zoom: 13, duration: 600 });
    } else if (repList.length > 1) {
      const lngs = repList.map((r) => r.longitude);
      const lats = repList.map((r) => r.latitude);
      const bounds: LngLatBoundsLike = [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)]
      ];
      map.fitBounds(bounds, { padding: 80, maxZoom: 14, duration: 600 });
    }
  }, [reps, mapReady]);

  const status = statusCopy(state);
  const repCount = Object.keys(reps).length;

  // Connection banner: transient reconnects stay reassuring; only a give-up
  // (`error`) or an auth problem (`unauthorized`) reads as a hard failure with
  // a Retry affordance. `mapError` (tiles) is surfaced separately.
  const connectionBanner =
    state === "reconnecting"
      ? { tone: "warning" as const, text: "Reconnecting to the live tracking service…", showRetry: false }
      : state === "error"
        ? { tone: "destructive" as const, text: "We couldn't reach the live tracking service. It may be temporarily unavailable.", showRetry: true }
        : state === "unauthorized"
          ? { tone: "destructive" as const, text: "Please sign in again to view live team locations.", showRetry: false }
          : null;

  const overlayCls = "pointer-events-none absolute inset-0 z-[5] grid place-items-center bg-background/85 text-sm text-muted-foreground";

  return (
    <main className="shell font-sans">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Live team map</h1>
          <p className="mt-1 text-sm text-muted-foreground">Real-time locations from representatives on active work sessions.</p>
        </div>
        <Badge variant={status.variant} className="shrink-0">{status.label}</Badge>
      </div>

      {connectionBanner ? (
        <div
          className={
            connectionBanner.tone === "warning"
              ? "mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning-foreground"
              : "mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          }
        >
          <span>{connectionBanner.text}</span>
          {connectionBanner.showRetry ? (
            <Button size="sm" variant="outline" onClick={retry}>Retry</Button>
          ) : null}
        </div>
      ) : null}

      {mapError ? <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{mapError}</div> : null}

      <div ref={containerRef} className="relative h-[560px] w-full overflow-hidden rounded-lg border border-border bg-muted">
        {state === "connecting" ? (
          <div className={overlayCls}>Loading team locations…</div>
        ) : state === "reconnecting" ? (
          <div className={overlayCls}>Connection lost — reconnecting{attempts > 1 ? ` (attempt ${attempts})` : ""}…</div>
        ) : repCount === 0 && state === "open" ? (
          <div className={overlayCls}>No active representatives right now.</div>
        ) : state === "error" ? (
          <div className={overlayCls}>Unable to load live locations.</div>
        ) : null}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        {repCount} active representative{repCount === 1 ? "" : "s"} on the map. Updates arrive in real time as location pings are recorded.
      </p>
    </main>
  );
}
