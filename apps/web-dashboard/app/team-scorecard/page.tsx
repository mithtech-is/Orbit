"use client";

import type { JSX } from "react";

import { useEffect, useState } from "react";
import { apiClient, safeFetch } from "../api-service";
import type { RepActivityRow, UserSummary } from "@orbit/api-client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function formatCurrency(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

function completionRate(row: RepActivityRow): number {
  if (row.visitsTotal === 0) return 0;
  return Math.round((row.visitsCompleted / row.visitsTotal) * 100);
}

export default function TeamScorecardPage(): JSX.Element {
  const [rows, setRows] = useState<RepActivityRow[]>([]);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [currency, setCurrency] = useState("INR");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const [activity, userList, settings] = await Promise.all([
        safeFetch(() => apiClient.listRepActivity(), null),
        safeFetch(() => apiClient.listUsers(), null),
        safeFetch(() => apiClient.getOrganisationSettings(), null)
      ]);
      if (activity) setRows(activity.items);
      else setError("Couldn't load team activity.");
      if (userList) setUsers(userList.items);
      if (settings) setCurrency(settings.currency);
      setLoading(false);
    })();
  }, []);

  const userName = (id: string) => users.find((u) => u.id === id)?.name ?? id;
  const userRole = (id: string) => users.find((u) => u.id === id)?.role.replace(/_/g, " ") ?? "";

  function rateVariant(rate: number): "success" | "default" | "destructive" {
    if (rate >= 80) return "success";
    if (rate >= 50) return "default";
    return "destructive";
  }

  return (
    <main className="shell font-sans">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Team scorecard</h1>
          <p className="mt-1 text-sm text-muted-foreground">Per-rep activity totals across the visible window.</p>
        </div>
        <Badge variant="secondary" className="shrink-0">{loading ? "Loading…" : `${rows.length} reps`}</Badge>
      </div>

      {error ? (
        <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
      ) : null}

      {loading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <h3 className="text-base font-semibold text-foreground">No activity yet</h3>
            <p className="text-sm text-muted-foreground">Cards appear here once reps start logging visits.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...rows].sort((a, b) => b.visitsCompleted - a.visitsCompleted).map((row) => {
            const rate = completionRate(row);
            return (
              <Card key={row.repUserId}>
                <CardContent className="p-4">
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-foreground">{userName(row.repUserId)}</div>
                      <div className="text-xs capitalize text-muted-foreground">{userRole(row.repUserId)}</div>
                    </div>
                    <Badge variant={rateVariant(rate)}>{rate}% complete</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Visits</div>
                      <div className="text-xl font-semibold tabular-nums text-foreground">
                        {row.visitsCompleted}<span className="text-sm text-muted-foreground"> / {row.visitsTotal}</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Orders</div>
                      <div className="text-xl font-semibold tabular-nums text-foreground">{row.ordersTotal}</div>
                    </div>
                    <div>
                      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Order value</div>
                      <div className="text-sm font-semibold tabular-nums text-foreground">{formatCurrency(row.orderTotalCents, currency)}</div>
                    </div>
                    <div>
                      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Geofence flags</div>
                      <div className={"text-sm font-semibold tabular-nums " + (row.geofenceExceptions > 0 ? "text-destructive" : "text-foreground")}>
                        {row.geofenceExceptions}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </main>
  );
}
