import { useCallback, useEffect, useMemo, useState, type JSX } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator } from "react-native";
import { apiClient } from "../api-service";
import type { RoutePlanDetail, RouteStopDetail } from "@orbit/api-client";
import type { Role } from "@orbit/shared-types";
import { groupRoutesByDate } from "../routes/group-by-date";
import { TrackingBanner } from "../components/TrackingBanner";
import { useTrackingConsent } from "../tracking/use-tracking-consent";
import { useAuth } from "../auth/auth-context";
import { useTheme } from "../theme-context";
import type { Theme } from "../theme";

const KNOWN_ROLES: ReadonlySet<Role> = new Set<Role>([
  "platform_admin",
  "organisation_admin",
  "sales_manager",
  "field_sales_representative",
  "operations_user",
  "readonly_analyst"
]);

function normaliseRole(value: string | undefined): Role {
  return value && KNOWN_ROLES.has(value as Role) ? (value as Role) : "field_sales_representative";
}

interface Props {
  onSelectStop: (planId: string, stop: RouteStopDetail) => void;
  loadConsent: () => Promise<boolean>;
  loadSessionState: () => Promise<import("@orbit/shared-types").WorkSessionState>;
  probeForegroundPermission: () => Promise<import("../tracking/consent-policy").ForegroundPermission>;
  probeBackgroundPermission: () => Promise<import("../tracking/consent-policy").BackgroundPermission>;
  flushNow: () => Promise<void>;
  pendingMutations: number;
}

function stopChipColor(status: string, theme: Theme): { bg: string; fg: string } {
  if (status === "completed") return { bg: theme.color.successSoft, fg: theme.color.success };
  if (status === "in_progress") return { bg: theme.color.primarySoft, fg: theme.color.primary };
  if (status === "exception" || status === "skipped") return { bg: theme.color.warningSoft, fg: theme.color.warning };
  return { bg: theme.color.surfaceMuted, fg: theme.color.textSecondary };
}

export function RouteTodayScreen(props: Props): JSX.Element {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [plans, setPlans] = useState<RoutePlanDetail[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { session } = useAuth();

  // Pull the user's actual role from the persisted session so tracking-consent
  // logic only fires for reps. Previously this was hardcoded to
  // "field_sales_representative" which forced consent prompts even for managers.
  const { decision, refresh: refreshConsent } = useTrackingConsent({
    role: normaliseRole(session?.role),
    loadConsent: props.loadConsent,
    loadSessionState: props.loadSessionState,
    probeForegroundPermission: props.probeForegroundPermission,
    probeBackgroundPermission: props.probeBackgroundPermission
  });

  const reload = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const result = await apiClient.listRoutePlans();
      setPlans(result.items);
    } catch {
      setError("Unable to update right now. Pull down to retry.");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const grouped = groupRoutesByDate(plans ?? []);
  const today = grouped.today[0];
  const isInitialLoad = plans === null;

  return (
    <View style={styles.shell}>
      <TrackingBanner decision={decision} />
      <FlatList
        data={today?.stops ?? []}
        keyExtractor={(stop) => stop.id}
        refreshControl={
          <RefreshControl
            tintColor={theme.color.primary}
            refreshing={refreshing}
            onRefresh={() => {
              void reload();
              void refreshConsent();
              void props.flushNow();
            }}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.heading}>Today&apos;s route</Text>
            {today ? (
              <Text style={styles.subheading}>
                {today.stops.length} stops · {(today.plannedDistanceMeters / 1000).toFixed(1)} km · {today.plannedDurationMinutes} min
              </Text>
            ) : !isInitialLoad ? (
              <Text style={styles.subheading}>No route planned for today.</Text>
            ) : null}
            {props.pendingMutations > 0 ? (
              <View style={styles.pendingPill}>
                <Text style={styles.pendingText}>{props.pendingMutations} change{props.pendingMutations === 1 ? "" : "s"} waiting to sync</Text>
              </View>
            ) : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>
        }
        ListEmptyComponent={
          isInitialLoad ? (
            <View style={styles.emptyLoading}>
              <ActivityIndicator color={theme.color.primary} />
              <Text style={styles.emptyText}>Loading route…</Text>
            </View>
          ) : !today ? null : (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No stops on today&apos;s route</Text>
              <Text style={styles.emptyText}>Once a manager assigns stops they&apos;ll appear here.</Text>
            </View>
          )
        }
        renderItem={({ item, index }) => {
          const chip = stopChipColor(item.status, theme);
          return (
            <TouchableOpacity
              style={styles.stop}
              activeOpacity={0.7}
              onPress={() => today && props.onSelectStop(today.id, item)}
            >
              <Text style={styles.stopOrder}>{index + 1}</Text>
              <View style={styles.stopBody}>
                <Text style={styles.stopName}>{item.outletName}</Text>
                <Text style={styles.stopMeta}>{item.expectedDurationMinutes} min</Text>
              </View>
              <View style={[styles.statusPill, { backgroundColor: chip.bg }]}>
                <Text style={[styles.statusPillText, { color: chip.fg }]}>{item.status.replace(/_/g, " ")}</Text>
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const makeStyles = (theme: Theme) => StyleSheet.create({
  shell: { flex: 1, backgroundColor: theme.color.background },
  header: { padding: theme.spacing.lg, paddingBottom: theme.spacing.md },
  heading: { ...theme.font.title },
  subheading: { ...theme.font.caption, marginTop: theme.spacing.xs },
  pendingPill: {
    marginTop: theme.spacing.md,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: theme.color.warningSoft,
    borderWidth: 1,
    borderColor: "rgba(180, 83, 9, 0.2)"
  },
  pendingText: { fontSize: 12, color: theme.color.warning, fontWeight: "500" },
  error: { color: theme.color.danger, marginTop: theme.spacing.sm, fontSize: 13 },
  stop: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    marginHorizontal: theme.spacing.lg,
    marginVertical: theme.spacing.xs,
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.border
  },
  stopOrder: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: theme.color.primarySoft,
    color: theme.color.primary,
    textAlign: "center",
    textAlignVertical: "center",
    fontWeight: "700",
    marginRight: theme.spacing.md,
    overflow: "hidden"
  },
  stopBody: { flex: 1 },
  stopName: { ...theme.font.bodyStrong },
  stopMeta: { ...theme.font.caption, marginTop: 2 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  statusPillText: { fontSize: 11, fontWeight: "600", textTransform: "capitalize" },
  emptyLoading: { alignItems: "center", padding: theme.spacing.xl, gap: theme.spacing.sm },
  empty: { alignItems: "center", padding: theme.spacing.xl },
  emptyTitle: { ...theme.font.bodyStrong, marginBottom: theme.spacing.xs },
  emptyText: { ...theme.font.caption, textAlign: "center" }
});
