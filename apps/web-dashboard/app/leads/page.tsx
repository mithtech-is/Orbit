"use client";

import type { JSX } from "react";

import { useEffect, useState } from "react";
import { Plus, MapPin } from "lucide-react";
import { apiClient, safeFetch, loadSession } from "../api-service";
import type { LeadSummary, OutletSummary, UserSummary } from "@orbit/api-client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { LocationPicker } from "../components/location-picker";

const LEAD_STATUSES = ["new", "qualified", "in_progress", "won", "lost"];

const STATUS_VARIANT: Record<string, "info" | "secondary" | "success" | "destructive" | "outline"> = {
  new: "outline",
  qualified: "secondary",
  in_progress: "info",
  won: "success",
  lost: "destructive"
};

interface LeadDraft {
  id?: string;
  outletId: string;
  name: string;
  status: string;
  priority: string;
  assignedUserId: string;
  assignedUserName: string | null;
  latitude: number | null;
  longitude: number | null;
}

const EMPTY_DRAFT: LeadDraft = { outletId: "", name: "", status: "new", priority: "3", assignedUserId: "", assignedUserName: null, latitude: null, longitude: null };

export default function LeadsPage(): JSX.Element {
  const [leads, setLeads] = useState<LeadSummary[]>([]);
  const [outlets, setOutlets] = useState<OutletSummary[]>([]);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<LeadDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  // Only admins (team:manage) may delete leads or change a lead's assigned rep.
  // Other roles with lead:write can still edit the lead's details.
  const [canManage, setCanManage] = useState(false);

  async function load() {
    setLoading(true);
    setCanManage(Boolean(loadSession()?.permissions?.includes("team:manage")));
    const [leadList, outletList, userList] = await Promise.all([
      safeFetch(() => apiClient.listLeads(), null),
      safeFetch(() => apiClient.listOutlets(), null),
      safeFetch(() => apiClient.listUsers(), null)
    ]);
    if (leadList) setLeads(leadList.items);
    else setError("We couldn't load leads. Please try again.");
    if (outletList) setOutlets(outletList.items);
    if (userList) setUsers(userList.items.filter((u) => u.active));
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  const outletName = (id: string) => outlets.find((o) => o.id === id)?.name ?? id;
  const userName = (id: string) => users.find((u) => u.id === id)?.name ?? id;

  const statuses = Array.from(new Set(leads.map((l) => l.status)));
  const q = search.trim().toLowerCase();
  const filtered = leads.filter((l) => {
    if (statusFilter !== "all" && l.status !== statusFilter) return false;
    if (!q) return true;
    return l.name.toLowerCase().includes(q)
      || outletName(l.outletId).toLowerCase().includes(q)
      || (l.assignedUserId ? userName(l.assignedUserId).toLowerCase().includes(q) : false);
  });

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setFormError(null);
    if (!draft.name.trim()) { setFormError("Lead name is required."); return; }
    if (!draft.outletId) { setFormError("Pick an outlet."); return; }
    const priority = Number(draft.priority);
    if (!Number.isFinite(priority) || priority < 1 || priority > 5) { setFormError("Priority must be 1–5."); return; }
    setSaving(true);
    try {
      const payload = {
        outletId: draft.outletId,
        name: draft.name.trim(),
        status: draft.status,
        priority,
        assignedUserId: draft.assignedUserId || undefined,
        latitude: draft.latitude,
        longitude: draft.longitude
      };
      if (draft.id) await apiClient.updateLead(draft.id, payload);
      else await apiClient.createLead(payload);
      setDraft(null);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(lead: LeadSummary) {
    if (!confirm(`Delete lead "${lead.name}"? This cannot be undone.`)) return;
    try {
      await apiClient.deleteLead(lead.id);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed.");
    }
  }

  return (
    <main className="shell font-sans">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Leads</h1>
          <p className="mt-1 text-sm text-muted-foreground">Prospects assigned to your team for follow-up.</p>
        </div>
        <Badge variant="secondary" className="shrink-0">{loading ? "Loading…" : `${leads.length} leads`}</Badge>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Button onClick={() => setDraft({ ...EMPTY_DRAFT, outletId: outlets[0]?.id ?? "" })} disabled={outlets.length === 0}>
          <Plus className="h-4 w-4" /> New lead
        </Button>
        <Input className="h-9 w-56" placeholder="Search name, outlet, rep…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-44"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {statuses.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}
          </SelectContent>
        </Select>
        {outlets.length === 0 && !loading ? (
          <span className="text-sm text-muted-foreground">Add an outlet first — leads must be linked to an outlet.</span>
        ) : null}
      </div>

      {error ? (
        <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
      ) : null}

      {loading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Loading leads…</p>
      ) : leads.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <h3 className="text-base font-semibold text-foreground">No leads yet</h3>
            <p className="text-sm text-muted-foreground">New prospects appear here once added — captured leads also sync to your CRM.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Outlet</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Assigned representative</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">No leads match your filters.</TableCell></TableRow>
              ) : null}
              {filtered.map((lead) => (
                <TableRow key={lead.id}>
                  <TableCell className="font-medium text-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      {lead.name}
                      {lead.latitude != null && lead.longitude != null ? (
                        <MapPin className="h-3.5 w-3.5 text-muted-foreground" aria-label="Has a pinned location" />
                      ) : null}
                    </span>
                  </TableCell>
                  <TableCell>{outletName(lead.outletId)}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[lead.status] ?? "outline"}>{lead.status.replace(/_/g, " ")}</Badge>
                  </TableCell>
                  <TableCell className="tabular-nums">{lead.priority}</TableCell>
                  <TableCell>
                    {lead.assignedUserId
                      ? (lead.assignedUserName ?? userName(lead.assignedUserId))
                      : <span className="text-muted-foreground">Unassigned</span>}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setDraft({
                        id: lead.id,
                        outletId: lead.outletId,
                        name: lead.name,
                        status: lead.status,
                        priority: String(lead.priority),
                        assignedUserId: lead.assignedUserId ?? "",
                        assignedUserName: lead.assignedUserName,
                        latitude: lead.latitude,
                        longitude: lead.longitude
                      })}>Edit</Button>
                      {canManage ? (
                        <Button variant="destructive" size="sm" onClick={() => void handleDelete(lead)}>Delete</Button>
                      ) : null}
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
            <DialogTitle>{draft?.id ? "Edit lead" : "Add a lead"}</DialogTitle>
            <DialogDescription>Link this prospect to an outlet so your team can visit it.</DialogDescription>
          </DialogHeader>
          {draft ? (
            <form onSubmit={handleSave} className="grid gap-4">
              {formError ? (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{formError}</div>
              ) : null}
              <div className="grid gap-1.5">
                <Label htmlFor="lead-name">Lead name</Label>
                <Input id="lead-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required autoFocus />
              </div>
              <div className="grid gap-1.5">
                <Label>Outlet</Label>
                <Select value={draft.outletId} onValueChange={(v) => setDraft({ ...draft, outletId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select outlet" /></SelectTrigger>
                  <SelectContent>
                    {outlets.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-1.5">
                  <Label>Status</Label>
                  <Select value={draft.status} onValueChange={(v) => setDraft({ ...draft, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {LEAD_STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="lead-priority">Priority (1 high – 5 low)</Label>
                  <Input id="lead-priority" type="number" min="1" max="5" value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value })} />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label>Assigned representative</Label>
                <Select
                  value={draft.assignedUserId || "unassigned"}
                  onValueChange={(v) => setDraft({ ...draft, assignedUserId: v === "unassigned" ? "" : v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">— Unassigned —</SelectItem>
                    {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name} ({u.role.replace(/_/g, " ")})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Location (optional)</Label>
                <LocationPicker
                  value={draft.latitude != null && draft.longitude != null ? { latitude: draft.latitude, longitude: draft.longitude } : null}
                  onChange={(loc) => setDraft({ ...draft, latitude: loc?.latitude ?? null, longitude: loc?.longitude ?? null })}
                  fallbackCenter={(() => {
                    const o = outlets.find((x) => x.id === draft.outletId);
                    return o ? { latitude: o.latitude, longitude: o.longitude } : null;
                  })()}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDraft(null)} disabled={saving}>Cancel</Button>
                <Button type="submit" disabled={saving}>{saving ? "Saving…" : draft.id ? "Save changes" : "Add lead"}</Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </main>
  );
}
