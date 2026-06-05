import { useCallback, useMemo, useState, type JSX } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { apiClient } from "../api-service";
import type { MyAnalytics } from "@orbit/api-client";
import { useTheme } from "../theme-context";
import type { Theme } from "../theme";
import { formatMinorCompact, useOrgCurrency } from "../money";

type Accent = "primary" | "success" | "warning" | "neutral";

/** Rep-facing "My performance" — the signed-in rep's own KPIs + 14-day trend. */
export function MyAnalyticsScreen(): JSX.Element {
  const { theme } = useTheme();
  const currency = useOrgCurrency();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [data, setData] = useState<MyAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const reload = useCallback(async () => {
    setError(null);
    try {
      setData(await apiClient.getMyAnalytics());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load your analytics");
    }
  }, []);

  useFocusEffect(useCallback(() => { void reload(); }, [reload]));

  async function onRefresh() {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  }

  // Inner helpers close over the current theme/styles so they re-theme live.
  const Stat = ({ label, value, sub, accent }: { label: string; value: string; sub: string; accent: Accent }): JSX.Element => {
    const colour = accent === "success" ? theme.color.success
      : accent === "warning" ? theme.color.warning
      : accent === "neutral" ? theme.color.textSecondary
      : theme.color.primary;
    return (
      <View style={styles.stat}>
        <Text style={styles.statLabel}>{label}</Text>
        <Text style={[styles.statValue, { color: colour }]}>{value}</Text>
        <Text style={styles.statSub}>{sub}</Text>
      </View>
    );
  };

  const TrendChart = ({ series }: { series: MyAnalytics["visitsPerDay"] }): JSX.Element => {
    if (series.length === 0) {
      return <View style={styles.chartEmpty}><Text style={styles.statSub}>No visits in this window yet.</Text></View>;
    }
    const max = Math.max(1, ...series.map((d) => d.visits));
    return (
      <View style={styles.chart}>
        {series.map((d) => {
          const totalH = Math.round((d.visits / max) * 72);
          const doneH = Math.round((d.completed / max) * 72);
          const day = d.date.slice(8, 10);
          return (
            <View key={d.date} style={styles.chartCol}>
              <View style={styles.chartBarTrack}>
                <View style={[styles.chartBarTotal, { height: Math.max(totalH, d.visits > 0 ? 4 : 0) }]} />
                <View style={[styles.chartBarDone, { height: Math.max(doneH, d.completed > 0 ? 4 : 0) }]} />
              </View>
              <Text style={styles.chartLabel}>{day}</Text>
            </View>
          );
        })}
      </View>
    );
  };

  if (!data && !error) {
    return <View style={styles.center}><ActivityIndicator color={theme.color.primary} /></View>;
  }

  return (
    <ScrollView
      style={styles.shell}
      contentContainerStyle={{ padding: theme.spacing.lg }}
      refreshControl={<RefreshControl tintColor={theme.color.primary} refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {data ? (
        <>
          {data.rank ? (
            <View style={styles.rankCard}>
              <Text style={styles.rankLabel}>YOUR RANK (30-DAY COMPLETED VISITS)</Text>
              <Text style={styles.rankValue}>#{data.rank.position} <Text style={styles.rankOf}>of {data.rank.totalReps}</Text></Text>
            </View>
          ) : null}

          <Text style={styles.section}>Today</Text>
          <View style={styles.grid}>
            <Stat label="Visits" value={`${data.today.completed}/${data.today.visits}`} sub="completed / assigned" accent={data.today.visits > 0 && data.today.completed === data.today.visits ? "success" : "primary"} />
            <Stat label="Off-target" value={`${data.today.offTarget}`} sub="check-ins away from the outlet" accent={data.today.offTarget > 0 ? "warning" : "success"} />
          </View>

          <Text style={styles.section}>This week (7 days)</Text>
          <View style={styles.grid}>
            <Stat label="Completion rate" value={`${data.last7.completionRate}%`} sub={`${data.last7.completed} of ${data.last7.visits} visits`} accent={data.last7.completionRate >= 80 ? "success" : data.last7.completionRate >= 50 ? "primary" : "warning"} />
            <Stat label="Active days" value={`${data.last7.activeDays}`} sub="days with a check-in" accent="primary" />
          </View>

          <Text style={styles.section}>Last 30 days</Text>
          <View style={styles.grid}>
            <Stat label="Visits completed" value={`${data.last30.completed}`} sub={`${data.last30.visits} total`} accent="primary" />
            <Stat label="Off-target" value={`${data.last30.offTarget}`} sub="exceptions" accent={data.last30.offTarget > 0 ? "warning" : "success"} />
            <Stat label="Orders" value={`${data.last30.ordersCount}`} sub={formatMinorCompact(data.last30.orderValueCents, currency)} accent="primary" />
            <Stat label="Collected" value={formatMinorCompact(data.last30.collectedCents, currency)} sub="payments taken" accent="success" />
          </View>

          <Text style={styles.section}>Visit details (30 days)</Text>
          <View style={styles.grid}>
            <Stat label="Avg rating" value={data.quality.ratedVisits > 0 ? `${data.quality.avgRating.toFixed(1)}★` : "—"} sub={`${data.quality.ratedVisits} rated`} accent={data.quality.avgRating >= 4 ? "success" : "primary"} />
            <Stat label="Expenses" value={formatMinorCompact(data.quality.expensesCents, currency)} sub="logged on visits" accent="neutral" />
            <Stat label="Samples given" value={`${data.quality.samples}`} sub="units handed out" accent="primary" />
            <Stat label="Competitor notes" value={`${data.quality.competitorNotes}`} sub="intel captured" accent="primary" />
          </View>

          <Text style={styles.section}>Leads</Text>
          <View style={styles.grid}>
            <Stat label="Open" value={`${data.leads.open}`} sub="assigned to you" accent={data.leads.open > 0 ? "warning" : "neutral"} />
            <Stat label="Won" value={`${data.leads.won}`} sub="converted" accent="success" />
          </View>

          <Text style={styles.section}>Visits — last 14 days</Text>
          <TrendChart series={data.visitsPerDay} />
          <View style={{ height: 40 }} />
        </>
      ) : null}
    </ScrollView>
  );
}

const makeStyles = (theme: Theme) => StyleSheet.create({
  shell: { flex: 1, backgroundColor: theme.color.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.color.background },
  error: { color: theme.color.danger, marginBottom: theme.spacing.md, fontSize: 13 },
  rankCard: {
    backgroundColor: theme.color.primary, borderRadius: theme.radius.lg,
    padding: theme.spacing.lg, marginBottom: theme.spacing.lg, ...theme.elevation.glow
  },
  rankLabel: { color: "rgba(255,255,255,0.85)", fontSize: 10, fontWeight: "700", letterSpacing: 1 },
  rankValue: { color: theme.color.textOnPrimary, fontSize: 34, fontWeight: "800", marginTop: 4 },
  rankOf: { fontSize: 16, fontWeight: "600", color: "rgba(255,255,255,0.85)" },
  section: { ...theme.font.label, textTransform: "uppercase", marginTop: theme.spacing.md, marginBottom: theme.spacing.sm },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm },
  stat: {
    flexBasis: "47%", flexGrow: 1,
    backgroundColor: theme.color.surface, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.color.border,
    padding: theme.spacing.md, ...theme.elevation.sm
  },
  statLabel: { ...theme.font.label, textTransform: "uppercase" },
  statValue: { fontSize: 26, fontWeight: "700", marginTop: 4 },
  statSub: { ...theme.font.caption, marginTop: 2 },
  chart: {
    flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between",
    backgroundColor: theme.color.surface, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.color.border,
    padding: theme.spacing.md, height: 120, ...theme.elevation.sm
  },
  chartEmpty: { backgroundColor: theme.color.surface, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.color.border, padding: theme.spacing.md },
  chartCol: { flex: 1, alignItems: "center", justifyContent: "flex-end" },
  chartBarTrack: { width: 10, height: 76, justifyContent: "flex-end" },
  chartBarTotal: { width: 10, backgroundColor: theme.color.primarySoft, borderRadius: 3, position: "absolute", bottom: 0 },
  chartBarDone: { width: 10, backgroundColor: theme.color.primary, borderRadius: 3 },
  chartLabel: { ...theme.font.caption, fontSize: 9, marginTop: 4 }
});
