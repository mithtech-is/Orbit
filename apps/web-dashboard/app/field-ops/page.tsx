"use client";

import type { JSX } from "react";

import { useEffect, useState } from "react";
import { apiClient, safeFetch } from "../api-service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface ReorderRow { outletId: string; name: string; orderCount: number; lastOrderAt: string | null; dueScore: number }
interface AttendanceRow { userId: string; status: string; checkedInAt: string | null; checkedOutAt: string | null }
interface MileageRow { userId: string; distanceKm: number; expenseCents: number }

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function FieldOpsPage(): JSX.Element {
  const [reorder, setReorder] = useState<ReorderRow[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [mileage, setMileage] = useState<MileageRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const [r, a, m] = await Promise.all([
        safeFetch(() => apiClient.getReorderReport(), null),
        safeFetch(() => apiClient.listAttendance(today()), null),
        safeFetch(() => apiClient.getMileageReport(today(), 50), null)
      ]);
      if (r) setReorder(r.items.slice(0, 50));
      if (a) setAttendance(a.items);
      if (m) setMileage(m.items);
      setLoading(false);
    })();
  }, []);

  return (
    <main className="shell font-sans">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Field ops</h1>
          <p className="mt-1 text-sm text-muted-foreground">Reorder signals, attendance and mileage — derived from your live field data.</p>
        </div>
        <Badge variant="secondary" className="shrink-0">{loading ? "Loading…" : "Today"}</Badge>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Outlets due for reorder</CardTitle></CardHeader>
          <CardContent className="pt-0">
            {reorder.length === 0 ? (
              <p className="text-sm text-muted-foreground">No reorder signals yet (needs a few orders of history per outlet).</p>
            ) : (
              <Table>
                <TableHeader><TableRow><TableHead>Outlet</TableHead><TableHead>Orders</TableHead><TableHead>Last order</TableHead><TableHead>Due score</TableHead></TableRow></TableHeader>
                <TableBody>
                  {reorder.map((o) => (
                    <TableRow key={o.outletId}>
                      <TableCell className="font-medium text-foreground">{o.name}</TableCell>
                      <TableCell className="tabular-nums">{o.orderCount}</TableCell>
                      <TableCell className="text-muted-foreground">{o.lastOrderAt ? new Date(o.lastOrderAt).toLocaleDateString() : "—"}</TableCell>
                      <TableCell>{o.dueScore >= 1 ? <Badge variant="warning">{o.dueScore.toFixed(2)}×</Badge> : <span className="tabular-nums text-muted-foreground">{o.dueScore.toFixed(2)}×</span>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Attendance — today</CardTitle></CardHeader>
          <CardContent className="pt-0">
            {attendance.length === 0 ? (
              <p className="text-sm text-muted-foreground">No attendance recorded today.</p>
            ) : (
              <Table>
                <TableHeader><TableRow><TableHead>Representative</TableHead><TableHead>Status</TableHead><TableHead>In</TableHead><TableHead>Out</TableHead></TableRow></TableHeader>
                <TableBody>
                  {attendance.map((a) => (
                    <TableRow key={a.userId}>
                      <TableCell className="font-medium text-foreground">{a.userId}</TableCell>
                      <TableCell><Badge variant="success">{a.status}</Badge></TableCell>
                      <TableCell className="text-muted-foreground">{a.checkedInAt ? new Date(a.checkedInAt).toLocaleTimeString() : "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{a.checkedOutAt ? new Date(a.checkedOutAt).toLocaleTimeString() : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Mileage — today (est. @ ₹0.50/km)</CardTitle></CardHeader>
          <CardContent className="pt-0">
            {mileage.length === 0 ? (
              <p className="text-sm text-muted-foreground">No tracked distance today.</p>
            ) : (
              <Table>
                <TableHeader><TableRow><TableHead>Representative</TableHead><TableHead>Distance</TableHead><TableHead>Est. expense</TableHead></TableRow></TableHeader>
                <TableBody>
                  {mileage.map((m) => (
                    <TableRow key={m.userId}>
                      <TableCell className="font-medium text-foreground">{m.userId}</TableCell>
                      <TableCell className="tabular-nums">{m.distanceKm} km</TableCell>
                      <TableCell className="tabular-nums">₹{(m.expenseCents / 100).toFixed(2)}</TableCell>
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
