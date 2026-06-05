"use client";

import type { JSX } from "react";

import { useEffect, useState } from "react";
import { apiClient, safeFetch } from "../api-service";
import type { SyncConflict } from "@orbit/api-client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type ConflictAction = "apply_client" | "apply_server" | "dismiss";

export default function SyncConflictsPage(): JSX.Element {
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    const result = await safeFetch(() => apiClient.listSyncConflicts({ limit: 100 }), null);
    if (result) setConflicts(result.items);
    else setError("We couldn't load sync issues. Please try again.");
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function resolve(id: string, action: ConflictAction) {
    setBusyId(id);
    setError(null);
    const result = await safeFetch(() => apiClient.resolveSyncConflict(id, action), null);
    setBusyId(null);
    if (result) setConflicts((prev) => prev.filter((c) => c.id !== id));
    else setError("Couldn't resolve that conflict. If applying the rep's change kept failing, the server state likely moved on — try 'Keep server'.");
  }

  return (
    <main className="shell font-sans">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Sync issues</h1>
          <p className="mt-1 text-sm text-muted-foreground">Offline changes that need a manager&apos;s attention.</p>
        </div>
        <Badge variant={conflicts.length > 0 ? "warning" : "secondary"} className="shrink-0">
          {loading ? "Loading…" : conflicts.length === 0 ? "All clear" : `${conflicts.length} need attention`}
        </Badge>
      </div>

      {error ? (
        <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
      ) : null}

      {loading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Loading sync issues…</p>
      ) : conflicts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <h3 className="text-base font-semibold text-foreground">No sync issues</h3>
            <p className="text-sm text-muted-foreground">Offline changes from your representatives are syncing cleanly.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Change ref</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Current state</TableHead>
                <TableHead className="text-right">Resolve</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {conflicts.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{new Date(c.createdAt).toLocaleString()}</TableCell>
                  <TableCell>{c.mutationType.replace(/_/g, " ")}</TableCell>
                  <TableCell><Badge variant="warning">{c.reason.replace(/_/g, " ")}</Badge></TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{c.idempotencyKey}</TableCell>
                  <TableCell className="max-w-[220px] truncate font-mono text-xs text-muted-foreground" title={JSON.stringify(c.clientPayload)}>
                    {JSON.stringify(c.clientPayload)}
                  </TableCell>
                  <TableCell className="max-w-[220px] truncate font-mono text-xs text-muted-foreground" title={c.serverState ? JSON.stringify(c.serverState) : "—"}>
                    {c.serverState ? JSON.stringify(c.serverState) : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2 whitespace-nowrap">
                      <Button variant="outline" size="sm" disabled={busyId === c.id} onClick={() => void resolve(c.id, "apply_client")} title="Re-apply the rep's offline change, overwriting the server">Apply rep&apos;s</Button>
                      <Button variant="outline" size="sm" disabled={busyId === c.id} onClick={() => void resolve(c.id, "apply_server")} title="Keep the current server state">Keep server</Button>
                      <Button variant="ghost" size="sm" disabled={busyId === c.id} onClick={() => void resolve(c.id, "dismiss")} title="Dismiss without applying either">Dismiss</Button>
                    </div>
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
