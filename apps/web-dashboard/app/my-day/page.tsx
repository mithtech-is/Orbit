"use client";

import type { JSX } from "react";
import { EmptyState } from "../components/empty-state";

import { useEffect, useState } from "react";
import { apiClient, safeFetch } from "../api-service";
import type { MyDayResponse } from "@orbit/api-client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function formatKm(m: number): string {
  if (m < 1000) return `${m} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

function formatDuration(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const rem = min % 60;
  return rem === 0 ? `${h} h` : `${h} h ${rem} min`;
}

function statusVariant(status: string): "success" | "default" | "warning" | "secondary" {
  if (status === "completed") return "success";
  if (status === "in_progress") return "default";
  if (status === "exception") return "warning";
  return "secondary";
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }): JSX.Element {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{value}</div>
        {hint ? <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div> : null}
      </CardContent>
    </Card>
  );
}

export default function MyDayPage(): JSX.Element {
  const [data, setData] = useState<MyDayResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const result = await safeFetch(() => apiClient.getMyToday(), null);
      if (result) setData(result);
      else setError("Couldn't load your day. Please try again.");
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <main className="shell font-sans">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">My day</h1>
          <Badge variant="secondary">Loading…</Badge>
        </div>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="shell font-sans">
        <h1 className="mb-4 text-2xl font-semibold tracking-tight text-foreground">My day</h1>
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error ?? "No data."}</div>
      </main>
    );
  }

  const dateLabel = new Date(data.date).toLocaleDateString(undefined, {
    weekday: "long", year: "numeric", month: "long", day: "numeric"
  });
  const allDone = data.summary.visitsRemaining === 0 && data.summary.visitsAssigned > 0;

  return (
    <main className="shell font-sans">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">My day</h1>
          <p className="mt-1 text-sm text-muted-foreground">{dateLabel}</p>
        </div>
        <Badge variant={allDone ? "success" : "default"} className="shrink-0">
          {allDone ? "All visits done" : data.summary.visitsAssigned === 0 ? "Nothing scheduled" : `${data.summary.visitsRemaining} of ${data.summary.visitsAssigned} remaining`}
        </Badge>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Metric label="Visits today" value={String(data.summary.visitsAssigned)} hint={`${data.summary.visitsCompleted} completed`} />
        <Metric label="Stops planned" value={String(data.summary.stopsPlanned)} hint={`across ${data.routePlans.length} route${data.routePlans.length === 1 ? "" : "s"}`} />
        <Metric label="Planned distance" value={formatKm(data.summary.plannedDistanceMeters)} hint={formatDuration(data.summary.plannedDurationMinutes)} />
        <Metric label="Open leads" value={String(data.summary.openLeads)} hint="assigned to you" />
      </div>

      <section className="mb-6">
        <h2 className="mb-3 text-base font-semibold text-foreground">Today&apos;s route</h2>
        {data.routePlans.length === 0 ? (
          <EmptyState kind="routes" title="No route planned for today" message="Your manager hasn't assigned a route. You can still record off-route visits from the Visits page." />
        ) : (
          data.routePlans.map((plan) => (
            <Card key={plan.id} className="mb-3">
              <CardContent className="p-4">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-foreground">Route {plan.id.slice(-8)}</div>
                    <div className="text-xs text-muted-foreground">
                      {plan.stops.length} stops · {formatKm(plan.plannedDistanceMeters)} · {formatDuration(plan.plannedDurationMinutes)}
                    </div>
                  </div>
                  <Badge variant={plan.status === "planned" ? "default" : "success"}>{plan.status.replace(/_/g, " ")}</Badge>
                </div>
                <ol className="ml-5 list-decimal text-sm">
                  {plan.stops.map((stop) => (
                    <li key={stop.id} className="mb-1.5">
                      <strong className="text-foreground">{stop.outletName}</strong>
                      <span className="ml-2 text-muted-foreground">({stop.outletLatitude.toFixed(4)}, {stop.outletLongitude.toFixed(4)}) · ~{stop.expectedDurationMinutes} min</span>
                      <a href={`https://www.openstreetmap.org/?mlat=${stop.outletLatitude}&mlon=${stop.outletLongitude}&zoom=16`} target="_blank" rel="noreferrer" className="ml-2.5 text-xs text-primary hover:underline">Open in map ↗</a>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          ))
        )}
      </section>

      <section className="mb-6">
        <h2 className="mb-3 text-base font-semibold text-foreground">Today&apos;s visits</h2>
        {data.visits.length === 0 ? (
          <EmptyState kind="visits" title="No visits today" message="When a manager schedules a visit, or you check in to an outlet, it will appear here." />
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Outlet</TableHead><TableHead>Status</TableHead><TableHead>Geofence</TableHead>
                  <TableHead>Check-in</TableHead><TableHead>Check-out</TableHead><TableHead>Outcome</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.visits.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="font-medium text-foreground">{v.outletName}</TableCell>
                    <TableCell><Badge variant={statusVariant(v.status)}>{v.status.replace(/_/g, " ")}</Badge></TableCell>
                    <TableCell>{v.geofenceStatus ? <Badge variant={statusVariant(v.geofenceStatus)}>{v.geofenceStatus}</Badge> : <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-muted-foreground">{v.checkedInAt ? new Date(v.checkedInAt).toLocaleTimeString() : "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{v.checkedOutAt ? new Date(v.checkedOutAt).toLocaleTimeString() : "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{v.outcome ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </section>

      {data.leads.length > 0 ? (
        <section>
          <h2 className="mb-3 text-base font-semibold text-foreground">Open leads assigned to you</h2>
          <Card>
            <Table>
              <TableHeader><TableRow><TableHead>Lead</TableHead><TableHead>Outlet</TableHead><TableHead>Status</TableHead><TableHead>Priority</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.leads.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium text-foreground">{l.name}</TableCell>
                    <TableCell className="text-muted-foreground">{l.outletName}</TableCell>
                    <TableCell className="text-muted-foreground">{l.status}</TableCell>
                    <TableCell className="text-muted-foreground">{l.priority}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </section>
      ) : null}
    </main>
  );
}
