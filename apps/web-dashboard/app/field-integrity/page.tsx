"use client";

import type { JSX } from "react";

import { useEffect, useState } from "react";
import { apiClient, safeFetch } from "../api-service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface AdherenceRow { userId: string; plannedOutlets: number; visitedOutlets: number; adherencePercent: number }
interface FraudRow { userId: string; from: { at: string }; to: { at: string }; distanceMeters: number; seconds: number; speedKmh: number }

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function FieldIntegrityPage(): JSX.Element {
  const [date, setDate] = useState(today());
  const [adherence, setAdherence] = useState<AdherenceRow[]>([]);
  const [fraud, setFraud] = useState<FraudRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function load(forDate: string) {
    setLoading(true);
    const [a, f] = await Promise.all([
      safeFetch(() => apiClient.getRouteAdherence(forDate), null),
      safeFetch(() => apiClient.getFraudSignals(24), null)
    ]);
    if (a) setAdherence(a.items);
    if (f) setFraud(f.items);
    setLoading(false);
  }

  useEffect(() => { void load(date); }, [date]);

  function adherenceVariant(pct: number): "success" | "warning" | "destructive" {
    if (pct >= 80) return "success";
    if (pct >= 50) return "warning";
    return "destructive";
  }

  return (
    <main className="shell font-sans">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Route &amp; integrity</h1>
          <p className="mt-1 text-sm text-muted-foreground">Planned-vs-actual route adherence and impossible-travel (GPS-spoofing) signals.</p>
        </div>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-[170px]" />
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Route adherence — {date}</CardTitle></CardHeader>
          <CardContent className="pt-0">
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : adherence.length === 0 ? (
              <p className="text-sm text-muted-foreground">No planned routes for this date — adherence appears once reps have routes planned.</p>
            ) : (
              <Table>
                <TableHeader><TableRow><TableHead>Representative</TableHead><TableHead>Planned outlets</TableHead><TableHead>Visited</TableHead><TableHead>Adherence</TableHead></TableRow></TableHeader>
                <TableBody>
                  {adherence.map((r) => (
                    <TableRow key={r.userId}>
                      <TableCell className="font-medium text-foreground">{r.userId}</TableCell>
                      <TableCell className="tabular-nums">{r.plannedOutlets}</TableCell>
                      <TableCell className="tabular-nums">{r.visitedOutlets}</TableCell>
                      <TableCell><Badge variant={adherenceVariant(r.adherencePercent)}>{r.adherencePercent}%</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Impossible-travel signals (last 24h)</CardTitle></CardHeader>
          <CardContent className="pt-0">
            {loading ? null : fraud.length === 0 ? (
              <p className="text-sm text-muted-foreground">No anomalies detected — no location jumps faster than 200 km/h in the last 24 hours.</p>
            ) : (
              <Table>
                <TableHeader><TableRow><TableHead>Representative</TableHead><TableHead>From</TableHead><TableHead>To</TableHead><TableHead>Distance</TableHead><TableHead>Gap</TableHead><TableHead>Implied speed</TableHead></TableRow></TableHeader>
                <TableBody>
                  {fraud.map((s, i) => (
                    <TableRow key={`${s.userId}-${i}`}>
                      <TableCell className="font-medium text-foreground">{s.userId}</TableCell>
                      <TableCell className="text-muted-foreground">{new Date(s.from.at).toLocaleTimeString()}</TableCell>
                      <TableCell className="text-muted-foreground">{new Date(s.to.at).toLocaleTimeString()}</TableCell>
                      <TableCell className="tabular-nums">{(s.distanceMeters / 1000).toFixed(1)} km</TableCell>
                      <TableCell className="tabular-nums">{s.seconds}s</TableCell>
                      <TableCell><Badge variant="destructive">{s.speedKmh} km/h</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
