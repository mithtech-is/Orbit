"use client";

import type { JSX } from "react";
import { RouteMapPicker } from "../components/route-map-picker";

import { useEffect, useRef, useState } from "react";
import { Printer, Map as MapIcon, MapPin, LocateFixed, Search, ExternalLink, GripVertical } from "lucide-react";
import { apiClient, safeFetch } from "../api-service";
import type { RoutePlanDetail, OutletSummary, UserSummary, PreviewedRouteResponse } from "@orbit/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:9000";

function planVariant(status: string): "success" | "default" | "secondary" {
  if (status === "completed") return "success";
  if (status === "in_progress") return "default";
  return "secondary";
}
function formatKm(m: number): string { return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`; }
function formatDuration(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60); const r = min % 60;
  return r === 0 ? `${h} h` : `${h} h ${r} min`;
}
/** Build a Google Maps turn-by-turn URL for the whole optimised route (start → stops in order). */
function gmapsDirUrl(start: { lat: number; lng: number }, stops: Array<{ latitude: number; longitude: number }>): string | null {
  if (stops.length === 0) return null;
  const dest = stops[stops.length - 1];
  const waypoints = stops.slice(0, -1).map((s) => `${s.latitude},${s.longitude}`).join("|");
  const u = new URL("https://www.google.com/maps/dir/");
  u.searchParams.set("api", "1");
  u.searchParams.set("origin", `${start.lat},${start.lng}`);
  u.searchParams.set("destination", `${dest.latitude},${dest.longitude}`);
  if (waypoints) u.searchParams.set("waypoints", waypoints);
  u.searchParams.set("travelmode", "driving");
  return u.toString();
}

export default function RoutePlansPage(): JSX.Element {
  const [plans, setPlans] = useState<RoutePlanDetail[]>([]);
  const [outlets, setOutlets] = useState<OutletSummary[]>([]);
  const [reps, setReps] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const [routeDate, setRouteDate] = useState(new Date().toISOString().slice(0, 10));
  const [assigneeId, setAssigneeId] = useState("");
  const [startLat, setStartLat] = useState("");
  const [startLng, setStartLng] = useState("");
  const [startLabel, setStartLabel] = useState("");      // human-readable start (no raw coords shown)
  const [addressQuery, setAddressQuery] = useState("");
  const [geoBusy, setGeoBusy] = useState(false);
  const [defaultDuration, setDefaultDuration] = useState("15");
  const [selectedOutletIds, setSelectedOutletIds] = useState<Set<string>>(new Set());
  const [outletFilter, setOutletFilter] = useState("");

  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<PreviewedRouteResponse | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bulkText, setBulkText] = useState("");
  const [transitioningId, setTransitioningId] = useState<string | null>(null);
  const [printPlan, setPrintPlan] = useState<RoutePlanDetail | null>(null);
  const [showMap, setShowMap] = useState(true);  // map-first: show the pin map by default

  const repName = (id: string) => reps.find((r) => r.id === id)?.name ?? id;

  async function load() {
    setLoading(true);
    const [planResult, outletResult, userResult] = await Promise.all([
      safeFetch(() => apiClient.listRoutePlans(), null),
      safeFetch(() => apiClient.listOutlets(), null),
      safeFetch(() => apiClient.listUsers(), null)
    ]);
    if (planResult) setPlans(planResult.items);
    if (outletResult) setOutlets(outletResult.items);
    if (userResult) {
      const activeReps = userResult.items.filter((u) => u.active);
      setReps(activeReps);
      const firstRep = activeReps.find((u) => u.role === "field_sales_representative");
      if (firstRep) setAssigneeId(firstRep.id);
    }
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem("field_sales_token");
    if (!token) return;
    const socket = new WebSocket(`${WS_URL}/ws/tracking?token=${encodeURIComponent(token)}`);
    socket.addEventListener("message", (event) => {
      try {
        const parsed = JSON.parse(event.data) as { type?: string };
        if (parsed.type === "route.plan.created" || parsed.type === "route.plan.assigned") void loadRef.current();
      } catch { /* ignore */ }
    });
    return () => socket.close();
  }, []);

  function toggleOutlet(id: string) {
    setSelectedOutletIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function selectAllVisible(visible: OutletSummary[]) { setSelectedOutletIds(new Set(visible.map((o) => o.id))); }
  function clearSelection() { setSelectedOutletIds(new Set()); setPreview(null); }
  function setStart(lat: number, lng: number, label: string) {
    setStartLat(String(lat)); setStartLng(String(lng)); setStartLabel(label); setError(null);
  }
  function clearStart() { setStartLat(""); setStartLng(""); setStartLabel(""); }
  function useFirstStopAsStart() {
    const first = outlets.find((o) => selectedOutletIds.has(o.id)) ?? outlets[0];
    if (!first) { setError("Add at least one outlet first, or use your current location / an address."); return; }
    setStart(first.latitude, first.longitude, `First stop · ${first.name}`);
  }
  function useCurrentLocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("This browser can't access location — search an address or use the first stop instead."); return;
    }
    setGeoBusy(true); setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setStart(pos.coords.latitude, pos.coords.longitude, "My current location"); setGeoBusy(false); },
      () => { setError("Couldn't get your location. Allow location access, or search an address."); setGeoBusy(false); },
      { enableHighAccuracy: true, timeout: 10_000 }
    );
  }
  async function searchAddress() {
    const q = addressQuery.trim();
    if (!q) return;
    setGeoBusy(true); setError(null);
    const r = await safeFetch(() => apiClient.geocode(q), null);  // backend geocoder (configured provider)
    setGeoBusy(false);
    if (r) { setStart(r.latitude, r.longitude, r.label); setAddressQuery(""); }
    else setError(`No place found for “${q}”. Try a more specific address, or pick it on the map.`);
  }

  // Manual drag-to-reorder of the optimised stops (rep priorities override the optimiser).
  const dragIndex = useRef<number | null>(null);
  function reorderStops(from: number, to: number) {
    setPreview((prev) => {
      if (!prev || from === to || from < 0 || to < 0) return prev;
      const stops = [...prev.orderedStops];
      const [moved] = stops.splice(from, 1);
      stops.splice(to, 0, moved);
      return { ...prev, orderedStops: stops };
    });
  }

  async function handlePreview() {
    setError(null); setMessage(null);
    if (selectedOutletIds.size === 0) { setError("Add at least one stop to the route."); return; }
    if (!startLat || !startLng) { setError("Set where the rep starts — use “My current location”, search an address, or start from the first stop."); return; }
    const lat = Number(startLat); const lng = Number(startLng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) { setError("That start location looks invalid — pick it again."); return; }
    const dur = Number(defaultDuration);
    if (!Number.isFinite(dur) || dur < 1) { setError("Visit duration must be a positive number of minutes."); return; }
    setPreviewing(true);
    try {
      const result = await apiClient.previewRoutePlan({
        routeDate,
        repLatitude: lat,
        repLongitude: lng,
        stopIds: Array.from(selectedOutletIds).map((outletId) => ({ outletId, expectedDurationMinutes: dur, priority: 0 }))
      });
      setPreview(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed.");
    } finally {
      setPreviewing(false);
    }
  }

  async function handleSave(release: boolean) {
    if (!preview) return;
    setError(null); setMessage(null); setSaving(true);
    try {
      const result = await apiClient.createRoutePlan({
        routeDate,
        assignedUserId: assigneeId || undefined,
        repLatitude: Number(startLat),
        repLongitude: Number(startLng),
        release,
        stopIds: preview.orderedStops.map((s) => ({ outletId: s.outletId, expectedDurationMinutes: s.expectedDurationMinutes, priority: s.priority }))
      });
      setMessage(release
        ? `Route released to ${repName(assigneeId)} with ${result.stops.length} stops.`
        : `Draft saved with ${result.stops.length} stops — release it when ready.`);
      setPreview(null);
      setSelectedOutletIds(new Set());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  function addBulk() {
    const wanted = bulkText.split(/[\n,]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (wanted.length === 0) return;
    const matched = outlets.filter((o) => wanted.some((w) => o.name.toLowerCase() === w || o.name.toLowerCase().includes(w)));
    setSelectedOutletIds((prev) => { const next = new Set(prev); matched.forEach((o) => next.add(o.id)); return next; });
    setMessage(`Matched ${matched.length} of ${wanted.length} pasted name(s).`);
    setBulkText("");
  }

  async function transition(planId: string, action: "release" | "start" | "complete" | "cancel") {
    setTransitioningId(planId); setError(null);
    try { await apiClient.transitionRoutePlan(planId, action); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : `Could not ${action} the plan.`); }
    finally { setTransitioningId(null); }
  }

  function doPrint(plan: RoutePlanDetail) {
    setPrintPlan(plan);
    setTimeout(() => { window.print(); setTimeout(() => setPrintPlan(null), 300); }, 60);
  }

  const filteredOutlets = outlets.filter((o) => !outletFilter || o.name.toLowerCase().includes(outletFilter.toLowerCase()));

  return (
    <main className="shell font-sans">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Route planner</h1>
          <p className="mt-1 text-sm text-muted-foreground">Build optimised daily routes for your representatives.</p>
        </div>
        <Badge variant="secondary" className="shrink-0">{loading ? "Loading…" : `${plans.length} routes`}</Badge>
      </div>

      {error ? <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div> : null}
      {message ? <div className="mb-4 rounded-md border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">{message}</div> : null}

      <Card className="mb-6">
        <CardHeader className="pb-3"><CardTitle className="text-base">Plan a new route</CardTitle></CardHeader>
        <CardContent>
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="rp-date">Route date</Label>
              <Input id="rp-date" type="date" value={routeDate} onChange={(e) => setRouteDate(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Assignee</Label>
              <Select value={assigneeId || undefined} onValueChange={setAssigneeId}>
                <SelectTrigger><SelectValue placeholder="Pick a rep" /></SelectTrigger>
                <SelectContent>{reps.map((r) => <SelectItem key={r.id} value={r.id}>{r.name} ({r.role.replace(/_/g, " ")})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rp-dur">Default visit duration (min)</Label>
              <Input id="rp-dur" type="number" min={1} value={defaultDuration} onChange={(e) => setDefaultDuration(e.target.value)} />
            </div>
          </div>

          {/* Start location — modern field-sales pattern: current location / address search / first stop. Never raw coordinates. */}
          <div className="mb-4 rounded-lg border border-border bg-muted/30 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <Label className="text-sm">Where does the rep start?</Label>
              {startLabel ? <button type="button" onClick={clearStart} className="text-xs text-muted-foreground hover:text-foreground">Change</button> : null}
            </div>
            {startLabel ? (
              <div className="flex items-center gap-2 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-foreground">
                <MapPin className="h-4 w-4 shrink-0 text-success" />
                <span className="truncate">{startLabel}</span>
              </div>
            ) : (
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
                <Button type="button" size="sm" onClick={useCurrentLocation} disabled={geoBusy}>
                  <LocateFixed className="h-4 w-4" /> {geoBusy ? "Locating…" : "My current location"}
                </Button>
                <span className="text-xs text-muted-foreground">or</span>
                <div className="flex flex-1 items-center gap-2">
                  <Input value={addressQuery} onChange={(e) => setAddressQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void searchAddress(); } }} placeholder="Search an address or place…" className="flex-1" />
                  <Button type="button" variant="outline" size="sm" onClick={() => void searchAddress()} disabled={geoBusy || !addressQuery.trim()}><Search className="h-4 w-4" /> Find</Button>
                </div>
                <span className="text-xs text-muted-foreground">or</span>
                <Button type="button" variant="outline" size="sm" onClick={useFirstStopAsStart} disabled={outlets.length === 0}>Start from first stop</Button>
              </div>
            )}
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Input placeholder="Filter outlets…" value={outletFilter} onChange={(e) => setOutletFilter(e.target.value)} className="w-[220px]" />
            <Button type="button" variant="outline" size="sm" onClick={() => selectAllVisible(filteredOutlets)} disabled={filteredOutlets.length === 0}>Select all visible ({filteredOutlets.length})</Button>
            <Button type="button" variant="outline" size="sm" onClick={clearSelection} disabled={selectedOutletIds.size === 0}>Clear ({selectedOutletIds.size} selected)</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setShowMap((v) => !v)}><MapIcon className="h-4 w-4" /> {showMap ? "Hide map" : "Pick on map"}</Button>
          </div>

          {showMap ? <RouteMapPicker outlets={filteredOutlets} selectedIds={selectedOutletIds} onToggle={toggleOutlet} /> : null}

          <details className="mb-3">
            <summary className="cursor-pointer text-xs text-muted-foreground">Bulk add by name (paste a list)</summary>
            <div className="mt-2 flex items-start gap-2">
              <Textarea value={bulkText} onChange={(e) => setBulkText(e.target.value)} placeholder={"One outlet name per line, or comma-separated"} rows={3} className="flex-1 text-xs" />
              <Button type="button" variant="outline" size="sm" onClick={addBulk} disabled={!bulkText.trim()}>Add matching</Button>
            </div>
          </details>

          <div className="max-h-60 overflow-y-auto rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-9"></TableHead>
                  <TableHead>Outlet</TableHead>
                  <TableHead>Last visited</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOutlets.map((o) => {
                  const daysSince = o.lastVisitedAt ? Math.floor((Date.now() - new Date(o.lastVisitedAt).getTime()) / 86_400_000) : null;
                  return (
                    <TableRow key={o.id} className={selectedOutletIds.has(o.id) ? "bg-primary/10" : undefined}>
                      <TableCell><input type="checkbox" className="h-4 w-4 cursor-pointer accent-primary" checked={selectedOutletIds.has(o.id)} onChange={() => toggleOutlet(o.id)} /></TableCell>
                      <TableCell className="font-medium text-foreground">{o.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{daysSince === null ? "—" : daysSince === 0 ? "today" : daysSince === 1 ? "yesterday" : `${daysSince}d ago`}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <Button variant="outline" onClick={handlePreview} disabled={previewing || selectedOutletIds.size === 0}>
              {previewing ? "Optimising…" : `Preview optimised route (${selectedOutletIds.size} stops)`}
            </Button>
            <Button variant="outline" onClick={() => void handleSave(false)} disabled={!preview || saving}>{saving ? "Saving…" : "Save as draft"}</Button>
            <Button onClick={() => void handleSave(true)} disabled={!preview || saving}>{saving ? "Saving…" : "Save & release"}</Button>
          </div>

          {preview ? (
            <div className="mt-4 rounded-lg border border-border bg-background p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">{preview.orderedStops.length} stops</Badge>
                  <Badge variant="secondary">{formatKm(preview.totalDistanceMeters)} travel</Badge>
                  <Badge variant="secondary">~{formatDuration(preview.totalDurationMinutes)} total</Badge>
                </div>
                {(() => {
                  const url = gmapsDirUrl({ lat: Number(startLat), lng: Number(startLng) }, preview.orderedStops);
                  return url ? (
                    <a href={url} target="_blank" rel="noreferrer">
                      <Button type="button" variant="outline" size="sm"><ExternalLink className="h-4 w-4" /> Open in Google Maps</Button>
                    </a>
                  ) : null;
                })()}
              </div>
              <p className="mb-1.5 text-xs text-muted-foreground">Optimised for shortest drive — drag a stop to reorder if you need a different sequence.</p>
              <ol className="space-y-1">
                {preview.orderedStops.map((stop, i) => (
                  <li
                    key={stop.outletId}
                    draggable
                    onDragStart={() => { dragIndex.current = i; }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => { if (dragIndex.current !== null) reorderStops(dragIndex.current, i); dragIndex.current = null; }}
                    onDragEnd={() => { dragIndex.current = null; }}
                    className="flex cursor-grab items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/50 active:cursor-grabbing"
                  >
                    <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold tabular-nums text-primary">{i + 1}</span>
                    <span className="flex-1 truncate font-medium text-foreground">{stop.outletName}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{stop.expectedDurationMinutes} min</span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <h2 className="mb-3 text-base font-semibold text-foreground">Recent routes</h2>
      {loading ? null : plans.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <h3 className="text-base font-semibold text-foreground">No routes planned</h3>
            <p className="text-sm text-muted-foreground">Use the planner above to assign daily stops to your representatives.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {plans.map((plan) => (
            <Card key={plan.id}>
              <CardContent className="p-4">
                <div className="mb-1.5 flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-foreground">{plan.routeDate.slice(0, 10)}</div>
                    <div className="text-xs text-muted-foreground">
                      Assigned to {repName(plan.assignedUserId)} · {plan.stops.length} stops · {formatKm(plan.plannedDistanceMeters)} · {formatDuration(plan.plannedDurationMinutes)}
                    </div>
                  </div>
                  <Badge variant={planVariant(plan.status)}>{plan.status.replace(/_/g, " ")}</Badge>
                </div>
                <details>
                  <summary className="cursor-pointer text-xs text-muted-foreground">View stops</summary>
                  <ol className="ml-5 mt-2 list-decimal text-sm text-muted-foreground">
                    {plan.stops.map((stop) => (
                      <li key={stop.id}>
                        {stop.outletName} — {stop.expectedDurationMinutes} min · {stop.status.replace(/_/g, " ")}
                        {stop.visitType ? ` · ${stop.visitType}` : ""}{stop.objective ? ` — ${stop.objective}` : ""}
                      </li>
                    ))}
                  </ol>
                </details>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(plan.status === "draft" || plan.status === "planned") && (
                    <Button variant="outline" size="sm" onClick={() => void transition(plan.id, "release")} disabled={transitioningId === plan.id}>Release</Button>
                  )}
                  {(plan.status === "released" || plan.status === "planned") && (
                    <Button variant="outline" size="sm" onClick={() => void transition(plan.id, "start")} disabled={transitioningId === plan.id}>Start</Button>
                  )}
                  {(plan.status === "in_progress" || plan.status === "released") && (
                    <Button variant="outline" size="sm" onClick={() => void transition(plan.id, "complete")} disabled={transitioningId === plan.id}>Complete</Button>
                  )}
                  {plan.status !== "completed" && plan.status !== "cancelled" && (
                    <Button variant="ghost" size="sm" onClick={() => void transition(plan.id, "cancel")} disabled={transitioningId === plan.id}>Cancel</Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => doPrint(plan)}><Printer className="h-4 w-4" /> Print</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Print-only Day Plan card (shown only by @media print, see styles.css). */}
      {printPlan ? (
        <div className="print-area">
          <h1 style={{ margin: "0 0 4px" }}>Day Plan — {printPlan.routeDate.slice(0, 10)}</h1>
          <p style={{ margin: "0 0 16px", color: "#444" }}>
            Rep: {repName(printPlan.assignedUserId)} · {printPlan.stops.length} stops · {formatKm(printPlan.plannedDistanceMeters)} · {formatDuration(printPlan.plannedDurationMinutes)} · Status: {printPlan.status}
          </p>
          <table className="print-table">
            <thead><tr><th>#</th><th>Outlet</th><th>Type</th><th>Objective</th><th>Mins</th><th>Done ✓</th></tr></thead>
            <tbody>
              {printPlan.stops.map((s) => (
                <tr key={s.id}>
                  <td>{s.stopOrder}</td>
                  <td>{s.outletName}</td>
                  <td>{s.visitType ?? "—"}</td>
                  <td>{s.objective ?? "—"}</td>
                  <td>{s.expectedDurationMinutes}</td>
                  <td style={{ width: 60 }}>&nbsp;</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ marginTop: 24, color: "#888", fontSize: 11 }}>Orbit · printed {new Date().toLocaleString()}</p>
        </div>
      ) : null}
    </main>
  );
}
