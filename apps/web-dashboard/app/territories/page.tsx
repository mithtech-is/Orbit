"use client";

import type { JSX } from "react";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { apiClient, safeFetch } from "../api-service";
import type { TerritorySummary } from "@orbit/api-client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface TerritoryDraft {
  id?: string;
  name: string;
  minLatitude: string;
  maxLatitude: string;
  minLongitude: string;
  maxLongitude: string;
}

const EMPTY_DRAFT: TerritoryDraft = { name: "", minLatitude: "", maxLatitude: "", minLongitude: "", maxLongitude: "" };

function boundsToWkt(d: TerritoryDraft): string {
  const minLat = Number(d.minLatitude);
  const maxLat = Number(d.maxLatitude);
  const minLng = Number(d.minLongitude);
  const maxLng = Number(d.maxLongitude);
  return `MULTIPOLYGON(((${minLng} ${minLat}, ${maxLng} ${minLat}, ${maxLng} ${maxLat}, ${minLng} ${maxLat}, ${minLng} ${minLat})))`;
}

export default function TerritoriesPage(): JSX.Element {
  const [territories, setTerritories] = useState<TerritorySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<TerritoryDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const result = await safeFetch(() => apiClient.listTerritories(), null);
    if (result) { setTerritories(result.items); setError(null); }
    else setError("We couldn't load territories. Please try again.");
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setFormError(null);
    if (!draft.name.trim()) { setFormError("Name is required."); return; }
    const minLat = Number(draft.minLatitude);
    const maxLat = Number(draft.maxLatitude);
    const minLng = Number(draft.minLongitude);
    const maxLng = Number(draft.maxLongitude);
    if (![minLat, maxLat, minLng, maxLng].every(Number.isFinite)) { setFormError("All bound values must be numeric."); return; }
    if (minLat >= maxLat) { setFormError("Min latitude must be less than max latitude."); return; }
    if (minLng >= maxLng) { setFormError("Min longitude must be less than max longitude."); return; }
    if (Math.abs(minLat) > 90 || Math.abs(maxLat) > 90) { setFormError("Latitudes must be between -90 and 90."); return; }
    if (Math.abs(minLng) > 180 || Math.abs(maxLng) > 180) { setFormError("Longitudes must be between -180 and 180."); return; }
    setSaving(true);
    try {
      const payload = { name: draft.name.trim(), boundaryWkt: boundsToWkt(draft) };
      if (draft.id) await apiClient.updateTerritory(draft.id, payload);
      else await apiClient.createTerritory(payload);
      setDraft(null);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(t: TerritorySummary) {
    if (!confirm(`Delete territory "${t.name}"? Outlets inside the area keep their data — only the boundary is removed.`)) return;
    try { await apiClient.deleteTerritory(t.id); await load(); }
    catch (err) { alert(err instanceof Error ? err.message : "Delete failed."); }
  }

  return (
    <main className="shell font-sans">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Territories</h1>
          <p className="mt-1 text-sm text-muted-foreground">Geographic areas assigned to your sales teams.</p>
        </div>
        <Badge variant="secondary" className="shrink-0">{loading ? "Loading…" : `${territories.length} territories`}</Badge>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Button onClick={() => setDraft(EMPTY_DRAFT)}><Plus className="h-4 w-4" /> New territory</Button>
        <span className="text-xs text-muted-foreground">Territories are defined by a bounding box. For complex polygons use the API with a WKT MULTIPOLYGON.</span>
      </div>

      {error ? (
        <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
      ) : null}

      {loading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Loading territories…</p>
      ) : territories.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <h3 className="text-base font-semibold text-foreground">No territories defined</h3>
            <p className="text-sm text-muted-foreground">Create a territory to group outlets by geography for route planning and reporting.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Latitude range</TableHead>
                <TableHead>Longitude range</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {territories.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium text-foreground">{t.name}</TableCell>
                  <TableCell className="font-mono text-xs">{t.bounds.minLatitude.toFixed(4)} to {t.bounds.maxLatitude.toFixed(4)}</TableCell>
                  <TableCell className="font-mono text-xs">{t.bounds.minLongitude.toFixed(4)} to {t.bounds.maxLongitude.toFixed(4)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setDraft({
                        id: t.id,
                        name: t.name,
                        minLatitude: String(t.bounds.minLatitude),
                        maxLatitude: String(t.bounds.maxLatitude),
                        minLongitude: String(t.bounds.minLongitude),
                        maxLongitude: String(t.bounds.maxLongitude)
                      })}>Edit</Button>
                      <Button variant="destructive" size="sm" onClick={() => void handleDelete(t)}>Delete</Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog open={draft !== null} onOpenChange={(o) => { if (!o) setDraft(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit territory" : "Add a territory"}</DialogTitle>
            <DialogDescription>Define the bounding box. Use a tool like geojson.io to find lat/lng corners on a map.</DialogDescription>
          </DialogHeader>
          {draft ? (
            <form onSubmit={handleSave} className="grid gap-4">
              {formError ? <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{formError}</div> : null}
              <div className="grid gap-1.5">
                <Label htmlFor="terr-name">Territory name</Label>
                <Input id="terr-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="terr-minlat">Min latitude (south)</Label>
                  <Input id="terr-minlat" type="number" step="0.000001" value={draft.minLatitude} onChange={(e) => setDraft({ ...draft, minLatitude: e.target.value })} required />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="terr-maxlat">Max latitude (north)</Label>
                  <Input id="terr-maxlat" type="number" step="0.000001" value={draft.maxLatitude} onChange={(e) => setDraft({ ...draft, maxLatitude: e.target.value })} required />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="terr-minlng">Min longitude (west)</Label>
                  <Input id="terr-minlng" type="number" step="0.000001" value={draft.minLongitude} onChange={(e) => setDraft({ ...draft, minLongitude: e.target.value })} required />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="terr-maxlng">Max longitude (east)</Label>
                  <Input id="terr-maxlng" type="number" step="0.000001" value={draft.maxLongitude} onChange={(e) => setDraft({ ...draft, maxLongitude: e.target.value })} required />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDraft(null)} disabled={saving}>Cancel</Button>
                <Button type="submit" disabled={saving}>{saving ? "Saving…" : draft.id ? "Save changes" : "Create territory"}</Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </main>
  );
}
