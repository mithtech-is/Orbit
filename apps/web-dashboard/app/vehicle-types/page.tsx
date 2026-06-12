"use client";

import type { JSX } from "react";

import { useEffect, useState } from "react";
import { apiClient, safeFetch } from "../api-service";
import type { VehicleTypeSummary } from "@orbit/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function rupees(cents: number, currency = "INR"): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)}`;
  }
}

export default function VehicleTypesPage(): JSX.Element {
  const [items, setItems] = useState<VehicleTypeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Create form state
  const [name, setName] = useState("");
  const [ratePerKm, setRatePerKm] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Inline edit state — null means "not editing"
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editRate, setEditRate] = useState("");

  async function load() {
    setLoading(true);
    const res = await safeFetch(() => apiClient.listVehicleTypes(), null);
    if (res) { setItems(res.items); setError(null); }
    else setError("Couldn't load vehicle types.");
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  async function create() {
    setError(null); setMessage(null);
    const ratePerKmCents = Math.round(Number(ratePerKm) * 100);
    if (name.trim().length === 0) { setError("Name is required."); return; }
    if (!Number.isFinite(ratePerKmCents) || ratePerKmCents < 0) { setError("Rate must be a non-negative number."); return; }
    setSubmitting(true);
    try {
      await apiClient.createVehicleType({ name: name.trim(), fuelRatePerKmCents: ratePerKmCents });
      setMessage(`Added "${name.trim()}" at ₹${(ratePerKmCents / 100).toFixed(2)}/km.`);
      setName(""); setRatePerKm("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create.");
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(item: VehicleTypeSummary) {
    setEditingId(item.id);
    setEditName(item.name);
    setEditRate((item.fuelRatePerKmCents / 100).toString());
  }
  async function saveEdit(item: VehicleTypeSummary) {
    setError(null);
    const ratePerKmCents = Math.round(Number(editRate) * 100);
    if (!editName.trim()) { setError("Name is required."); return; }
    if (!Number.isFinite(ratePerKmCents) || ratePerKmCents < 0) { setError("Rate must be a non-negative number."); return; }
    try {
      await apiClient.updateVehicleType(item.id, { name: editName.trim(), fuelRatePerKmCents: ratePerKmCents });
      setMessage(`Updated "${editName.trim()}".`);
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update.");
    }
  }
  async function deactivate(item: VehicleTypeSummary) {
    if (!confirm(`Deactivate "${item.name}"? Reps assigned to it will fall back to the org default fuel rate.`)) return;
    try {
      await apiClient.deactivateVehicleType(item.id);
      setMessage(`Deactivated "${item.name}".`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't deactivate.");
    }
  }
  async function reactivate(item: VehicleTypeSummary) {
    try {
      await apiClient.updateVehicleType(item.id, { active: true });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't reactivate.");
    }
  }

  return (
    <main className="shell font-sans">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Vehicle types</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Define vehicle classes and their ₹/km fuel rate. Reps inherit this rate
            from their assigned vehicle; admins can override per rep.
          </p>
        </div>
        <Badge variant="secondary" className="shrink-0">{loading ? "Loading…" : `${items.length} types`}</Badge>
      </div>

      {error ? <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div> : null}
      {message ? <div className="mb-4 rounded-md border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">{message}</div> : null}

      <Card className="mb-6">
        <CardHeader className="pb-3"><CardTitle className="text-base">Add a vehicle type</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-[1fr,180px,auto]">
            <div className="grid gap-1.5">
              <Label htmlFor="vt-name">Name</Label>
              <Input id="vt-name" value={name} placeholder="Bike, Car, Scooter…" onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="vt-rate">Rate (₹ / km)</Label>
              <Input id="vt-rate" type="number" step="0.01" min={0} value={ratePerKm} placeholder="e.g. 3.50" onChange={(e) => setRatePerKm(e.target.value)} />
            </div>
            <div className="flex items-end">
              <Button onClick={create} disabled={submitting}>{submitting ? "Adding…" : "Add"}</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vehicle</TableHead>
              <TableHead>Rate</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((v) => (
              <TableRow key={v.id}>
                <TableCell className="font-medium">
                  {editingId === v.id
                    ? <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-8" />
                    : v.name}
                </TableCell>
                <TableCell className="tabular-nums">
                  {editingId === v.id
                    ? <Input type="number" step="0.01" min={0} value={editRate} onChange={(e) => setEditRate(e.target.value)} className="h-8 w-32" />
                    : `${rupees(v.fuelRatePerKmCents)} / km`}
                </TableCell>
                <TableCell>{v.active ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}</TableCell>
                <TableCell>
                  {editingId === v.id ? (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => void saveEdit(v)}>Save</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => startEdit(v)}>Edit</Button>
                      {v.active
                        ? <Button size="sm" variant="ghost" onClick={() => void deactivate(v)}>Deactivate</Button>
                        : <Button size="sm" variant="ghost" onClick={() => void reactivate(v)}>Reactivate</Button>}
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {!loading && items.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">No vehicle types yet — add one above.</TableCell></TableRow>
            ) : null}
          </TableBody>
        </Table>
      </Card>
    </main>
  );
}
