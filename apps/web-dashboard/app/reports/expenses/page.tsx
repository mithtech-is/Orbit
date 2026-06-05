"use client";

import type { JSX } from "react";

import { useEffect, useMemo, useState } from "react";
import { apiClient, safeFetch } from "../../api-service";
import type { ExpenseReport } from "@orbit/api-client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function formatCurrency(cents: number, currency = "INR"): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export default function ExpenseReportsPage(): JSX.Element {
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(today());
  const [currency, setCurrency] = useState("INR");
  const [report, setReport] = useState<ExpenseReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load(nextFrom = from, nextTo = to) {
    setLoading(true);
    const [expenseReport, settings] = await Promise.all([
      safeFetch(() => apiClient.getExpenseReport({ from: nextFrom, to: nextTo }), null),
      safeFetch(() => apiClient.getOrganisationSettings(), null)
    ]);
    if (settings) setCurrency(settings.currency);
    if (expenseReport) {
      setReport(expenseReport);
      setError(null);
    } else {
      setError("We couldn't load expense reports right now. Please try again.");
    }
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  const syncedCount = useMemo(() => report?.items.filter((item) => item.erpSyncStatus === "synced").length ?? 0, [report]);

  return (
    <main className="shell font-sans">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Expense reports</h1>
          <p className="mt-1 text-sm text-muted-foreground">Per-representative expenses with ERPNext sync status.</p>
        </div>
        <Badge variant={loading ? "secondary" : "success"} className="shrink-0">{loading ? "Loading…" : `${report?.expenseCount ?? 0} expenses`}</Badge>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="expense-from">From</Label>
          <Input id="expense-from" type="date" className="h-9 w-40" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="expense-to">To</Label>
          <Input id="expense-to" type="date" className="h-9 w-40" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <Button onClick={() => void load(from, to)} disabled={loading}>Apply</Button>
      </div>

      {error ? (
        <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
      ) : null}

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4"><div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total expenses</div><div className="mt-1.5 text-2xl font-semibold tabular-nums text-foreground">{report ? formatCurrency(report.totalExpenseCents, currency) : "—"}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Expense rows</div><div className="mt-1.5 text-2xl font-semibold tabular-nums text-foreground">{report?.expenseCount ?? "—"}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Synced to ERPNext</div><div className="mt-1.5 text-2xl font-semibold tabular-nums text-foreground">{report ? `${syncedCount}/${report.expenseCount}` : "—"}</div></CardContent></Card>
      </div>

      {report && report.repTotals.length > 0 ? (
        <Card className="mb-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Representative</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Rows</TableHead>
                <TableHead>ERPNext synced</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.repTotals.map((rep) => (
                <TableRow key={rep.repUserId}>
                  <TableCell className="font-medium text-foreground">{rep.repName}</TableCell>
                  <TableCell className="tabular-nums font-medium">{formatCurrency(rep.totalExpenseCents, currency)}</TableCell>
                  <TableCell className="tabular-nums">{rep.expenseCount}</TableCell>
                  <TableCell className="tabular-nums">{rep.erpSyncedCount}/{rep.expenseCount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : null}

      {loading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Loading expenses…</p>
      ) : !report || report.items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <h3 className="text-base font-semibold text-foreground">No expenses in this range</h3>
            <p className="text-sm text-muted-foreground">Expenses appear after reps complete visits with expense rows.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Representative</TableHead>
                <TableHead>Outlet</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>KM</TableHead>
                <TableHead>Note</TableHead>
                <TableHead>ERPNext</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.items.map((item) => (
                <TableRow key={item.expenseId}>
                  <TableCell className="text-muted-foreground">{item.visitDate}</TableCell>
                  <TableCell className="font-medium text-foreground">{item.repName}</TableCell>
                  <TableCell>{item.outletName}</TableCell>
                  <TableCell>{item.category}</TableCell>
                  <TableCell className="tabular-nums font-medium">{formatCurrency(item.amountCents, currency)}</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{item.kms ?? "—"}</TableCell>
                  <TableCell className="max-w-[220px] truncate text-muted-foreground" title={item.note ?? undefined}>{item.note ?? "—"}</TableCell>
                  <TableCell>
                    {item.erpSyncStatus === "synced"
                      ? <Badge variant="success">{item.erpId ?? "Synced"}</Badge>
                      : <Badge variant="warning">Pending</Badge>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </main>
  );
}
