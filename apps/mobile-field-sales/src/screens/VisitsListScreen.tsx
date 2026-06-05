import { useCallback, useMemo, useState, type JSX } from "react";
import { View, Text, FlatList, RefreshControl, StyleSheet, ActivityIndicator, TouchableOpacity, Alert } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { apiClient } from "../api-service";
import type { VisitSummary, OutletSummary, RouteStopDetail } from "@orbit/api-client";
import type { OfflineSync } from "../sync/offline-queue";
import { useTheme } from "../theme-context";
import type { Theme } from "../theme";
import { EmptyState } from "../components/EmptyState";

interface Props {
  sync: OfflineSync;
  flushNow: () => Promise<void>;
  /** Reopen an in-progress visit so the rep can finish it. */
  onResume: (stop: RouteStopDetail, visitId: string) => void;
}

function chipStyle(status: string, theme: Theme) {
  if (status === "completed") return { bg: theme.color.successSoft, fg: theme.color.success };
  if (status === "in_progress") return { bg: theme.color.primarySoft, fg: theme.color.primary };
  if (status === "exception") return { bg: theme.color.warningSoft, fg: theme.color.warning };
  return { bg: theme.color.surfaceMuted, fg: theme.color.textSecondary };
}

const isToday = (iso?: string | null) => {
  if (!iso) return false;
  const d = new Date(iso);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
};

export function VisitsListScreen({ sync, flushNow, onResume }: Props): JSX.Element {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [visits, setVisits] = useState<VisitSummary[] | null>(null);
  const [outlets, setOutlets] = useState<OutletSummary[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [v, o] = await Promise.all([
        apiClient.listVisits(),
        apiClient.listOutlets().catch(() => null)
      ]);
      setVisits(v.items);
      if (o) setOutlets(o.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load visits");
      setVisits([]);
    }
  }, []);

  // Reload every time the tab is focused so a fresh check-in/out shows up.
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const outlet = (id: string) => outlets.find((o) => o.id === id);
  const outletName = (id: string) => outlet(id)?.name ?? `Outlet ${id.slice(-6)}`;

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  function resume(v: VisitSummary) {
    const o = outlet(v.outletId);
    const stop: RouteStopDetail = {
      id: `resume_${v.id}`,
      outletId: v.outletId,
      outletName: outletName(v.outletId),
      outletLatitude: o?.latitude ?? 0,
      outletLongitude: o?.longitude ?? 0,
      stopOrder: 1,
      status: "pending",
      expectedDurationMinutes: 15
    };
    onResume(stop, v.id);
  }

  function discard(v: VisitSummary) {
    Alert.alert(
      "Discard this visit?",
      `This open check-in at ${outletName(v.outletId)} will be marked as not completed and cleared from your open visits.`,
      [
        { text: "Keep", style: "cancel" },
        {
          text: "Discard",
          style: "destructive",
          onPress: async () => {
            sync.enqueueMutation({ idempotencyKey: `cancel_${v.id}`, type: "visit.cancel", payload: { visitId: v.id } });
            await flushNow().catch(() => undefined);
            await load();
          }
        }
      ]
    );
  }

  if (visits === null) {
    return <View style={styles.center}><ActivityIndicator color={theme.color.primary} /></View>;
  }

  const todays = visits.filter((v) => isToday(v.checkedInAt));
  const completedToday = todays.filter((v) => v.status === "completed").length;
  const openCount = visits.filter((v) => v.status === "in_progress").length;

  return (
    <FlatList
      style={styles.shell}
      data={visits}
      keyExtractor={(v) => v.id}
      refreshControl={<RefreshControl tintColor={theme.color.primary} refreshing={refreshing} onRefresh={onRefresh} />}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.title}>Visits</Text>
          <Text style={styles.subtitle}>Your check-in and check-out history.</Text>
          <View style={styles.summary}>
            <SummaryStat label="Today" value={`${todays.length}`} styles={styles} />
            <SummaryStat label="Completed" value={`${completedToday}`} styles={styles} />
            <SummaryStat label="Open" value={`${openCount}`} accent={openCount > 0 ? theme.color.warning : undefined} styles={styles} />
          </View>
          {openCount > 0 ? (
            <Text style={styles.openHint}>
              You have {openCount} open visit{openCount === 1 ? "" : "s"}. Finish or discard {openCount === 1 ? "it" : "them"} to keep your count accurate and unblock new check-ins.
            </Text>
          ) : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      }
      ListEmptyComponent={
        <EmptyState icon="📍" title="No visits yet" message="Once you check in at an outlet, it'll appear here." />
      }
      renderItem={({ item }) => {
        const c = chipStyle(item.status, theme);
        const open = item.status === "in_progress";
        return (
          <View style={[styles.row, open ? styles.rowOpen : null]}>
            <View style={styles.rowTop}>
              <View style={styles.rowIcon}>
                <Ionicons name="location" size={16} color={theme.color.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle} numberOfLines={1}>{outletName(item.outletId)}</Text>
                <Text style={styles.rowMeta}>
                  {item.checkedInAt ? new Date(item.checkedInAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—"}
                </Text>
                {item.outcome ? <Text style={styles.rowMeta} numberOfLines={1}>Outcome: {item.outcome}</Text> : null}
              </View>
              <View style={[styles.pill, { backgroundColor: c.bg }]}>
                <Text style={[styles.pillText, { color: c.fg }]}>{item.status.replace(/_/g, " ")}</Text>
              </View>
            </View>
            {open ? (
              <View style={styles.actions}>
                <TouchableOpacity style={[styles.actionBtn, styles.actionPrimary]} onPress={() => resume(item)} activeOpacity={0.85}>
                  <Ionicons name="play" size={15} color={theme.color.textOnPrimary} />
                  <Text style={[styles.actionText, styles.actionTextPrimary]}>Finish visit</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionBtn} onPress={() => discard(item)} activeOpacity={0.85}>
                  <Ionicons name="trash-outline" size={15} color={theme.color.danger} />
                  <Text style={[styles.actionText, { color: theme.color.danger }]}>Discard</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        );
      }}
    />
  );
}

function SummaryStat({ label, value, accent, styles }: { label: string; value: string; accent?: string; styles: ReturnType<typeof makeStyles> }): JSX.Element {
  return (
    <View style={styles.summaryCell}>
      <Text style={[styles.summaryValue, accent ? { color: accent } : null]}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

const makeStyles = (theme: Theme) => StyleSheet.create({
  shell: { flex: 1, backgroundColor: theme.color.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.color.background },
  header: { padding: theme.spacing.lg, paddingBottom: theme.spacing.md },
  title: { ...theme.font.title },
  subtitle: { ...theme.font.caption, marginTop: theme.spacing.xs },
  summary: {
    flexDirection: "row", marginTop: theme.spacing.md,
    backgroundColor: theme.color.surface, borderRadius: theme.radius.lg,
    borderWidth: 1, borderColor: theme.color.border, ...theme.elevation.sm
  },
  summaryCell: { flex: 1, alignItems: "center", paddingVertical: theme.spacing.md },
  summaryValue: { fontSize: 22, fontWeight: "700", color: theme.color.primary },
  summaryLabel: { ...theme.font.caption, marginTop: 2 },
  openHint: { ...theme.font.caption, color: theme.color.warning, marginTop: theme.spacing.sm },
  error: { color: theme.color.danger, marginTop: theme.spacing.sm, fontSize: 13 },
  row: {
    paddingVertical: theme.spacing.md, paddingHorizontal: theme.spacing.md,
    marginHorizontal: theme.spacing.lg, marginBottom: theme.spacing.sm,
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.color.border, ...theme.elevation.sm
  },
  rowOpen: { borderColor: theme.color.primary },
  rowTop: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md },
  rowIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: theme.color.primarySoft, alignItems: "center", justifyContent: "center" },
  rowTitle: { ...theme.font.bodyStrong },
  rowMeta: { ...theme.font.caption, marginTop: 2 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: theme.radius.pill },
  pillText: { fontSize: 11, fontWeight: "700", textTransform: "capitalize" },
  actions: { flexDirection: "row", gap: theme.spacing.sm, marginTop: theme.spacing.md },
  actionBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    paddingVertical: 10, borderRadius: theme.radius.sm, borderWidth: 1, borderColor: theme.color.border,
    backgroundColor: theme.color.surface
  },
  actionPrimary: { backgroundColor: theme.color.primary, borderColor: theme.color.primary },
  actionText: { fontSize: 13, fontWeight: "700", color: theme.color.textPrimary },
  actionTextPrimary: { color: theme.color.textOnPrimary }
});
