"use client";

import type { JSX } from "react";

import { Fragment, useEffect, useState } from "react";
import { apiClient, safeFetch } from "../api-service";
import type { VisitSummary, UserSummary, VisitExtras, VisitProofPhoto } from "@orbit/api-client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function rupees(cents: number): string {
  return `₹${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function geofenceVariant(status: string | null): "success" | "warning" | "secondary" {
  if (status === "within") return "success";
  if (status === "exception") return "warning";
  return "secondary";
}

function visitVariant(status: string): "success" | "info" | "warning" | "secondary" {
  if (status === "completed") return "success";
  if (status === "in_progress") return "info";
  if (status === "exception") return "warning";
  return "secondary";
}

function VisitExtrasView({ data }: { data: VisitExtras }): JSX.Element {
  const hasFeedback = data.feedbackRating != null || data.npsScore != null || data.feedbackText || data.signedBy;
  const empty = !hasFeedback && data.proofPhotos.length === 0 && data.expenses.length === 0 && data.competitorIntel.length === 0 && data.samples.length === 0;
  if (empty) return <span className="text-sm text-muted-foreground">No extra details captured for this visit.</span>;
  return (
    <div className="flex flex-wrap gap-6 py-2 text-sm">
      {hasFeedback ? (
        <div>
          <strong className="text-foreground">Feedback</strong>
          <div>{data.feedbackRating != null ? `★ ${data.feedbackRating}/5` : ""}{data.npsScore != null ? ` · NPS ${data.npsScore}` : ""}</div>
          {data.feedbackText ? <div className="text-muted-foreground">&ldquo;{data.feedbackText}&rdquo;</div> : null}
          {data.signedBy ? <div className="text-muted-foreground">Ack: {data.signedBy}</div> : null}
        </div>
      ) : null}
      {data.proofPhotos.length > 0 ? <ProofPhotos photos={data.proofPhotos} /> : null}
      {data.expenses.length > 0 ? (
        <div>
          <strong className="text-foreground">Expenses · {rupees(data.totalExpenseCents)}</strong>
          {data.expenses.map((e) => <div key={e.id} className="text-muted-foreground">{e.category}: {rupees(e.amountCents)}{e.kms != null ? ` (${e.kms} km)` : ""}</div>)}
        </div>
      ) : null}
      {data.competitorIntel.length > 0 ? (
        <div>
          <strong className="text-foreground">Competitor intel</strong>
          {data.competitorIntel.map((c) => <div key={c.id} className="text-muted-foreground">{c.competitorName}{c.productName ? ` · ${c.productName}` : ""}{c.priceCents != null ? ` · ${rupees(c.priceCents)}` : ""}{c.promo ? ` · ${c.promo}` : ""}</div>)}
        </div>
      ) : null}
      {data.samples.length > 0 ? (
        <div>
          <strong className="text-foreground">Samples</strong>
          {data.samples.map((s) => <div key={s.id} className="text-muted-foreground">{s.itemName} ×{s.quantity}{s.recipientName ? ` → ${s.recipientName}` : ""}</div>)}
        </div>
      ) : null}
    </div>
  );
}

function ProofPhotos({ photos }: { photos: VisitProofPhoto[] }): JSX.Element {
  const [images, setImages] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    void Promise.all(photos.map(async (photo) => {
      if (!photo.contentType.startsWith("image/")) return null;
      const object = await safeFetch(() => apiClient.getUpload(photo.id), null);
      return object ? [photo.id, `data:${object.contentType};base64,${object.dataBase64}`] as const : null;
    })).then((loaded) => {
      if (cancelled) return;
      const entries: Array<[string, string]> = [];
      for (const item of loaded) {
        if (item) entries.push([item[0], item[1]]);
      }
      setImages(Object.fromEntries(entries));
    });
    return () => { cancelled = true; };
  }, [photos]);

  return (
    <div className="min-w-[220px]">
      <strong className="text-foreground">Proof photos</strong>
      <div className="mt-2 flex flex-wrap gap-2">
        {photos.map((photo) => (
          images[photo.id] ? (
            <img
              key={photo.id}
              src={images[photo.id]}
              alt={photo.caption ?? "Visit proof photo"}
              className="h-24 w-24 rounded-md border bg-background object-cover"
            />
          ) : (
            <div key={photo.id} className="flex h-24 w-24 items-center justify-center rounded-md border bg-background text-xs text-muted-foreground">
              Loading
            </div>
          )
        ))}
      </div>
    </div>
  );
}

export default function VisitsPage(): JSX.Element {
  const [visits, setVisits] = useState<VisitSummary[]>([]);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [extras, setExtras] = useState<Record<string, VisitExtras | "loading">>({});

  async function toggleDetails(visitId: string) {
    if (expandedId === visitId) { setExpandedId(null); return; }
    setExpandedId(visitId);
    if (!extras[visitId]) {
      setExtras((m) => ({ ...m, [visitId]: "loading" }));
      const res = await safeFetch(() => apiClient.getVisitExtras(visitId), null);
      setExtras((m) => ({ ...m, [visitId]: res ?? ({ expenses: [], competitorIntel: [], samples: [], proofPhotos: [], totalExpenseCents: 0, feedbackRating: null, npsScore: null, feedbackText: null, signedBy: null, signaturePath: null } as unknown as VisitExtras) }));
    }
  }

  async function load() {
    const [visitList, userList] = await Promise.all([
      safeFetch(() => apiClient.listVisits(), null),
      safeFetch(() => apiClient.listUsers(), null)
    ]);
    if (visitList) { setVisits(visitList.items); setError(null); }
    else setError("We couldn't load visit history. Please try again.");
    if (userList) setUsers(userList.items.filter((u) => u.active));
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  const userName = (id: string) => users.find((u) => u.id === id)?.name ?? id;

  return (
    <main className="shell font-sans">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Visits</h1>
          <p className="mt-1 text-sm text-muted-foreground">Check-in and check-out history across your team.</p>
        </div>
        <Badge variant="secondary" className="shrink-0">{loading ? "Loading…" : `${visits.length} visits`}</Badge>
      </div>

      {error ? (
        <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
      ) : null}

      {loading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Loading visits…</p>
      ) : visits.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <h3 className="text-base font-semibold text-foreground">No visits yet</h3>
            <p className="text-sm text-muted-foreground">Visits appear here once representatives start checking in at outlets.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Visit</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Assigned to</TableHead>
                <TableHead>Check-in</TableHead>
                <TableHead>Check-out</TableHead>
                <TableHead>Geofence</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visits.map((visit) => (
                <Fragment key={visit.id}>
                  <TableRow>
                    <TableCell className="font-mono text-xs">{visit.id.slice(-10)}</TableCell>
                    <TableCell><Badge variant={visitVariant(visit.status)}>{visit.status.replace(/_/g, " ")}</Badge></TableCell>
                    <TableCell>{visit.assignedUserId ? userName(visit.assignedUserId) : <span className="text-muted-foreground">Unassigned</span>}</TableCell>
                    <TableCell className="text-muted-foreground">{visit.checkedInAt ? new Date(visit.checkedInAt).toLocaleString() : "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{visit.checkedOutAt ? new Date(visit.checkedOutAt).toLocaleString() : "—"}</TableCell>
                    <TableCell>{visit.geofenceStatus ? <Badge variant={geofenceVariant(visit.geofenceStatus)}>{visit.geofenceStatus}</Badge> : "—"}</TableCell>
                    <TableCell>{visit.outcome ?? "—"}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-muted-foreground" title={visit.notes ?? undefined}>{visit.notes ?? "—"}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => void toggleDetails(visit.id)}>
                        {expandedId === visit.id ? "Hide" : "View"}
                      </Button>
                    </TableCell>
                  </TableRow>
                  {expandedId === visit.id ? (
                    <TableRow>
                      <TableCell colSpan={9} className="bg-muted/50">
                        {extras[visit.id] === "loading" || !extras[visit.id] ? (
                          <span className="text-sm text-muted-foreground">Loading details…</span>
                        ) : (
                          <VisitExtrasView data={extras[visit.id] as VisitExtras} />
                        )}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </main>
  );
}
