"use client";

import type { JSX } from "react";

import { useEffect, useState } from "react";
import { apiClient, safeFetch } from "./api-service";
import type { ReportSummary } from "@orbit/api-client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CheckCircle2, AlertTriangle, Users, Store, UserPlus, ClipboardList, Route, ShoppingCart, type LucideIcon } from "lucide-react";

function formatCurrency(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

type MetricAccent = "primary" | "success" | "warning" | "neutral";

const METRIC_ACCENT: Record<MetricAccent, { text: string; bg: string }> = {
  primary: { text: "text-primary", bg: "bg-primary/10" },
  success: { text: "text-success", bg: "bg-success/10" },
  warning: { text: "text-warning", bg: "bg-warning/10" },
  neutral: { text: "text-muted-foreground", bg: "bg-muted" }
};

function Metric({
  label,
  value,
  hint,
  icon: Icon,
  accent = "neutral"
}: {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  accent?: MetricAccent;
}): JSX.Element {
  const a = METRIC_ACCENT[accent];
  return (
    <Card className="transition-shadow duration-200 hover:shadow-[var(--sc-shadow-md)]">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
          <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", a.bg)} aria-hidden>
            <Icon className={cn("h-[18px] w-[18px]", a.text)} strokeWidth={2} />
          </span>
        </div>
        <div className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-foreground">{value}</div>
        {hint ? <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div> : null}
      </CardContent>
    </Card>
  );
}

export default function OverviewPage(): JSX.Element {
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [currency, setCurrency] = useState("INR");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const session = await safeFetch(() => apiClient.getSession(), null);
      if (!session) {
        setError("We couldn't load this page. Please try again.");
        setLoading(false);
        return;
      }
      const [result, settings] = await Promise.all([
        safeFetch(() => apiClient.getReportSummary(), null),
        safeFetch(() => apiClient.getOrganisationSettings(), null)
      ]);
      if (result) setSummary(result);
      else setError("Unable to load workspace metrics right now.");
      if (settings) setCurrency(settings.currency);
      setLoading(false);
    })();
  }, []);

  return (
    <main className="shell font-sans">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Today&apos;s field activity</h1>
          <p className="mt-1 text-sm text-muted-foreground">A snapshot of your team&apos;s operations.</p>
        </div>
        <Badge variant={loading ? "secondary" : "success"} className="shrink-0">{loading ? "Loading…" : "Live"}</Badge>
      </div>

      {error ? <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div> : null}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <Metric label="Visits today" value={summary ? `${summary.visitsCompletedToday}/${summary.visitsPlannedToday}` : "—"} hint="Completed / planned" icon={CheckCircle2} accent="success" />
        <Metric label="Off-target (7d)" value={String(summary?.offTarget7d ?? "—")} hint="Geofence exceptions" icon={AlertTriangle} accent="warning" />
        <Metric label="Active reps" value={String(summary?.activeSessionCount ?? "—")} hint="Currently on shift" icon={Users} accent="primary" />
        <Metric label="Outlets" value={String(summary?.outletCount ?? "—")} hint="In your network" icon={Store} accent="neutral" />
        <Metric label="Open leads" value={String(summary?.leadCount ?? "—")} icon={UserPlus} accent="primary" />
        <Metric label="Visits logged" value={String(summary?.visitCount ?? "—")} icon={ClipboardList} accent="neutral" />
        <Metric label="Routes planned" value={String(summary?.routePlanCount ?? "—")} icon={Route} accent="neutral" />
        <Metric label="Orders" value={String(summary?.orderCount ?? "—")} hint={summary ? formatCurrency(summary.totalOrderCents, currency) : "Order value"} icon={ShoppingCart} accent="success" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="p-5">
            <h3 className="mb-1.5 text-sm font-semibold text-foreground">Live team map</h3>
            <p className="text-sm text-muted-foreground">See live representative locations on the dedicated Live team map page.</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <h3 className="mb-1.5 text-sm font-semibold text-foreground">Operational queue</h3>
            <p className="text-sm text-muted-foreground">Geofence exceptions, sync issues, and route changes will appear here as they happen.</p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
