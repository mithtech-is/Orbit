"use client";

import type { JSX } from "react";

import { Fragment, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Download } from "lucide-react";
import { apiClient, safeFetch } from "../api-service";
import type { VisitSummary, UserSummary, VisitExtras, VisitProofPhoto } from "@orbit/api-client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function rupees(cents: number): string {
  return `₹${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

/** Map an image content type to a sensible download file extension. */
function fileExt(contentType: string): string {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("heic")) return "heic";
  if (contentType.includes("gif")) return "gif";
  return "jpg";
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
      <div className="mt-2 flex flex-wrap gap-3">
        {photos.map((photo) => (
          <div key={photo.id} className="flex flex-col items-center gap-1">
            {images[photo.id] ? (
              <>
                {/* Click the image to open it full-size in a new tab. */}
                <a href={images[photo.id]} target="_blank" rel="noreferrer" title={photo.caption ?? "Open full size"}>
                  <img
                    src={images[photo.id]}
                    alt={photo.caption ?? "Visit proof photo"}
                    className="h-24 w-24 rounded-md border bg-background object-cover transition-opacity hover:opacity-90"
                  />
                </a>
                <a
                  href={images[photo.id]}
                  download={`visit-photo-${photo.id}.${fileExt(photo.contentType)}`}
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <Download className="h-3 w-3" /> Download
                </a>
              </>
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded-md border bg-background text-xs text-muted-foreground">
                Loading
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

interface RepGroup {
  key: string;
  name: string;
  visits: VisitSummary[];
  completed: number;
}

export default function VisitsPage(): JSX.Element {
  const [visits, setVisits] = useState<VisitSummary[]>([]);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedRep, setExpandedRep] = useState<string | null>(null);
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

  // Group visits by the rep they're assigned to, so the page stays compact when
  // there are many reps: one row per rep, click to reveal that rep's visits.
  const groups = useMemo<RepGroup[]>(() => {
    const byRep = new Map<string, VisitSummary[]>();
    for (const v of visits) {
      const key = v.assignedUserId || "__unassigned__";
      const arr = byRep.get(key);
      if (arr) arr.push(v); else byRep.set(key, [v]);
    }
    const result: RepGroup[] = [];
    for (const [key, list] of byRep) {
      result.push({
        key,
        name: key === "__unassigned__" ? "Unassigned" : userName(key),
        visits: list,
        completed: list.filter((v) => v.status === "completed").length
      });
    }
    // Named reps first (alphabetical), Unassigned last.
    result.sort((a, b) => {
      if (a.key === "__unassigned__") return 1;
      if (b.key === "__unassigned__") return -1;
      return a.name.localeCompare(b.name);
    });
    return result;
  }, [visits, users]);

  function toggleRep(key: string) {
    setExpandedRep((cur) => (cur === key ? null : key));
  }

  return (
    <main className="shell font-sans">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Visits</h1>
          <p className="mt-1 text-sm text-muted-foreground">Check-in and check-out history, grouped by representative.</p>
        </div>
        <Badge variant="secondary" className="shrink-0">{loading ? "Loading…" : `${groups.length} reps · ${visits.length} visits`}</Badge>
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
        <div className="flex flex-col gap-3">
          {groups.map((group) => {
            const open = expandedRep === group.key;
            return (
              <Card key={group.key} className="overflow-hidden">
                {/* Rep header — click to expand that rep's visits. */}
                <button
                  type="button"
                  onClick={() => toggleRep(group.key)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
                  aria-expanded={open}
                >
                  {open ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                  <span className="font-semibold text-foreground">{group.name}</span>
                  <span className="flex-1" />
                  <Badge variant="secondary" className="shrink-0">{group.visits.length} visit{group.visits.length === 1 ? "" : "s"}</Badge>
                  <Badge variant="success" className="shrink-0">{group.completed} completed</Badge>
                </button>

                {open ? (
                  <div className="border-t border-border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Visit</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Check-in</TableHead>
                          <TableHead>Check-out</TableHead>
                          <TableHead>Geofence</TableHead>
                          <TableHead>Outcome</TableHead>
                          <TableHead>Notes</TableHead>
                          <TableHead>Details</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {group.visits.map((visit) => (
                          <Fragment key={visit.id}>
                            <TableRow>
                              <TableCell className="font-mono text-xs">{visit.id.slice(-10)}</TableCell>
                              <TableCell><Badge variant={visitVariant(visit.status)}>{visit.status.replace(/_/g, " ")}</Badge></TableCell>
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
                                <TableCell colSpan={8} className="bg-muted/50">
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
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </main>
  );
}
