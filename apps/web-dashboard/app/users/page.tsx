"use client";

import type { JSX } from "react";
import { EmptyState } from "../components/empty-state";

import { useEffect, useState } from "react";
import { apiClient, safeFetch, startImpersonation, loadSession } from "../api-service";
import type { UserSummary, InviteUserResponse, VehicleTypeSummary } from "@orbit/api-client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const ROLES: Array<{ value: string; label: string }> = [
  { value: "organisation_admin", label: "Organisation admin" },
  { value: "sales_manager", label: "Sales manager" },
  { value: "operations_user", label: "Operations" },
  { value: "field_sales_representative", label: "Field sales representative" },
  { value: "readonly_analyst", label: "Read-only analyst" }
];

function roleLabel(value: string): string {
  return ROLES.find((r) => r.value === value)?.label ?? value;
}

interface ConsentStatus {
  sharing: boolean;
  revokeReason: string | null;
  revokedAt: string | null;
}

export default function UsersPage(): JSX.Element {
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [consent, setConsent] = useState<Record<string, ConsentStatus>>({});
  const [vehicleTypes, setVehicleTypes] = useState<VehicleTypeSummary[]>([]);
  const [vehicleEditingId, setVehicleEditingId] = useState<string | null>(null);
  const [vehicleDraftId, setVehicleDraftId] = useState<string>("");
  const [vehicleDraftRate, setVehicleDraftRate] = useState<string>("");
  const [vehicleSaving, setVehicleSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState("field_sales_representative");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [lastInvite, setLastInvite] = useState<InviteUserResponse | null>(null);

  async function load() {
    setLoading(true);
    const [result, consentRes, vehicleRes] = await Promise.all([
      safeFetch(() => apiClient.listUsers(), null),
      safeFetch(() => apiClient.listConsentStatus(), null),
      safeFetch(() => apiClient.listVehicleTypes(), null)
    ]);
    if (result) {
      setUsers(result.items);
      setError(null);
    } else {
      setError("We couldn't load users. Please try again.");
    }
    if (consentRes) {
      const map: Record<string, ConsentStatus> = {};
      for (const c of consentRes.items) {
        map[c.userId] = { sharing: c.sharing, revokeReason: c.revokeReason, revokedAt: c.revokedAt };
      }
      setConsent(map);
    }
    if (vehicleRes) setVehicleTypes(vehicleRes.items);
    setLoading(false);
  }

  function startVehicleEdit(user: UserSummary) {
    setVehicleEditingId(user.id);
    setVehicleDraftId(user.vehicleTypeId ?? "");
    setVehicleDraftRate(user.fuelRatePerKmCents != null ? (user.fuelRatePerKmCents / 100).toFixed(2) : "");
  }
  async function saveVehicleEdit(user: UserSummary) {
    setVehicleSaving(true);
    try {
      const rateNum = vehicleDraftRate.trim() === "" ? null : Math.round(Number(vehicleDraftRate) * 100);
      await apiClient.updateUserVehicle(user.id, {
        vehicleTypeId: vehicleDraftId === "" ? null : vehicleDraftId,
        fuelRatePerKmCents: rateNum
      });
      setVehicleEditingId(null);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Couldn't save vehicle.");
    } finally {
      setVehicleSaving(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteError(null);
    setInviting(true);
    try {
      const response = await apiClient.inviteUser({
        email: inviteEmail.trim(),
        name: inviteName.trim(),
        role: inviteRole
      });
      setLastInvite(response);
      setInviteEmail("");
      setInviteName("");
      setInviteRole("field_sales_representative");
      setShowInvite(false);
      await load();
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Unable to invite user.");
    } finally {
      setInviting(false);
    }
  }

  async function handleDeactivate(user: UserSummary) {
    if (!confirm(`Deactivate ${user.name}? They will no longer be able to sign in.`)) return;
    try {
      await apiClient.deactivateUser(user.id);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Unable to deactivate user.");
    }
  }

  async function handleImpersonate(user: UserSummary) {
    const me = loadSession();
    if (me?.userId === user.id) {
      alert("You can't sign in as yourself.");
      return;
    }
    const ok = confirm(
      `Sign in as ${user.name}?\n\n` +
      `Every action you take while signed in will be recorded as ${user.name} in the audit log. ` +
      `A banner will remind you, and you can switch back at any time.`
    );
    if (!ok) return;
    try {
      const response = await apiClient.impersonateUser(user.id);
      startImpersonation({
        token: response.token,
        userId: response.userId,
        organisationId: response.organisationId,
        name: response.name,
        email: response.email,
        role: response.role,
        permissions: response.permissions
      });
      window.location.href = "/";
    } catch (err) {
      alert(err instanceof Error ? err.message : "Unable to impersonate user.");
    }
  }

  async function handleResetPassword(user: UserSummary) {
    if (!confirm(`Issue a new temporary password for ${user.name}? Their current password will no longer work.`)) return;
    try {
      const response = await apiClient.resetUserPassword(user.id);
      setLastInvite(response);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Unable to reset password.");
    }
  }

  async function handleExportData(user: UserSummary) {
    try {
      const bundle = await apiClient.exportUserData(user.id);
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `data-export-${user.id}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Unable to export data.");
    }
  }

  async function handleErase(user: UserSummary) {
    if (!confirm(
      `Erase ${user.name}'s personal data (GDPR right to erasure)?\n\n` +
      `This anonymises the account and permanently deletes their raw location history. ` +
      `Orders and visits are kept but anonymised. This cannot be undone.`
    )) return;
    try {
      const summary = await apiClient.eraseUserData(user.id);
      alert(`Erased. Removed ${summary.locationPingsDeleted} location pings and ${summary.devicesDeleted} device(s).`);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Unable to erase data.");
    }
  }

  return (
    <main className="shell font-sans">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Users</h1>
          <p className="mt-1 text-sm text-muted-foreground">Invite teammates and field representatives to your workspace.</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="shrink-0">{loading ? "Loading…" : `${users.filter((u) => u.active).length} active`}</Badge>
          <Button onClick={() => setShowInvite(true)}>+ Invite user</Button>
        </div>
      </div>

      {lastInvite ? (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-success/30 bg-success/10 px-4 py-3 text-sm text-foreground">
          <span><strong>{lastInvite.name}</strong> — {lastInvite.message}</span>
          <code className="rounded bg-muted px-2 py-0.5 font-mono text-sm">{lastInvite.temporaryPassword}</code>
          <Button variant="outline" size="sm" onClick={() => void navigator.clipboard.writeText(lastInvite.temporaryPassword)}>Copy</Button>
          <Button variant="ghost" size="sm" onClick={() => setLastInvite(null)}>Dismiss</Button>
        </div>
      ) : null}

      {error ? <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div> : null}

      {loading ? null : users.length === 0 ? (
        <EmptyState kind="users" title="No users yet" message="Invite your first teammate to get started." />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead>
                <TableHead>Status</TableHead><TableHead>Location sharing</TableHead>
                <TableHead>Vehicle / rate</TableHead><TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id} className={user.active ? undefined : "opacity-50"}>
                  <TableCell className="font-medium text-foreground">{user.name}</TableCell>
                  <TableCell className="text-muted-foreground">{user.email}</TableCell>
                  <TableCell className="text-muted-foreground">{roleLabel(user.role)}</TableCell>
                  <TableCell>
                    {!user.active ? <Badge variant="secondary">Deactivated</Badge>
                      : user.passwordChangeRequired ? <Badge variant="warning">Password change pending</Badge>
                      : <Badge variant="success">Active</Badge>}
                  </TableCell>
                  <TableCell>
                    {user.role !== "field_sales_representative" ? (
                      <span className="text-muted-foreground">—</span>
                    ) : consent[user.id] === undefined ? (
                      <span className="text-muted-foreground">No record</span>
                    ) : consent[user.id].sharing ? (
                      <Badge variant="success">On</Badge>
                    ) : (
                      <div className="flex flex-col items-start gap-1">
                        <Badge variant="destructive">Off</Badge>
                        {consent[user.id].revokeReason ? (
                          <span className="text-xs text-muted-foreground" title={consent[user.id].revokeReason ?? ""}>“{consent[user.id].revokeReason}”</span>
                        ) : null}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {user.role !== "field_sales_representative" && user.role !== "sales_manager" ? (
                      <span className="text-muted-foreground">—</span>
                    ) : vehicleEditingId === user.id ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          className="h-8 rounded-md border border-border bg-background px-2 text-xs"
                          value={vehicleDraftId}
                          onChange={(e) => setVehicleDraftId(e.target.value)}
                        >
                          <option value="">— inherit org default —</option>
                          {vehicleTypes.filter((v) => v.active || v.id === vehicleDraftId).map((v) => (
                            <option key={v.id} value={v.id}>{v.name} (₹{(v.fuelRatePerKmCents / 100).toFixed(2)}/km)</option>
                          ))}
                        </select>
                        <Input
                          type="number"
                          step="0.01"
                          min={0}
                          placeholder="override ₹/km"
                          value={vehicleDraftRate}
                          onChange={(e) => setVehicleDraftRate(e.target.value)}
                          className="h-8 w-28"
                        />
                        <Button size="sm" onClick={() => void saveVehicleEdit(user)} disabled={vehicleSaving}>Save</Button>
                        <Button size="sm" variant="ghost" onClick={() => setVehicleEditingId(null)}>Cancel</Button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span>
                          {user.vehicleTypeId
                            ? (vehicleTypes.find((v) => v.id === user.vehicleTypeId)?.name ?? "Unknown")
                            : <span className="text-muted-foreground">No vehicle</span>}
                          {user.fuelRatePerKmCents != null
                            ? <span className="ml-1 text-muted-foreground">· override ₹{(user.fuelRatePerKmCents / 100).toFixed(2)}/km</span>
                            : null}
                        </span>
                        {user.active ? (
                          <Button size="sm" variant="ghost" onClick={() => startVehicleEdit(user)}>Edit</Button>
                        ) : null}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {user.active ? (
                        <>
                          <Button variant="outline" size="sm" onClick={() => void handleImpersonate(user)}>Sign in as</Button>
                          <Button variant="outline" size="sm" onClick={() => void handleResetPassword(user)}>Reset password</Button>
                          <Button variant="outline" size="sm" onClick={() => void handleExportData(user)} title="Download a GDPR data-subject export">Export data</Button>
                          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => void handleDeactivate(user)}>Deactivate</Button>
                          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => void handleErase(user)} title="GDPR right to erasure — anonymise and purge location data">Erase</Button>
                        </>
                      ) : (
                        <Button variant="outline" size="sm" onClick={() => void handleExportData(user)}>Export data</Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog open={showInvite} onOpenChange={setShowInvite}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite a user</DialogTitle>
            <DialogDescription>They&apos;ll get a one-time password to share and must change it on first sign-in.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleInvite} className="grid gap-4">
            {inviteError ? <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{inviteError}</div> : null}
            <div className="grid gap-1.5">
              <Label htmlFor="inv-name">Full name</Label>
              <Input id="inv-name" type="text" value={inviteName} onChange={(e) => setInviteName(e.target.value)} required autoFocus />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="inv-email">Work email</Label>
              <Input id="inv-email" type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} required />
            </div>
            <div className="grid gap-1.5">
              <Label>Role</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowInvite(false)} disabled={inviting}>Cancel</Button>
              <Button type="submit" disabled={inviting}>{inviting ? "Inviting…" : "Invite user"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}
