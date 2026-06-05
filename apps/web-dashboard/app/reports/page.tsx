"use client";

import type { JSX } from "react";

import { useEffect, useState } from "react";
import { apiClient, safeFetch } from "../api-service";
import type { ReportSummary, RepActivityRow, UserSummary } from "@orbit/api-client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function formatCurrency(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

export default function ReportsPage(): JSX.Element {
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [reps, setReps] = useState<RepActivityRow[]>([]);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [currency, setCurrency] = useState("INR");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const [s, r, settings, u] = await Promise.all([
        safeFetch(() => apiClient.getReportSummary(), null),
        safeFetch(() => apiClient.listRepActivity(), null),
        safeFetch(() => apiClient.getOrganisationSettings(), null),
        safeFetch(() => apiClient.listUsers(), null)
      ]);
      if (s) setSummary(s);
      if (r) setReps(r.items);
      if (settings) setCurrency(settings.currency);
      if (u) setUsers(u.items);
      if (!s && !r) setError("We couldn't load reports right now. Please try again.");
      setLoading(false);
    })();
  }, []);

  const repName = (id: string): string => users.find((u) => u.id === id)?.name ?? id;

  const metrics: Array<{ label: string; value: string | number }> = [
    { label: "Outlets", value: summary?.outletCount ?? "—" },
    { label: "Open leads", value: summary?.leadCount ?? "—" },
    { label: "Visits logged", value: summary?.visitCount ?? "—" },
    { label: "Routes planned", value: summary?.routePlanCount ?? "—" },
    { label: "Orders", value: summary?.orderCount ?? "—" },
    { label: "Active sessions", value: summary?.activeSessionCount ?? "—" },
    { label: "Order revenue", value: summary ? formatCurrency(summary.totalOrderCents, currency) : "—" }
  ];

  return (
    <main className="shell font-sans">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Reports</h1>
          <p className="mt-1 text-sm text-muted-foreground">Operational metrics and per-representative activity.</p>
        </div>
        <Badge variant={loading ? "secondary" : "success"} className="shrink-0">{loading ? "Loading…" : "Live"}</Badge>
      </div>

      {error ? (
        <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
      ) : null}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {metrics.map((m) => (
          <Card key={m.label}>
            <CardContent className="p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{m.label}</div>
              <div className="mt-1.5 text-2xl font-semibold tabular-nums text-foreground">{m.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <h2 className="mb-3 text-base font-semibold text-foreground">Per-representative activity</h2>
      {loading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>
      ) : reps.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <h3 className="text-base font-semibold text-foreground">No representative activity yet</h3>
            <p className="text-sm text-muted-foreground">Activity appears here once reps complete visits and orders.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Representative</TableHead>
                <TableHead>Visits</TableHead>
                <TableHead>Completed</TableHead>
                <TableHead>Geofence exceptions</TableHead>
                <TableHead>Orders</TableHead>
                <TableHead>Order revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reps.map((r) => (
                <TableRow key={r.repUserId}>
                  <TableCell className="font-medium text-foreground">{repName(r.repUserId)}</TableCell>
                  <TableCell className="tabular-nums">{r.visitsTotal}</TableCell>
                  <TableCell className="tabular-nums">{r.visitsCompleted}</TableCell>
                  <TableCell>{r.geofenceExceptions > 0 ? <Badge variant="warning">{r.geofenceExceptions}</Badge> : <span className="tabular-nums text-muted-foreground">{r.geofenceExceptions}</span>}</TableCell>
                  <TableCell className="tabular-nums">{r.ordersTotal}</TableCell>
                  <TableCell className="tabular-nums font-medium">{formatCurrency(r.orderTotalCents, currency)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </main>
  );
}
