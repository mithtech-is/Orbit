"use client";

import type { JSX } from "react";

import { useEffect, useState } from "react";
import { apiClient, safeFetch } from "../api-service";
import type { OrganisationSettings } from "@orbit/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

const ALL_DAYS = [
  { value: "mon", label: "Mon" },
  { value: "tue", label: "Tue" },
  { value: "wed", label: "Wed" },
  { value: "thu", label: "Thu" },
  { value: "fri", label: "Fri" },
  { value: "sat", label: "Sat" },
  { value: "sun", label: "Sun" }
];

const COMMON_TIMEZONES = [
  "UTC", "Asia/Kolkata", "Asia/Singapore", "Asia/Dubai", "Europe/London",
  "Europe/Berlin", "America/New_York", "America/Los_Angeles", "Australia/Sydney"
];

export default function OrganisationSettingsPage(): JSX.Element {
  const [, setData] = useState<OrganisationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Editable form state
  const [geofence, setGeofence] = useState("100");
  const [retention, setRetention] = useState("90");
  const [hoursStart, setHoursStart] = useState("09:00");
  const [hoursEnd, setHoursEnd] = useState("18:00");
  const [timezone, setTimezone] = useState("UTC");
  const [currency, setCurrency] = useState("INR");
  const [days, setDays] = useState<string[]>(["mon", "tue", "wed", "thu", "fri"]);
  // Fuel — UI in the user's currency (₹), stored as cents.
  const [defaultRate, setDefaultRate] = useState("0");
  const [dailyLimit, setDailyLimit] = useState("0");

  useEffect(() => {
    void (async () => {
      const result = await safeFetch(() => apiClient.getOrganisationSettings(), null);
      if (result) {
        setData(result);
        setGeofence(String(result.geofenceRadiusMeters));
        setRetention(String(result.rawLocationRetentionDays));
        setHoursStart(result.workingHoursStart);
        setHoursEnd(result.workingHoursEnd);
        setTimezone(result.timezone);
        setCurrency(result.currency);
        setDays(result.workingDays);
        setDefaultRate((result.mileageRatePerKmCents / 100).toFixed(2));
        setDailyLimit((result.dailyFuelLimitCents / 100).toFixed(0));
      } else {
        setError("Couldn't load organisation settings.");
      }
      setLoading(false);
    })();
  }, []);

  function toggleDay(day: string) {
    setDays((prev) => prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (days.length === 0) { setError("Pick at least one working day."); return; }
    setSaving(true);
    try {
      const result = await apiClient.updateOrganisationSettings({
        geofenceRadiusMeters: Number(geofence),
        rawLocationRetentionDays: Number(retention),
        workingHoursStart: hoursStart,
        workingHoursEnd: hoursEnd,
        timezone: timezone.trim(),
        currency: currency.trim().toUpperCase(),
        workingDays: days,
        mileageRatePerKmCents: Math.round(Number(defaultRate) * 100),
        dailyFuelLimitCents: Math.round(Number(dailyLimit) * 100)
      });
      setData(result);
      setSuccess("Settings saved.");
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="shell font-sans">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Organisation settings</h1>
          <Badge variant="secondary">Loading…</Badge>
        </div>
      </main>
    );
  }

  return (
    <main className="shell font-sans">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Organisation settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Tenant-wide defaults for working hours, location accuracy and retention.</p>
      </div>

      {error ? <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div> : null}
      {success ? <div className="mb-4 rounded-md border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">{success}</div> : null}

      <form onSubmit={handleSave} className="max-w-3xl">
        <Card className="mb-4">
          <CardHeader className="pb-3"><CardTitle className="text-base">Working schedule</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="os-start">Working hours start</Label>
                <Input id="os-start" type="time" value={hoursStart} onChange={(e) => setHoursStart(e.target.value)} required />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="os-end">Working hours end</Label>
                <Input id="os-end" type="time" value={hoursEnd} onChange={(e) => setHoursEnd(e.target.value)} required />
              </div>
            </div>
            <div className="mt-4">
              <div className="mb-1.5 text-sm font-medium text-foreground">Working days</div>
              <div className="flex flex-wrap gap-2">
                {ALL_DAYS.map((d) => (
                  <Button type="button" key={d.value} size="sm" variant={days.includes(d.value) ? "default" : "outline"} onClick={() => toggleDay(d.value)}>{d.label}</Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="mb-4">
          <CardHeader className="pb-3"><CardTitle className="text-base">Location accuracy</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="os-geo">Geofence radius (metres)</Label>
                <Input id="os-geo" type="number" min="10" max="5000" value={geofence} onChange={(e) => setGeofence(e.target.value)} required />
                <small className="text-muted-foreground">Distance within which a check-in counts as &quot;at the outlet&quot; (10–5000 m).</small>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="os-ret">Raw location retention (days)</Label>
                <Input id="os-ret" type="number" min="7" max="730" value={retention} onChange={(e) => setRetention(e.target.value)} required />
                <small className="text-muted-foreground">Individual GPS pings are deleted after this many days (7–730).</small>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="mb-4">
          <CardHeader className="pb-3"><CardTitle className="text-base">Locale</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="os-tz">Timezone (IANA)</Label>
                <Input id="os-tz" type="text" list="tz-options" value={timezone} onChange={(e) => setTimezone(e.target.value)} required placeholder="e.g. Asia/Kolkata" />
                <datalist id="tz-options">{COMMON_TIMEZONES.map((tz) => <option key={tz} value={tz} />)}</datalist>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="os-cur">Currency (ISO 4217)</Label>
                <Input id="os-cur" type="text" maxLength={3} value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} required placeholder="INR" className="uppercase" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="mb-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Fuel & expenses</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-xs text-muted-foreground">
              Reps never enter fuel amounts directly. The amount is computed at
              session-stop from <strong>actual GPS distance × rate</strong>. Effective
              rate cascade: rep override → vehicle-type rate → this org default.
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="os-rate">Org default fuel rate ({currency} / km)</Label>
                <Input
                  id="os-rate"
                  type="number"
                  step="0.01"
                  min={0}
                  value={defaultRate}
                  onChange={(e) => setDefaultRate(e.target.value)}
                  placeholder="e.g. 3.50"
                />
                <span className="text-xs text-muted-foreground">Used only when neither the rep nor their vehicle defines a rate.</span>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="os-limit">Daily fuel limit ({currency}, 0 = no cap)</Label>
                <Input
                  id="os-limit"
                  type="number"
                  step="1"
                  min={0}
                  value={dailyLimit}
                  onChange={(e) => setDailyLimit(e.target.value)}
                  placeholder="e.g. 500"
                />
                <span className="text-xs text-muted-foreground">Expenses over this still record, but flag for approval and require a reason.</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save settings"}</Button>
          <span className="text-xs text-muted-foreground">Changes take effect immediately for new check-ins / pings.</span>
        </div>
      </form>
    </main>
  );
}
