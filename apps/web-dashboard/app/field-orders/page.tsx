"use client";

import type { JSX } from "react";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { apiClient, safeFetch } from "../api-service";
import type { FieldOrderSummary, ProductSummary, OutletSummary, UserSummary } from "@orbit/api-client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// ERPNext admin base — used to deep-link a synced Sales Order into the ERPNext UI
// so admins can manage products + orders + expenses under one tree.
const ERP_ADMIN_BASE = process.env.NEXT_PUBLIC_ERP_ADMIN_URL ?? "http://localhost:8082";

function formatCurrency(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

function orderVariant(status: string): "success" | "default" | "destructive" | "secondary" {
  if (status === "accepted") return "success";
  if (status === "fulfilled" || status === "synced") return "default";
  if (status === "cancelled") return "destructive";
  return "secondary";
}

const ORDER_TRANSITIONS: Record<string, Array<{ to: string; label: string }>> = {
  pending: [{ to: "accepted", label: "Accept" }, { to: "cancelled", label: "Cancel" }],
  accepted: [{ to: "fulfilled", label: "Mark fulfilled" }, { to: "cancelled", label: "Cancel" }]
};

export default function FieldOrdersPage(): JSX.Element {
  const [orders, setOrders] = useState<FieldOrderSummary[]>([]);
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [outlets, setOutlets] = useState<OutletSummary[]>([]);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [currency, setCurrency] = useState("INR");
  const [outletId, setOutletId] = useState("");
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [statusBusyId, setStatusBusyId] = useState<string | null>(null);

  async function loadAll() {
    setLoading(true);
    const [o, p, ol, u, s] = await Promise.all([
      safeFetch(() => apiClient.listFieldOrders(), null),
      safeFetch(() => apiClient.listProducts(), null),
      safeFetch(() => apiClient.listOutlets(), null),
      safeFetch(() => apiClient.listUsers(), null),
      safeFetch(() => apiClient.getOrganisationSettings(), null)
    ]);
    if (o) setOrders(o.items);
    if (p) setProducts(p.items);
    if (ol) setOutlets(ol.items);
    if (u) setUsers(u.items);
    if (s) setCurrency(s.currency);
    setLoading(false);
  }

  const outletName = (id: string) => outlets.find((o) => o.id === id)?.name ?? id;
  const userName = (id: string) => users.find((u) => u.id === id)?.name ?? id;

  useEffect(() => { void loadAll(); }, []);

  async function changeStatus(id: string, status: string) {
    setStatusBusyId(id);
    setError(null);
    const result = await safeFetch(() => apiClient.updateFieldOrderStatus(id, status), null);
    setStatusBusyId(null);
    if (result) setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));
    else setError("Couldn't update that order's status.");
  }

  async function submit() {
    if (submitting) return;
    setMessage(null);
    setError(null);
    const qty = Number(quantity);
    if (!outletId || !productId || !Number.isFinite(qty) || qty <= 0) {
      setError("Outlet, product, and a quantity greater than zero are required.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await apiClient.createFieldOrder({ outletId, source: "online", lines: [{ productId, quantity: qty }] });
      setMessage(`Order created (${formatCurrency(result.totalCents, currency)}).`);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create order right now.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="shell font-sans">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Orders</h1>
          <p className="mt-1 text-sm text-muted-foreground">Field orders captured by your representatives.</p>
        </div>
        <Badge variant="secondary" className="shrink-0">{loading ? "Loading…" : `${orders.length} orders`}</Badge>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3 shadow-sm">
        <Select value={outletId} onValueChange={setOutletId}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Outlet…" /></SelectTrigger>
          <SelectContent>{outlets.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={productId} onValueChange={setProductId}>
          <SelectTrigger className="w-[240px]"><SelectValue placeholder="Product…" /></SelectTrigger>
          <SelectContent>{products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.inventoryAvailable} in stock)</SelectItem>)}</SelectContent>
        </Select>
        <Input type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} className="w-[90px]" />
        <Button onClick={submit} disabled={submitting || !outletId || !productId}>{submitting ? "Creating…" : "Create order"}</Button>
        {message ? <Badge variant="success">{message}</Badge> : null}
      </div>

      {error ? (
        <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
      ) : null}

      {loading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Loading orders…</p>
      ) : orders.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <h3 className="text-base font-semibold text-foreground">No orders yet</h3>
            <p className="text-sm text-muted-foreground">Orders captured at outlets by your reps will appear here.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Outlet</TableHead>
                <TableHead>Representative</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Actions</TableHead>
                <TableHead>ERPNext</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{new Date(o.createdAt).toLocaleString()}</TableCell>
                  <TableCell className="font-mono text-xs">{o.id.slice(-10)}</TableCell>
                  <TableCell className="font-medium text-foreground">{outletName(o.outletId)}</TableCell>
                  <TableCell>{userName(o.repUserId)}</TableCell>
                  <TableCell className="text-muted-foreground">{o.source}</TableCell>
                  <TableCell><Badge variant={orderVariant(o.status)}>{o.status}</Badge></TableCell>
                  <TableCell className="tabular-nums font-medium">{formatCurrency(o.totalCents, currency)}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    <div className="flex gap-2">
                      {(ORDER_TRANSITIONS[o.status] ?? []).map((t) => (
                        <Button key={t.to} variant="outline" size="sm" disabled={statusBusyId === o.id} onClick={() => void changeStatus(o.id, t.to)}>
                          {t.label}
                        </Button>
                      ))}
                      {(ORDER_TRANSITIONS[o.status] ?? []).length === 0 ? <span className="text-xs text-muted-foreground">—</span> : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    {o.erpOrderId ? (
                      <a href={`${ERP_ADMIN_BASE}/app/sales-order/${encodeURIComponent(o.erpOrderId)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                        View <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
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
