"use client";

import type { JSX } from "react";

import { useEffect, useState } from "react";
import { apiClient, safeFetch } from "../api-service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface ErpStatus {
  provider: string;
  connection: { ok: boolean; message?: string };
  mappings: Record<string, number>;
}

export default function IntegrationsPage(): JSX.Element {
  const [status, setStatus] = useState<ErpStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function loadStatus() {
    setLoading(true);
    const res = await safeFetch(() => apiClient.getErpStatus(), null);
    if (res) setStatus({ provider: res.provider, connection: res.connection, mappings: res.mappings });
    setLoading(false);
  }

  useEffect(() => { void loadStatus(); }, []);

  async function testConnection() {
    setTesting(true);
    setMessage(null);
    const res = await safeFetch(() => apiClient.getErpStatus(), null);
    setTesting(false);
    if (res) {
      setStatus({ provider: res.provider, connection: res.connection, mappings: res.mappings });
      setMessage(res.connection.ok ? "✓ Connected to ERPNext." : `✗ Not connected: ${res.connection.message ?? "unknown error"}`);
    } else {
      setMessage("Couldn't reach the integrations API.");
    }
  }

  async function backfill() {
    if (!confirm("Push all outlets, products, leads, and sales reps to the connected ERPNext / CRM now?")) return;
    setBackfilling(true);
    setMessage(null);
    const res = await safeFetch(() => apiClient.backfillToErp(), null);
    setBackfilling(false);
    if (res)
      setMessage(
        `Backfilled ${res.backfilled.outlets} customer(s), ${res.backfilled.products} product(s), ${res.backfilled.leads} lead(s), and ${res.backfilled.reps} sales rep(s).`
      );
    else setMessage("Backfill failed — check the connection first.");
    void loadStatus();
  }

  const disabled = status?.provider === "noop";

  return (
    <main className="shell font-sans">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Integrations</h1>
        <p className="mt-1 text-sm text-muted-foreground">Connect Orbit to an external ERP / CRM.</p>
      </div>

      <Card className="max-w-3xl">
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle>ERPNext</CardTitle>
          {loading ? (
            <Badge variant="secondary">Loading…</Badge>
          ) : disabled ? (
            <Badge variant="warning">Disabled</Badge>
          ) : status?.connection.ok ? (
            <Badge variant="success">Connected</Badge>
          ) : (
            <Badge variant="destructive">Not connected</Badge>
          )}
        </CardHeader>
        <CardContent>
          {disabled ? (
            <p className="text-sm text-muted-foreground">
              The ERPNext connector is off. To connect a <strong>separate</strong> ERPNext instance (your existing one is never touched), set these on the backend and restart:
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Provider: <code className="font-mono">{status?.provider}</code>
              {status?.connection.message ? <> · {status.connection.message}</> : null}
            </p>
          )}

          {disabled ? (
            <pre className="mt-3 overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs text-foreground">
{`ERPNEXT_ENABLED=true
ERPNEXT_BASE_URL=http://localhost:8082   # the separate ERPNext + CRM instance
ERPNEXT_API_KEY=...        ERPNEXT_API_SECRET=...
ERPNEXT_COMPANY="Your Company"
ERPNEXT_CURRENCY=INR
ERPNEXT_CUSTOMER_GROUP=Commercial        # must be a leaf (non-group) Customer Group
ERPNEXT_TERRITORY="All Territories"
# Frappe CRM (lead capture):
ERPNEXT_CRM_LEAD_SOURCE="Walk In"
ERPNEXT_CRM_DEFAULT_LEAD_STATUS=New
# Sales reps -> Sales Person (Selling): parent group node in the Sales Person tree
ERPNEXT_SALES_PERSON_PARENT="Sales Team"`}
            </pre>
          ) : (
            <div className="mt-3 flex flex-wrap gap-4">
              {Object.entries(status?.mappings ?? {}).map(([k, v]) => (
                <span key={k} className="text-sm text-muted-foreground"><strong className="text-foreground">{v}</strong> {k} synced</span>
              ))}
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-3">
            <Button onClick={() => void testConnection()} disabled={testing}>{testing ? "Testing…" : "Test connection"}</Button>
            {!disabled && status?.connection.ok ? (
              <Button variant="outline" onClick={() => void backfill()} disabled={backfilling}>
                {backfilling ? "Backfilling…" : "Backfill customers + products + leads + reps"}
              </Button>
            ) : null}
          </div>

          {message ? <p className="mt-3 text-sm font-semibold text-foreground">{message}</p> : null}
        </CardContent>
      </Card>

      <p className="mt-4 max-w-3xl text-sm text-muted-foreground">
        Tip: stand up a brand-new ERPNext site (Frappe Cloud or a fresh self-hosted instance) with its own database, create a dedicated API
        user (scoped role), and point <code className="font-mono">ERPNEXT_BASE_URL</code> at it. The connector only ever calls that URL, so any
        other ERPNext you run is unaffected.
      </p>
    </main>
  );
}
