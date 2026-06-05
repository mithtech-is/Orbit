"use client";

import type { JSX } from "react";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search, Download, ArrowRight } from "lucide-react";
import { apiClient, safeFetch } from "../api-service";
import { exportTextFile, toCsv } from "../desktop-bridge";
import type { FieldOrderSummary, OutletSummary } from "@orbit/api-client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * Customers page — first page migrated to shadcn/ui. The data logic (outlets +
 * field-orders aggregated client-side) is unchanged; only the presentation now
 * uses shadcn components (Card, Input, Select, Button, Table, Badge) styled in
 * the app's existing colours via the `--sc-*` token theme.
 */

function formatCurrency(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

type Status = "new" | "active" | "at_risk" | "dormant";

interface CustomerRow extends OutletSummary {
  orderCount: number;
  revenueCents: number;
  lastOrderAt: string | null;
  status: Status;
}

const STATUS_LABEL: Record<Status, string> = { new: "New", active: "Active", at_risk: "At risk", dormant: "Dormant" };
const STATUS_VARIANT: Record<Status, "success" | "warning" | "destructive" | "secondary"> = {
  active: "success",
  at_risk: "warning",
  dormant: "destructive",
  new: "secondary"
};

function deriveStatus(lastVisitedAt: string | null | undefined): Status {
  if (!lastVisitedAt) return "new";
  const days = (Date.now() - new Date(lastVisitedAt).getTime()) / 86_400_000;
  if (days <= 14) return "active";
  if (days <= 30) return "at_risk";
  return "dormant";
}

function buildRows(outlets: OutletSummary[], orders: FieldOrderSummary[]): CustomerRow[] {
  const byOutlet = new Map<string, { count: number; revenue: number; lastAt: string | null }>();
  for (const order of orders) {
    const entry = byOutlet.get(order.outletId) ?? { count: 0, revenue: 0, lastAt: null };
    entry.count += 1;
    entry.revenue += order.totalCents;
    if (!entry.lastAt || new Date(order.createdAt) > new Date(entry.lastAt)) entry.lastAt = order.createdAt;
    byOutlet.set(order.outletId, entry);
  }
  return outlets.map((outlet) => {
    const rollup = byOutlet.get(outlet.id);
    return {
      ...outlet,
      orderCount: rollup?.count ?? 0,
      revenueCents: rollup?.revenue ?? 0,
      lastOrderAt: rollup?.lastAt ?? null,
      status: deriveStatus(outlet.lastVisitedAt)
    };
  });
}

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function relativeLabel(iso: string | null | undefined): string {
  const days = daysSince(iso);
  if (days === null) return "—";
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}

export default function CustomersPage(): JSX.Element {
  const [outlets, setOutlets] = useState<OutletSummary[]>([]);
  const [orders, setOrders] = useState<FieldOrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [sortBy, setSortBy] = useState<"name" | "revenue" | "lastVisited" | "orders">("revenue");
  const [currency, setCurrency] = useState("INR");

  async function load() {
    setLoading(true);
    setError(null);
    const [outletResult, orderResult, settings] = await Promise.all([
      safeFetch(() => apiClient.listOutlets(), null),
      safeFetch(() => apiClient.listFieldOrders(), null),
      safeFetch(() => apiClient.getOrganisationSettings(), null)
    ]);
    if (outletResult) setOutlets(outletResult.items);
    else setError("We couldn't load customers. Please try again.");
    if (orderResult) setOrders(orderResult.items);
    if (settings?.currency) setCurrency(settings.currency);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  const rows = useMemo(() => buildRows(outlets, orders), [outlets, orders]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (!q) return true;
      return row.name.toLowerCase().includes(q);
    });
  }, [rows, search, statusFilter]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "revenue") return b.revenueCents - a.revenueCents;
      if (sortBy === "orders") return b.orderCount - a.orderCount;
      const at = a.lastVisitedAt ? new Date(a.lastVisitedAt).getTime() : -1;
      const bt = b.lastVisitedAt ? new Date(b.lastVisitedAt).getTime() : -1;
      if (at === -1 && bt === -1) return a.name.localeCompare(b.name);
      if (at === -1) return 1;
      if (bt === -1) return -1;
      return bt - at;
    });
    return list;
  }, [filtered, sortBy]);

  const summary = useMemo(() => {
    const totalRevenue = sorted.reduce((sum, row) => sum + row.revenueCents, 0);
    const totalOrders = sorted.reduce((sum, row) => sum + row.orderCount, 0);
    const dormant = sorted.filter((row) => row.status === "dormant").length;
    const atRisk = sorted.filter((row) => row.status === "at_risk").length;
    return { totalRevenue, totalOrders, dormant, atRisk };
  }, [sorted]);

  async function handleExport() {
    if (sorted.length === 0) return;
    const csv = toCsv(
      sorted.map((row) => ({
        id: row.id,
        name: row.name,
        status: STATUS_LABEL[row.status],
        latitude: row.latitude,
        longitude: row.longitude,
        visitCount: row.visitCount ?? 0,
        lastVisitedAt: row.lastVisitedAt ?? "",
        orderCount: row.orderCount,
        revenueCents: row.revenueCents,
        lastOrderAt: row.lastOrderAt ?? ""
      })),
      ["id", "name", "status", "latitude", "longitude", "visitCount", "lastVisitedAt", "orderCount", "revenueCents", "lastOrderAt"]
    );
    await exportTextFile({
      suggestedName: `customers-${new Date().toISOString().slice(0, 10)}.csv`,
      mimeType: "text/csv",
      contents: csv
    });
  }

  const metrics: Array<{ label: string; value: string; tone?: "warning" | "danger" }> = [
    { label: "Total revenue", value: formatCurrency(summary.totalRevenue, currency) },
    { label: "Orders placed", value: String(summary.totalOrders) },
    { label: "At risk (15–30d)", value: String(summary.atRisk), tone: summary.atRisk > 0 ? "warning" : undefined },
    { label: "Dormant (30d+)", value: String(summary.dormant), tone: summary.dormant > 0 ? "danger" : undefined }
  ];

  return (
    <main className="shell font-sans">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Customers</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Outlets your team sells to, ranked by sales activity. Status reflects how recently a rep visited.
          </p>
        </div>
        <Badge variant="secondary" className="shrink-0">
          {loading ? "Loading…" : `${sorted.length} of ${rows.length} customers`}
        </Badge>
      </div>

      {error ? (
        <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
      ) : null}

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((m) => (
          <Card key={m.label}>
            <CardContent className="p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{m.label}</div>
              <div
                className={
                  "mt-1.5 text-2xl font-semibold tabular-nums " +
                  (m.tone === "warning" ? "text-warning" : m.tone === "danger" ? "text-destructive" : "text-foreground")
                }
              >
                {m.value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3 shadow-sm">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search customers by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-full pl-9"
            aria-label="Search customers by name"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as Status | "all")}>
          <SelectTrigger className="w-[170px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active (≤14d)</SelectItem>
            <SelectItem value="at_risk">At risk (15–30d)</SelectItem>
            <SelectItem value="dormant">Dormant (30d+)</SelectItem>
            <SelectItem value="new">Never visited</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Sort" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="revenue">Sort: Revenue ↓</SelectItem>
            <SelectItem value="orders">Sort: Orders ↓</SelectItem>
            <SelectItem value="lastVisited">Sort: Last visited ↓</SelectItem>
            <SelectItem value="name">Sort: Name A–Z</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={handleExport} disabled={sorted.length === 0}>
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </div>

      {loading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Loading customers…</p>
      ) : sorted.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <h3 className="text-base font-semibold text-foreground">
              {rows.length === 0 ? "No customers yet" : "No customers match these filters"}
            </h3>
            <p className="text-sm text-muted-foreground">
              {rows.length === 0
                ? "Add an outlet to start tracking customer activity."
                : "Adjust the search or status filter to see other customers."}
            </p>
            {rows.length === 0 ? (
              <Button asChild variant="outline" className="mt-2">
                <Link href="/outlets">Go to Outlets <ArrowRight className="h-4 w-4" /></Link>
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Visits</TableHead>
                <TableHead>Last visit</TableHead>
                <TableHead>Orders</TableHead>
                <TableHead>Revenue</TableHead>
                <TableHead>Last order</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((row) => {
                const days = daysSince(row.lastVisitedAt);
                const stale = days !== null && days > 30;
                return (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="font-medium text-foreground">{row.name}</div>
                      <div className="font-mono text-[11px] text-muted-foreground">
                        {row.latitude.toFixed(4)}, {row.longitude.toFixed(4)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[row.status]}>{STATUS_LABEL[row.status]}</Badge>
                    </TableCell>
                    <TableCell className="tabular-nums">{row.visitCount ?? 0}</TableCell>
                    <TableCell className={stale ? "text-destructive" : "text-muted-foreground"}>
                      {relativeLabel(row.lastVisitedAt)}
                    </TableCell>
                    <TableCell className="tabular-nums">{row.orderCount}</TableCell>
                    <TableCell className="tabular-nums font-medium">
                      {row.revenueCents > 0 ? formatCurrency(row.revenueCents, currency) : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{relativeLabel(row.lastOrderAt)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </main>
  );
}
