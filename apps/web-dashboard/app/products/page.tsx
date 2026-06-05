"use client";

import type { JSX } from "react";
import { useEffect, useState } from "react";
import { Plus, PackageSearch } from "lucide-react";
import { apiClient, safeFetch, loadSession } from "../api-service";
import type { ProductSummary } from "@orbit/api-client";
import { formatMinor, currencySymbol, useOrgCurrency } from "../money";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface ProductDraft {
  id?: string;
  name: string;
  sku: string;
  price: string;   // major units, e.g. "12.50"
  stock: string;
}

const EMPTY: ProductDraft = { name: "", sku: "", price: "", stock: "0" };

function stockVariant(n: number): "success" | "warning" | "destructive" {
  if (n <= 0) return "destructive";
  if (n <= 10) return "warning";
  return "success";
}

export default function ProductsPage(): JSX.Element {
  const currency = useOrgCurrency();
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ProductDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);

  async function load() {
    setLoading(true);
    setCanManage(Boolean(loadSession()?.permissions?.includes("outlet:write")));
    const res = await safeFetch(() => apiClient.listProducts(), null);
    if (res) { setProducts(res.items); setError(null); }
    else setError("We couldn't load products. Please try again.");
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setFormError(null);
    if (!draft.name.trim()) { setFormError("Product name is required."); return; }
    if (!draft.sku.trim()) { setFormError("SKU is required."); return; }
    const price = Number(draft.price);
    const stock = Number(draft.stock);
    if (!Number.isFinite(price) || price < 0) { setFormError("Enter a valid price."); return; }
    if (!Number.isFinite(stock) || stock < 0) { setFormError("Enter a valid stock quantity."); return; }
    setSaving(true);
    try {
      const payload = { name: draft.name.trim(), sku: draft.sku.trim(), unitPriceCents: Math.round(price * 100), inventoryAvailable: Math.round(stock) };
      if (draft.id) await apiClient.updateProduct(draft.id, payload);
      else await apiClient.createProduct(payload);
      setDraft(null);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  const lowStock = products.filter((p) => p.inventoryAvailable <= 10).length;

  return (
    <main className="shell font-sans">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Products</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your catalogue and live stock. Stock drops automatically as reps place orders.</p>
        </div>
        <div className="flex items-center gap-2">
          {lowStock > 0 ? <Badge variant="warning" className="shrink-0">{lowStock} low / out of stock</Badge> : null}
          <Badge variant="secondary" className="shrink-0">{loading ? "Loading…" : `${products.length} products`}</Badge>
        </div>
      </div>

      {canManage ? (
        <div className="mb-4">
          <Button onClick={() => setDraft({ ...EMPTY })}><Plus className="h-4 w-4" /> New product</Button>
        </div>
      ) : null}

      {error ? (
        <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
      ) : null}

      {loading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Loading products…</p>
      ) : products.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <PackageSearch className="h-8 w-8 text-muted-foreground" />
            <h3 className="text-base font-semibold text-foreground">No products yet</h3>
            <p className="text-sm text-muted-foreground">{canManage ? "Add your first product to start taking orders." : "Products will appear here once an admin adds them."}</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Stock</TableHead>
                {canManage ? <TableHead className="text-right">Actions</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium text-foreground">{p.name}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{p.sku}</TableCell>
                  <TableCell className="tabular-nums">{formatMinor(p.unitPriceCents, currency)}</TableCell>
                  <TableCell>
                    <Badge variant={stockVariant(p.inventoryAvailable)}>
                      {p.inventoryAvailable <= 0 ? "Out of stock" : `${p.inventoryAvailable} in stock`}
                    </Badge>
                  </TableCell>
                  {canManage ? (
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" onClick={() => setDraft({
                        id: p.id, name: p.name, sku: p.sku,
                        price: (p.unitPriceCents / 100).toString(), stock: String(p.inventoryAvailable)
                      })}>Edit / Restock</Button>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog open={draft !== null} onOpenChange={(o) => { if (!o) setDraft(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit product" : "Add a product"}</DialogTitle>
            <DialogDescription>{draft?.id ? "Update details and set the current stock level (a restock)." : "Add a product to your catalogue with an opening stock level."}</DialogDescription>
          </DialogHeader>
          {draft ? (
            <form onSubmit={handleSave} className="grid gap-4">
              {formError ? (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{formError}</div>
              ) : null}
              <div className="grid gap-1.5">
                <Label htmlFor="p-name">Product name</Label>
                <Input id="p-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required autoFocus />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="p-sku">SKU</Label>
                <Input id="p-sku" value={draft.sku} onChange={(e) => setDraft({ ...draft, sku: e.target.value })} required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="p-price">Unit price ({currencySymbol(currency).trim()})</Label>
                  <Input id="p-price" type="number" min="0" step="0.01" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="p-stock">Stock on hand</Label>
                  <Input id="p-stock" type="number" min="0" step="1" value={draft.stock} onChange={(e) => setDraft({ ...draft, stock: e.target.value })} />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDraft(null)} disabled={saving}>Cancel</Button>
                <Button type="submit" disabled={saving}>{saving ? "Saving…" : draft.id ? "Save changes" : "Add product"}</Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </main>
  );
}
