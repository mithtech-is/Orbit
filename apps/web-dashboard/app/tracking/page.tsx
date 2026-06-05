"use client";

import type { JSX } from "react";

import { useEffect, useState } from "react";
import { apiClient, safeFetch } from "../api-service";
import type { WorkSessionSummary } from "@orbit/api-client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function sessionVariant(status: string): "success" | "secondary" | "warning" {
  if (status === "active") return "success";
  if (status === "stopped") return "secondary";
  return "warning";
}

export default function TrackingPage(): JSX.Element {
  const [sessions, setSessions] = useState<WorkSessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const result = await safeFetch(() => apiClient.listSessions(), null);
      if (result) setSessions(result.items);
      else setError("We couldn't load tracking sessions. Please try again.");
      setLoading(false);
    })();
  }, []);

  async function handleStart() {
    setError(null);
    const r = await safeFetch(() => apiClient.startSession({}), null);
    if (!r) setError("Unable to start a work session. Please try again.");
    const list = await safeFetch(() => apiClient.listSessions(), null);
    if (list) setSessions(list.items);
  }

  async function handleStop() {
    setError(null);
    const r = await safeFetch(() => apiClient.stopSession(), null);
    if (!r) setError("Unable to stop the active session. Please try again.");
    const list = await safeFetch(() => apiClient.listSessions(), null);
    if (list) setSessions(list.items);
  }

  const activeCount = sessions.filter((s) => s.status === "active").length;

  return (
    <main className="shell font-sans">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Tracking sessions</h1>
          <p className="mt-1 text-sm text-muted-foreground">Active and recent work sessions across your team.</p>
        </div>
        <Badge variant={activeCount > 0 ? "success" : "secondary"} className="shrink-0">
          {loading ? "Loading…" : `${activeCount} active · ${sessions.length} today`}
        </Badge>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Button onClick={handleStart} disabled={activeCount > 0}>Start work session</Button>
        <Button variant="outline" onClick={handleStop} disabled={activeCount === 0}>Stop active session</Button>
      </div>

      {error ? (
        <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
      ) : null}

      {loading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Loading sessions…</p>
      ) : sessions.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <h3 className="text-base font-semibold text-foreground">No sessions yet today</h3>
            <p className="text-sm text-muted-foreground">Tracking sessions appear here once your representatives sign on for the day.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Session</TableHead>
                <TableHead>Representative</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Ended</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">{s.id}</TableCell>
                  <TableCell className="font-medium text-foreground">{s.userId}</TableCell>
                  <TableCell><Badge variant={sessionVariant(s.status)}>{s.status}</Badge></TableCell>
                  <TableCell className="text-muted-foreground">{new Date(s.startedAt).toLocaleString()}</TableCell>
                  <TableCell className="text-muted-foreground">{s.endedAt ? new Date(s.endedAt).toLocaleString() : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </main>
  );
}
