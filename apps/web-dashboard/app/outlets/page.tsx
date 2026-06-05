"use client";

import type { JSX } from "react";

import { useEffect, useMemo, useState } from "react";
import { Plus, Upload, Download } from "lucide-react";
import { apiClient, safeFetch } from "../api-service";
import { exportTextFile, toCsv } from "../desktop-bridge";
import type { OutletSummary } from "@orbit/api-client";
import { LocationPicker } from "../components/location-picker";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface OutletDraft {
  id?: string;
  name: string;
  latitude: string;
  longitude: string;
}

const EMPTY_DRAFT: OutletDraft = { name: "", latitude: "", longitude: "" };

export default function OutletsPage(): JSX.Element {
  const [outlets, setOutlets] = useState<OutletSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"name" | "lastVisited" | "visits">("name");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<OutletDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ createdCount: number; failedCount: number; failures: Array<{ row: number; reason: string }> } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const result = await safeFetch(() => apiClient.listOutlets(), null);
    if (result) { setOutlets(result.items); setError(null); }
    else setError("We couldn't load outlets. Please try again.");
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  const sorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = q ? outlets.filter((o) => o.name.toLowerCase().includes(q)) : outlets;
    return [...base].sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "visits") return (b.visitCount ?? 0) - (a.visitCount ?? 0);
      const at = a.lastVisitedAt ? new Date(a.lastVisitedAt).getTime() : -1;
      const bt = b.lastVisitedAt ? new Date(b.lastVisitedAt).getTime() : -1;
      if (at === -1 && bt === -1) return a.name.localeCompare(b.name);
      if (at === -1) return 1;
      if (bt === -1) return -1;
      return bt - at;
    });
  }, [outlets, sortBy, search]);

  async function handleExport() {
    if (outlets.length === 0) return;
    const csv = toCsv(outlets, ["id", "name", "latitude", "longitude", "organisationId"]);
    await exportTextFile({ suggestedName: `outlets-${new Date().toISOString().slice(0, 10)}.csv`, mimeType: "text/csv", contents: csv });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setFormError(null);
    const lat = Number(draft.latitude);
    const lng = Number(draft.longitude);
    if (!draft.name.trim()) { setFormError("Name is required."); return; }
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) { setFormError("Set the outlet's location — search an address, use your location, or drop a pin on the map."); return; }
    setSaving(true);
    try {
      if (draft.id) await apiClient.updateOutlet(draft.id, { name: draft.name.trim(), latitude: lat, longitude: lng });
      else await apiClient.createOutlet({ name: draft.name.trim(), latitude: lat, longitude: lng });
      setDraft(null);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    setImportError(null);
    setImportResult(null);
    if (!csvText.trim()) { setImportError("Paste CSV content first."); return; }
    setImporting(true);
    try {
      const result = await apiClient.importOutletsCsv(csvText);
      setImportResult(result);
      if (result.failedCount === 0) { setCsvText(""); setImportOpen(false); }
      await load();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setImporting(false);
    }
  }

  function handleCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCsvText(typeof reader.result === "string" ? reader.result : "");
    reader.readAsText(file);
  }

  async function handleDelete(outlet: OutletSummary) {
    if (!confirm(`Delete outlet "${outlet.name}"? This cannot be undone.`)) return;
    try { await apiClient.deleteOutlet(outlet.id); await load(); }
    catch (err) { alert(err instanceof Error ? err.message : "Delete failed."); }
  }

  return (
    <main className="shell font-sans">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Outlets</h1>
          <p className="mt-1 text-sm text-muted-foreground">Customer locations your representatives visit.</p>
        </div>
        <Badge variant="secondary" className="shrink-0">{loading ? "Loading…" : `${outlets.length} outlets`}</Badge>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Button onClick={() => setDraft(EMPTY_DRAFT)}><Plus className="h-4 w-4" /> New outlet</Button>
        <Button variant="outline" onClick={() => { setImportOpen(true); setImportResult(null); setImportError(null); }}>
          <Upload className="h-4 w-4" /> Import CSV
        </Button>
        <Button variant="outline" onClick={handleExport} disabled={outlets.length === 0}>
          <Download className="h-4 w-4" /> Export CSV
        </Button>
        <div className="ml-auto flex items-center gap-3">
          <Input className="h-9 w-56" placeholder="Search outlets…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Sort: Name A–Z</SelectItem>
              <SelectItem value="lastVisited">Sort: Last visited ↓</SelectItem>
              <SelectItem value="visits">Sort: Visits ↓</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {importResult && importResult.failedCount === 0 ? (
        <div className="mb-4 rounded-md border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
          Imported {importResult.createdCount} outlet{importResult.createdCount === 1 ? "" : "s"}.
        </div>
      ) : null}
      {error ? (
        <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
      ) : null}

      {loading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Loading outlets…</p>
      ) : outlets.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <h3 className="text-base font-semibold text-foreground">No outlets yet</h3>
            <p className="text-sm text-muted-foreground">Add your first outlet to start planning routes and capturing visits.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Last visited</TableHead>
                <TableHead>Visits</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((outlet) => {
                const daysSince = outlet.lastVisitedAt ? Math.floor((Date.now() - new Date(outlet.lastVisitedAt).getTime()) / 86_400_000) : null;
                const lastVisitLabel = outlet.lastVisitedAt ? (daysSince === 0 ? "today" : daysSince === 1 ? "yesterday" : `${daysSince} days ago`) : "—";
                const stale = daysSince !== null && daysSince > 30;
                return (
                  <TableRow key={outlet.id}>
                    <TableCell className="font-medium text-foreground">{outlet.name}</TableCell>
                    <TableCell className={stale ? "text-destructive" : "text-muted-foreground"}>{lastVisitLabel}</TableCell>
                    <TableCell className="tabular-nums">{outlet.visitCount ?? 0}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => setDraft({ id: outlet.id, name: outlet.name, latitude: String(outlet.latitude), longitude: String(outlet.longitude) })}>Edit</Button>
                        <Button variant="destructive" size="sm" onClick={() => void handleDelete(outlet)}>Delete</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Create / edit outlet */}
      <Dialog open={draft !== null} onOpenChange={(o) => { if (!o) setDraft(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit outlet" : "Add an outlet"}</DialogTitle>
            <DialogDescription>Set the location by searching an address, using your location, or dropping a pin — it powers geofence check-in and route planning.</DialogDescription>
          </DialogHeader>
          {draft ? (
            <form onSubmit={handleSave} className="grid gap-4">
              {formError ? <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{formError}</div> : null}
              <div className="grid gap-1.5">
                <Label htmlFor="outlet-name">Outlet name</Label>
                <Input id="outlet-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required autoFocus />
              </div>
              <div className="grid gap-1.5">
                <Label>Location</Label>
                <LocationPicker
                  value={draft.latitude && draft.longitude ? { latitude: Number(draft.latitude), longitude: Number(draft.longitude) } : null}
                  onChange={(loc) => setDraft({ ...draft, latitude: loc ? String(loc.latitude) : "", longitude: loc ? String(loc.longitude) : "" })}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDraft(null)} disabled={saving}>Cancel</Button>
                <Button type="submit" disabled={saving}>{saving ? "Saving…" : draft.id ? "Save changes" : "Add outlet"}</Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* CSV import */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import outlets from CSV</DialogTitle>
            <DialogDescription>
              Required columns: <code className="font-mono">name,latitude,longitude</code>. First row is the header. Up to 1000 rows.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleImport} className="grid gap-4">
            {importError ? <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{importError}</div> : null}
            {importResult && importResult.failedCount > 0 ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                Imported {importResult.createdCount}, failed {importResult.failedCount}.
                {importResult.failures.length > 0 ? (
                  <ul className="ml-4 mt-1.5 list-disc">
                    {importResult.failures.slice(0, 8).map((f) => <li key={f.row}>Row {f.row}: {f.reason}</li>)}
                    {importResult.failures.length > 8 ? <li>… and {importResult.failures.length - 8} more</li> : null}
                  </ul>
                ) : null}
              </div>
            ) : null}
            <div className="grid gap-1.5">
              <Label htmlFor="csv-file">Upload .csv</Label>
              <Input id="csv-file" type="file" accept=".csv,text/csv" onChange={handleCsvFile} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="csv-text">Or paste CSV content</Label>
              <Textarea
                id="csv-text"
                rows={9}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder={"name,latitude,longitude\nKoramangala Outlet,12.9352,77.6245"}
                className="font-mono text-xs"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setImportOpen(false)} disabled={importing}>Close</Button>
              <Button type="submit" disabled={importing}>{importing ? "Importing…" : "Import"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}
