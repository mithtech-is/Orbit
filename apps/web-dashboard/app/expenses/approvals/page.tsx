"use client";

import type { JSX } from "react";

import { Fragment, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Check, X, AlertTriangle } from "lucide-react";
import { apiClient, safeFetch } from "../../api-service";
import type { FieldExpenseSummary } from "@orbit/api-client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function rupees(cents: number, currency = "INR"): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

function statusVariant(s: string): "success" | "warning" | "destructive" | "secondary" {
  if (s === "approved") return "success";
  if (s === "pending") return "warning";
  if (s === "rejected") return "destructive";
  return "secondary";
}

function rateSourceLabel(source: unknown): string {
  if (source === "rep_override") return "rep override";
  if (source === "vehicle_type") return "vehicle type";
  if (source === "org_default") return "org default";
  return "—";
}

interface RepGroup {
  repUserId: string;
  repName: string;
  items: FieldExpenseSummary[];
  pendingCount: number;
  totalPendingCents: number;
  totalDeviationKm: number;
}

export default function FuelApprovalsPage(): JSX.Element {
  const [items, setItems] = useState<FieldExpenseSummary[]>([]);
  const [currency, setCurrency] = useState("INR");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [expandedRep, setExpandedRep] = useState<string | null>(null);
  const [expandedExpense, setExpandedExpense] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [list, settings] = await Promise.all([
      safeFetch(() => apiClient.listFieldExpenses(filter === "all" ? undefined : { status: filter }), null),
      safeFetch(() => apiClient.getOrganisationSettings(), null)
    ]);
    if (list) { setItems(list.items); setError(null); }
    else setError("Couldn't load expenses.");
    if (settings) setCurrency(settings.currency || "INR");
    setLoading(false);
  }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [filter]);

  const groups: RepGroup[] = useMemo(() => {
    const byRep = new Map<string, FieldExpenseSummary[]>();
    for (const it of items) {
      const arr = byRep.get(it.repUserId);
      if (arr) arr.push(it); else byRep.set(it.repUserId, [it]);
    }
    const out: RepGroup[] = [];
    for (const [repUserId, list] of byRep) {
      const repName = list[0]?.repName ?? repUserId;
      const pending = list.filter((i) => i.status === "pending");
      out.push({
        repUserId,
        repName,
        items: list,
        pendingCount: pending.length,
        totalPendingCents: pending.reduce((a, b) => a + b.amountCents, 0),
        totalDeviationKm: Math.round(list.reduce((a, b) => a + b.deviationKm, 0) * 100) / 100
      });
    }
    out.sort((a, b) => b.pendingCount - a.pendingCount || a.repName.localeCompare(b.repName));
    return out;
  }, [items]);

  async function approve(id: string) {
    setBusyId(id); setError(null); setMessage(null);
    try {
      await apiClient.approveFieldExpense(id);
      setMessage("Approved.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't approve.");
    } finally {
      setBusyId(null);
    }
  }
  async function reject(id: string) {
    const reason = window.prompt("Reason for rejection (will be shown to the rep):");
    if (!reason || reason.trim().length < 5) {
      setError("Rejection reason must be at least 5 characters.");
      return;
    }
    setBusyId(id); setError(null); setMessage(null);
    try {
      await apiClient.rejectFieldExpense(id, reason.trim());
      setMessage("Rejected.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't reject.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="shell font-sans">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Fuel approvals</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Daily auto-computed fuel expenses, grouped by rep. Tap a rep to view their
            day, then expand a row to see the planned vs actual breakdown.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(["pending", "approved", "rejected", "all"] as const).map((f) => (
            <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
              {f[0].toUpperCase() + f.slice(1)}
            </Button>
          ))}
        </div>
      </div>

      {error ? <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div> : null}
      {message ? <div className="mb-4 rounded-md border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">{message}</div> : null}

      {loading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>
      ) : groups.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <h3 className="text-base font-semibold text-foreground">Nothing to show</h3>
            <p className="text-sm text-muted-foreground">No expenses match the current filter.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map((g) => {
            const open = expandedRep === g.repUserId;
            return (
              <Card key={g.repUserId} className="overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpandedRep(open ? null : g.repUserId)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
                  aria-expanded={open}
                >
                  {open ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                  <span className="font-semibold text-foreground">{g.repName}</span>
                  <span className="flex-1" />
                  {g.pendingCount > 0 ? <Badge variant="warning">{g.pendingCount} pending</Badge> : null}
                  {g.totalDeviationKm > 0 ? <Badge variant="warning"><AlertTriangle className="mr-1 h-3 w-3" />{g.totalDeviationKm.toFixed(2)} km off-plan</Badge> : null}
                  <Badge variant="secondary">{rupees(g.totalPendingCents, currency)} pending</Badge>
                </button>

                {open ? (
                  <div className="border-t border-border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Actual km</TableHead>
                          <TableHead>Planned km</TableHead>
                          <TableHead>Deviation</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Details</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {g.items.map((e) => (
                          <Fragment key={e.id}>
                            <TableRow className={e.overLimit ? "bg-warning/5" : undefined}>
                              <TableCell className="font-mono text-xs">{e.expenseDate}</TableCell>
                              <TableCell className="tabular-nums">{e.actualDistanceKm.toFixed(2)}</TableCell>
                              <TableCell className="tabular-nums">{e.plannedDistanceKm.toFixed(2)}</TableCell>
                              <TableCell className="tabular-nums">
                                {e.deviationKm > 0 ? (
                                  <span className="font-medium text-warning">+{e.deviationKm.toFixed(2)} km</span>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              <TableCell className="tabular-nums font-medium">{rupees(e.amountCents, currency)}</TableCell>
                              <TableCell>
                                <Badge variant={statusVariant(e.status)}>{e.status}</Badge>
                              </TableCell>
                              <TableCell>
                                <Button size="sm" variant="ghost" onClick={() => setExpandedExpense(expandedExpense === e.id ? null : e.id)}>
                                  {expandedExpense === e.id ? "Hide" : "View"}
                                </Button>
                              </TableCell>
                            </TableRow>
                            {expandedExpense === e.id ? (
                              <TableRow>
                                <TableCell colSpan={7} className="bg-muted/40">
                                  <div className="grid gap-4 py-3 md:grid-cols-2">
                                    {/* Breakdown — the "expense inside the expense" the product spec asked for. */}
                                    <div>
                                      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Breakdown</div>
                                      <table className="w-full text-sm">
                                        <tbody>
                                          <tr>
                                            <td className="py-1 text-muted-foreground">Planned trip</td>
                                            <td className="py-1 text-right tabular-nums">{e.plannedDistanceKm.toFixed(2)} km</td>
                                            <td className="py-1 text-right tabular-nums">{rupees(Math.round(e.plannedDistanceKm * e.ratePerKmCents), currency)}</td>
                                          </tr>
                                          <tr>
                                            <td className="py-1 text-muted-foreground">Deviation (off-plan)</td>
                                            <td className="py-1 text-right tabular-nums">{e.deviationKm.toFixed(2)} km</td>
                                            <td className="py-1 text-right tabular-nums font-medium text-warning">{rupees(e.deviationAmountCents, currency)}</td>
                                          </tr>
                                          <tr className="border-t">
                                            <td className="py-1 font-medium">Total (actual × rate)</td>
                                            <td className="py-1 text-right tabular-nums font-medium">{e.actualDistanceKm.toFixed(2)} km</td>
                                            <td className="py-1 text-right tabular-nums font-medium">{rupees(e.amountCents, currency)}</td>
                                          </tr>
                                        </tbody>
                                      </table>
                                      <div className="mt-2 text-xs text-muted-foreground">
                                        Rate {rupees(e.ratePerKmCents, currency)} / km · source: {rateSourceLabel((e.metadata as { rateSource?: unknown }).rateSource)}
                                        {(e.metadata as { vehicleTypeName?: string }).vehicleTypeName
                                          ? ` · vehicle ${(e.metadata as { vehicleTypeName?: string }).vehicleTypeName}` : ""}
                                      </div>
                                    </div>
                                    <div>
                                      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rep's reason</div>
                                      <div className="rounded-md border border-border bg-background px-3 py-2 text-sm">
                                        {e.reason
                                          ? <span>{e.reason}</span>
                                          : <span className="text-muted-foreground">No reason given.</span>}
                                      </div>
                                      {e.status === "rejected" && e.rejectionReason ? (
                                        <div className="mt-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                                          <strong>Rejection reason:</strong> {e.rejectionReason}
                                        </div>
                                      ) : null}
                                      {e.status === "pending" ? (
                                        <div className="mt-3 flex gap-2">
                                          <Button size="sm" disabled={busyId === e.id} onClick={() => void approve(e.id)}>
                                            <Check className="mr-1 h-4 w-4" /> Approve
                                          </Button>
                                          <Button size="sm" variant="outline" disabled={busyId === e.id} onClick={() => void reject(e.id)}>
                                            <X className="mr-1 h-4 w-4" /> Reject
                                          </Button>
                                        </div>
                                      ) : null}
                                    </div>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ) : null}
                          </Fragment>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </main>
  );
}
