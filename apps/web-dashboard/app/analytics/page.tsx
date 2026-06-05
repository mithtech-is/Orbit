"use client";

import type { JSX } from "react";
import { useEffect, useState } from "react";
import { apiClient, safeFetch } from "../api-service";
import type { OffTargetLeaderboard, ConversionFunnel, TimeOnField, ReportTrends, UserSummary, VisitQuality } from "@orbit/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMinor, useOrgCurrency } from "../money";

const BAR = "hsl(var(--sc-primary))";
const TRACK = "hsl(var(--sc-muted))";

export default function AnalyticsPage(): JSX.Element {
  const [leaderboard, setLeaderboard] = useState<OffTargetLeaderboard | null>(null);
  const [funnel, setFunnel] = useState<ConversionFunnel | null>(null);
  const [timeOnField, setTimeOnField] = useState<TimeOnField | null>(null);
  const [trends, setTrends] = useState<ReportTrends | null>(null);
  const [quality, setQuality] = useState<VisitQuality | null>(null);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const currency = useOrgCurrency();

  useEffect(() => {
    void (async () => {
      const [lb, fn, tof, tr, vq, us] = await Promise.all([
        safeFetch(() => apiClient.getOffTargetLeaderboard(30), null),
        safeFetch(() => apiClient.getConversionFunnel(), null),
        safeFetch(() => apiClient.getTimeOnField(), null),
        safeFetch(() => apiClient.getReportTrends(14), null),
        safeFetch(() => apiClient.getVisitQuality(30), null),
        safeFetch(() => apiClient.listUsers(), null)
      ]);
      if (lb) setLeaderboard(lb);
      if (fn) setFunnel(fn);
      if (tof) setTimeOnField(tof);
      if (tr) setTrends(tr);
      if (vq) setQuality(vq);
      if (us) setUsers(us.items);
      setLoading(false);
    })();
  }, []);

  const name = (id: string) => users.find((u) => u.id === id)?.name ?? id;

  const maxDay = Math.max(1, ...(trends?.visitsPerDay.map((d) => d.visits) ?? [1]));
  const maxOutcome = Math.max(1, ...(trends?.visitsByOutcome.map((d) => d.count) ?? [1]));
  const funnelMax = Math.max(1, ...(funnel?.stages.map((s) => s.count) ?? [1]));
  const maxMinutes = Math.max(1, ...(timeOnField?.items.map((i) => i.minutes) ?? [1]));

  return (
    <main className="shell font-sans">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Analytics</h1>
          <p className="mt-1 text-sm text-muted-foreground">Team performance, conversion, and field activity.</p>
        </div>
        <Badge variant={loading ? "secondary" : "success"} className="shrink-0">{loading ? "Loading…" : "Live"}</Badge>
      </div>

      <Card className="mb-4">
        <CardHeader className="pb-3"><CardTitle className="text-base">Visits — last {trends?.days ?? 14} days</CardTitle></CardHeader>
        <CardContent>
          {trends && trends.visitsPerDay.length > 0 ? (
            <div className="flex h-36 items-end gap-1.5 pt-2">
              {trends.visitsPerDay.map((d) => (
                <div key={d.date} className="flex h-full flex-1 flex-col items-center justify-end">
                  <div className="relative flex w-3/5 items-end" style={{ height: `${(d.visits / maxDay) * 100}%` }}>
                    <div className="absolute bottom-0 h-full w-full rounded" style={{ background: TRACK }} />
                    <div className="relative w-full rounded" style={{ background: BAR, height: `${(d.completed / Math.max(d.visits, 1)) * 100}%` }} title={`${d.completed}/${d.visits}`} />
                  </div>
                  <small className="mt-1 text-[9px] text-muted-foreground">{d.date.slice(8, 10)}</small>
                </div>
              ))}
            </div>
          ) : <Empty loading={loading} />}
          <small className="text-muted-foreground">Bar height = visits · filled = completed</small>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader className="pb-3"><CardTitle className="text-base">Visit quality (30d)</CardTitle></CardHeader>
        <CardContent>
          {quality ? (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <Kpi label="Avg rating" value={quality.ratedVisits > 0 ? `${quality.avgRating.toFixed(1)}★` : "—"} sub={`${quality.ratedVisits} rated`} />
                <Kpi label="Avg NPS" value={quality.npsResponses > 0 ? quality.avgNps.toFixed(1) : "—"} sub={`${quality.npsResponses} responses`} />
                <Kpi label="Expenses" value={formatMinor(quality.expenseCents, currency)} sub="logged on visits" />
                <Kpi label="Samples" value={`${quality.samples}`} sub="units handed out" />
                <Kpi label="Competitor notes" value={`${quality.competitorNotes}`} sub="intel captured" />
              </div>
              <div className="mt-4 flex flex-wrap gap-6">
                <div className="min-w-[260px] flex-1">
                  <p className="mb-2 text-sm font-medium text-foreground">Top competitors spotted</p>
                  {quality.topCompetitors.length > 0 ? (
                    <div className="flex flex-col gap-1.5">
                      {quality.topCompetitors.map((c) => {
                        const max = Math.max(1, ...quality.topCompetitors.map((x) => x.mentions));
                        return (
                          <div key={c.name} className="flex items-center gap-3">
                            <span className="w-32 truncate text-sm">{c.name}</span>
                            <div className="h-[16px] flex-1 rounded-md" style={{ background: TRACK }}>
                              <div className="h-full rounded-md" style={{ width: `${(c.mentions / max) * 100}%`, background: BAR }} />
                            </div>
                            <strong className="w-8 text-right text-sm tabular-nums">{c.mentions}</strong>
                          </div>
                        );
                      })}
                    </div>
                  ) : <p className="text-sm text-muted-foreground">No competitor intel logged yet.</p>}
                </div>
                <div className="min-w-[260px] flex-1">
                  <p className="mb-2 text-sm font-medium text-foreground">Expenses by category</p>
                  {quality.expensesByCategory.length > 0 ? (
                    <div className="flex flex-col gap-1.5">
                      {quality.expensesByCategory.map((e) => {
                        const max = Math.max(1, ...quality.expensesByCategory.map((x) => x.totalCents));
                        return (
                          <div key={e.category} className="flex items-center gap-3">
                            <span className="w-24 truncate text-sm">{e.category}</span>
                            <div className="h-[16px] flex-1 rounded-md" style={{ background: TRACK }}>
                              <div className="h-full rounded-md" style={{ width: `${(e.totalCents / max) * 100}%`, background: BAR }} />
                            </div>
                            <strong className="w-20 text-right text-sm tabular-nums">{formatMinor(e.totalCents, currency)}</strong>
                          </div>
                        );
                      })}
                    </div>
                  ) : <p className="text-sm text-muted-foreground">No expenses logged yet.</p>}
                </div>
              </div>
            </>
          ) : <Empty loading={loading} />}
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader className="pb-3"><CardTitle className="text-base">Conversion funnel</CardTitle></CardHeader>
        <CardContent>
          {funnel ? (
            <div className="flex flex-col gap-2">
              {funnel.stages.map((s) => (
                <div key={s.key} className="flex items-center gap-3">
                  <span className="w-24 text-sm">{s.label}</span>
                  <div className="h-[22px] flex-1 overflow-hidden rounded-md" style={{ background: TRACK }}>
                    <div className="h-full" style={{ width: `${(s.count / funnelMax) * 100}%`, background: BAR }} />
                  </div>
                  <strong className="w-12 text-right text-sm tabular-nums">{s.count}</strong>
                </div>
              ))}
            </div>
          ) : <Empty loading={loading} />}
        </CardContent>
      </Card>

      <div className="mb-4 flex flex-wrap gap-4">
        <Card className="min-w-[320px] flex-1">
          <CardHeader className="pb-3"><CardTitle className="text-base">Off-target leaderboard (30d)</CardTitle></CardHeader>
          <CardContent className="pt-0">
            {leaderboard && leaderboard.items.length > 0 ? (
              <Table>
                <TableHeader><TableRow><TableHead>Rep</TableHead><TableHead>Visits</TableHead><TableHead>Off-target</TableHead><TableHead>%</TableHead></TableRow></TableHeader>
                <TableBody>
                  {leaderboard.items.map((r) => (
                    <TableRow key={r.userId}>
                      <TableCell className="font-medium text-foreground">{name(r.userId)}</TableCell>
                      <TableCell className="tabular-nums">{r.totalVisits}</TableCell>
                      <TableCell className="tabular-nums">{r.offTarget}</TableCell>
                      <TableCell><Badge variant={r.offTargetPercent >= 20 ? "warning" : "success"}>{r.offTargetPercent}%</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : <Empty loading={loading} label="No visits in range." />}
          </CardContent>
        </Card>

        <Card className="min-w-[320px] flex-1">
          <CardHeader className="pb-3"><CardTitle className="text-base">Time on field — today</CardTitle></CardHeader>
          <CardContent>
            {timeOnField && timeOnField.items.length > 0 ? (
              <div className="flex flex-col gap-2">
                {timeOnField.items.map((i) => (
                  <div key={i.userId} className="flex items-center gap-3">
                    <span className="w-28 truncate text-sm">{name(i.userId)}</span>
                    <div className="h-[18px] flex-1 rounded-md" style={{ background: TRACK }}>
                      <div className="h-full rounded-md" style={{ width: `${(i.minutes / maxMinutes) * 100}%`, background: BAR }} />
                    </div>
                    <strong className="w-[70px] text-right text-sm tabular-nums">{Math.floor(i.minutes / 60)}h {i.minutes % 60}m</strong>
                  </div>
                ))}
              </div>
            ) : <Empty loading={loading} label="No completed visits today." />}
          </CardContent>
        </Card>
      </div>

      <Card className="mb-4">
        <CardHeader className="pb-3"><CardTitle className="text-base">Visits by outcome (30d)</CardTitle></CardHeader>
        <CardContent>
          {trends && trends.visitsByOutcome.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              {trends.visitsByOutcome.map((o) => (
                <div key={o.outcome} className="flex items-center gap-3">
                  <span className="w-40 truncate text-sm">{o.outcome}</span>
                  <div className="h-[18px] flex-1 rounded-md" style={{ background: TRACK }}>
                    <div className="h-full rounded-md" style={{ width: `${(o.count / maxOutcome) * 100}%`, background: BAR }} />
                  </div>
                  <strong className="w-10 text-right text-sm tabular-nums">{o.count}</strong>
                </div>
              ))}
            </div>
          ) : <Empty loading={loading} />}
        </CardContent>
      </Card>
    </main>
  );
}

function Empty({ loading, label }: { loading: boolean; label?: string }): JSX.Element {
  return <p className="my-2 text-sm text-muted-foreground">{loading ? "Loading…" : (label ?? "No data yet.")}</p>;
}

function Kpi({ label, value, sub }: { label: string; value: string; sub: string }): JSX.Element {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}
