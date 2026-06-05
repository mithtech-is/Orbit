"use client";

import type { JSX } from "react";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { apiClient, safeFetch } from "../api-service";
import { exportTextFile, toCsv } from "../desktop-bridge";
import type { AuditEntry } from "@orbit/api-client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function AuditLogPage(): JSX.Element {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [actionPrefix, setActionPrefix] = useState("");
  const [actorFilter, setActorFilter] = useState("");
  const [targetTypeFilter, setTargetTypeFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load(prefix?: string) {
    setLoading(true);
    setError(null);
    const result = await safeFetch(() => apiClient.listAuditLog({ actionPrefix: prefix || undefined, limit: 500 }), null);
    if (result) setEntries(result.items);
    else setError("We couldn't load the audit log. Please try again.");
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  const filtered = entries.filter((e) => {
    if (actorFilter && (e.actorUserId ?? "").toLowerCase().indexOf(actorFilter.toLowerCase()) === -1) return false;
    if (targetTypeFilter && e.targetType.toLowerCase().indexOf(targetTypeFilter.toLowerCase()) === -1) return false;
    return true;
  });

  async function handleExport() {
    if (filtered.length === 0) return;
    const rows = filtered.map((e) => ({
      createdAt: e.createdAt,
      actorUserId: e.actorUserId ?? "",
      action: e.action,
      targetType: e.targetType,
      targetId: e.targetId,
      metadata: JSON.stringify(e.metadata)
    }));
    const csv = toCsv(rows, ["createdAt", "actorUserId", "action", "targetType", "targetId", "metadata"]);
    await exportTextFile({ suggestedName: `audit-log-${new Date().toISOString().slice(0, 10)}.csv`, mimeType: "text/csv", contents: csv });
  }

  return (
    <main className="shell font-sans">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Audit log</h1>
          <p className="mt-1 text-sm text-muted-foreground">Tamper-evident record of every change in your workspace.</p>
        </div>
        <Badge variant="secondary" className="shrink-0">{loading ? "Loading…" : `${filtered.length} of ${entries.length} entries`}</Badge>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3 shadow-sm">
        <Input
          placeholder="Action prefix, e.g. tracking, lead, user.invited"
          value={actionPrefix}
          onChange={(e) => setActionPrefix(e.target.value)}
          className="min-w-[240px] flex-1"
        />
        <Button variant="secondary" onClick={() => void load(actionPrefix)}>Apply filter</Button>
        <Input placeholder="Actor id contains…" value={actorFilter} onChange={(e) => setActorFilter(e.target.value)} className="w-[180px]" />
        <Input placeholder="Target type contains…" value={targetTypeFilter} onChange={(e) => setTargetTypeFilter(e.target.value)} className="w-[180px]" />
        <Button variant="ghost" onClick={() => { setActionPrefix(""); setActorFilter(""); setTargetTypeFilter(""); void load(); }}>Clear</Button>
        <Button variant="outline" onClick={handleExport} disabled={filtered.length === 0}><Download className="h-4 w-4" /> Export CSV</Button>
      </div>

      {error ? (
        <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
      ) : null}

      {loading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Loading audit log…</p>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <h3 className="text-base font-semibold text-foreground">No audit entries match these filters</h3>
            <p className="text-sm text-muted-foreground">Try clearing a filter or check back once activity is recorded.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{new Date(e.createdAt).toLocaleString()}</TableCell>
                  <TableCell>{e.actorUserId ?? <span className="text-muted-foreground">System</span>}</TableCell>
                  <TableCell className="font-medium text-foreground">{e.action}</TableCell>
                  <TableCell className="font-mono text-xs">{e.targetType}:{e.targetId}</TableCell>
                  <TableCell className="max-w-[280px] truncate font-mono text-[11px] text-muted-foreground" title={JSON.stringify(e.metadata)}>
                    {JSON.stringify(e.metadata)}
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
