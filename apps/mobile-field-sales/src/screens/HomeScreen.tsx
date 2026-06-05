import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
  ActivityIndicator, Alert
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { apiClient } from "../api-service";
import type { MyDayResponse, RouteStopDetail } from "@orbit/api-client";
import { useAuth } from "../auth/auth-context";
import { useTheme } from "../theme-context";
import type { Theme } from "../theme";
import { AccountMenu } from "../components/AccountMenu";
import { probeForegroundLocationPermission, requestForegroundLocationPermission, getCurrentPosition } from "../tracking/location-probes";

/** Two-letter initials for the avatar circle (e.g. "Rohan Iyer" → "RI"). */
function initialsOf(name: string | undefined, email: string | undefined): string {
  const src = (name && name.trim()) || (email && email.split("@")[0]) || "";
  const parts = src.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Match the API_BASE_URL resolution in api-service.ts. EXPO_PUBLIC_* vars are
// the only ones Metro inlines at bundle time; falling back to MOBILE_WS_URL
// (set in shell .env files) and finally localhost for simulator development.
const WS_BASE_URL =
  process.env.EXPO_PUBLIC_MOBILE_WS_URL ??
  process.env.MOBILE_WS_URL ??
  "ws://localhost:9000";

type Accent = "primary" | "success" | "warning" | "neutral";

interface Props {
  pendingMutations: number;
  flushNow: () => Promise<void>;
  onOpenStop: (planId: string, stop: RouteStopDetail) => void;
  onOpenOutletPicker: (mode: "check_in" | "create_order" | "collect_payment") => void;
  onOpenAnalytics?: () => void;
  onSignOut?: () => void | Promise<void>;
  onOpenSettings?: () => void;
}

interface SessionState {
  loading: boolean;
  active: boolean;
  startedAt?: string;
}

export function HomeScreen({
  pendingMutations, flushNow, onOpenStop, onOpenOutletPicker,
  onOpenAnalytics, onSignOut, onOpenSettings
}: Props): JSX.Element {
  const { session } = useAuth();
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const [today, setToday] = useState<MyDayResponse | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionState, setSessionState] = useState<SessionState>({ loading: true, active: false });
  const [sessionBusy, setSessionBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const [me, sessions] = await Promise.all([
        apiClient.getMyToday(),
        apiClient.listSessions().catch(() => null)
      ]);
      setToday(me);
      if (sessions) {
        const mine = sessions.items.find((s) => s.userId === session?.userId && s.status === "active");
        setSessionState({ loading: false, active: Boolean(mine), startedAt: mine?.startedAt });
      } else {
        setSessionState({ loading: false, active: false });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load today");
    }
  }, [session?.userId]);

  // Initial + every time the tab is focused.
  useFocusEffect(useCallback(() => {
    void reload();
    // Lightweight 60-second auto-refresh while this tab is mounted.
    const t = setInterval(() => { void reload(); }, 60_000);
    return () => clearInterval(t);
  }, [reload]));

  // Trigger a fresh fetch the first time we mount too.
  useEffect(() => { void reload(); }, [reload]);

  // Keep a ref to the latest reload so the WS effect (which connects once)
  // can call the current closure without forcing a reconnect on every render.
  const reloadRef = useRef(reload);
  useEffect(() => { reloadRef.current = reload; });

  // Subscribe to realtime route-plan events so the home screen refreshes
  // instantly when a manager assigns/changes this rep's plan.
  useEffect(() => {
    const token = session?.token;
    if (!token) return;
    let socket: WebSocket | null = null;
    try {
      socket = new WebSocket(`${WS_BASE_URL}/ws/tracking?token=${encodeURIComponent(token)}`);
    } catch {
      return;
    }
    socket.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data as string) as { type?: string };
        if (parsed.type === "route.plan.created" || parsed.type === "route.plan.assigned") {
          void reloadRef.current();
        }
      } catch {
        // ignore malformed frames
      }
    };
    socket.onerror = () => undefined;
    return () => { socket?.close(); };
  }, [session?.token]);

  async function onRefresh() {
    setRefreshing(true);
    await flushNow().catch(() => undefined);
    await reload();
    setRefreshing(false);
  }

  async function toggleSession() {
    setSessionBusy(true);
    try {
      if (sessionState.active) {
        try {
          await apiClient.stopSession();
        } catch (err) {
          const msg = err instanceof Error ? err.message : "";
          if (!/404/.test(msg)) throw err;
        }
      } else {
        // A work session shares your LIVE location — so we require device
        // location permission FIRST and capture the starting position. Without
        // this a session could "start" while the OS location is off, showing
        // "sharing on" while nothing actually streams to the manager.
        let perm = await probeForegroundLocationPermission();
        if (perm !== "granted") perm = await requestForegroundLocationPermission();
        if (perm !== "granted") {
          Alert.alert(
            "Location access needed",
            "A work session shares your live location with your manager while you're on shift. Enable location access for Orbit in your phone settings, then try again.",
            [{ text: "OK" }]
          );
          return;
        }
        const pos = await getCurrentPosition().catch(() => null);
        const startBody = pos ? { latitude: pos.latitude, longitude: pos.longitude } : {};
        try {
          await apiClient.startSession(startBody);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "";
          if (/409/.test(msg)) {
            // already active — desired state
          } else if (/403/.test(msg)) {
            Alert.alert(
              "Allow location tracking?",
              "Starting a work session shares your live location with your manager while you're on shift. " +
                "You can turn this off anytime in More → Location consent.",
              [
                { text: "Not now", style: "cancel" },
                { text: "Allow & start", onPress: () => void grantConsentAndStart(startBody) }
              ]
            );
            return;
          } else {
            throw err;
          }
        }
      }
      await reload();
    } catch (err) {
      Alert.alert(
        sessionState.active ? "Couldn't stop session" : "Couldn't start session",
        err instanceof Error ? err.message : "Try again from the More tab."
      );
    } finally {
      setSessionBusy(false);
    }
  }

  async function grantConsentAndStart(startBody: { latitude?: number; longitude?: number } = {}) {
    setSessionBusy(true);
    try {
      await apiClient.recordConsent({ granted: true });
      await apiClient.startSession(startBody).catch((err) => {
        const msg = err instanceof Error ? err.message : "";
        if (!/409/.test(msg)) throw err;
      });
      await reload();
    } catch (err) {
      Alert.alert("Couldn't start session", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setSessionBusy(false);
    }
  }

  const greeting = greetingFor(new Date());
  const firstName = (session?.name ?? "").split(" ")[0] || "there";
  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  const todayVisitsTotal = today?.summary.visitsAssigned ?? 0;
  const todayVisitsDone = today?.summary.visitsCompleted ?? 0;
  const todayVisitsRemaining = today?.summary.visitsRemaining ?? 0;
  const stopsPlanned = today?.summary.stopsPlanned ?? 0;
  const plannedDistanceKm = today ? (today.summary.plannedDistanceMeters / 1000).toFixed(1) : "0.0";
  const plannedDurationMin = today?.summary.plannedDurationMinutes ?? 0;
  const openLeads = today?.summary.openLeads ?? 0;
  const nextStops = (today?.routePlans ?? []).flatMap((p) => p.stops.map((s) => ({ planId: p.id, stop: s }))).slice(0, 8);
  // Step-by-step gating: a stop is "done" once there's a completed visit for its
  // outlet today; the rep can only open the NEXT not-done stop — later ones stay
  // locked until they get there (same rule as the guided check-in flow).
  const doneOutletIds = useMemo(
    () => new Set((today?.visits ?? []).filter((v) => v.status === "completed").map((v) => v.outletId)),
    [today]
  );
  const activeStopIndex = nextStops.findIndex(({ stop }) => !doneOutletIds.has(stop.outletId));
  const active = sessionState.active;

  return (
    <ScrollView
      style={styles.shell}
      contentContainerStyle={{ paddingBottom: 40 }}
      refreshControl={<RefreshControl tintColor={theme.color.primary} refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Greeting + tappable avatar (opens the account menu). */}
      <View style={[styles.header, { paddingTop: insets.top + theme.spacing.md }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.greeting}>{greeting}, {firstName}</Text>
          <Text style={styles.date}>{dateLabel}</Text>
        </View>
        <TouchableOpacity style={styles.avatar} activeOpacity={0.8} onPress={() => setMenuOpen(true)} accessibilityRole="button" accessibilityLabel="Account menu">
          <Text style={styles.avatarText}>{initialsOf(session?.name, session?.email)}</Text>
        </TouchableOpacity>
      </View>

      {/* Tracking status + start/stop */}
      <View style={[styles.sessionCard, active ? styles.sessionActive : styles.sessionInactive]}>
        <View style={[styles.sessionDot, { backgroundColor: active ? theme.color.success : theme.color.textMuted }]} />
        <View style={{ flex: 1 }}>
          <Text style={styles.sessionLabel}>
            {sessionState.loading ? "Loading…" : active ? "Work session active" : "No active work session"}
          </Text>
          <Text style={styles.sessionMeta}>
            {active
              ? `Started ${sessionState.startedAt ? new Date(sessionState.startedAt).toLocaleTimeString() : ""} · Location sharing on`
              : "Tap Start to begin tracking and check-ins"}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.sessionBtn, active ? styles.sessionBtnStop : styles.sessionBtnStart]}
          disabled={sessionBusy || sessionState.loading}
          onPress={toggleSession}
          activeOpacity={0.85}
        >
          {sessionBusy
            ? <ActivityIndicator color={active ? theme.color.danger : theme.color.textOnPrimary} />
            : (
              <View style={styles.sessionBtnInner}>
                <Ionicons name={active ? "stop" : "play"} size={14} color={active ? theme.color.danger : theme.color.textOnPrimary} />
                <Text style={[styles.sessionBtnText, active ? styles.sessionBtnTextStop : styles.sessionBtnTextStart]}>
                  {active ? "Stop" : "Start"}
                </Text>
              </View>
            )}
        </TouchableOpacity>
      </View>

      {/* Offline pending pill */}
      {pendingMutations > 0 ? (
        <View style={styles.pendingPill}>
          <Ionicons name="cloud-offline-outline" size={15} color={theme.color.warning} />
          <Text style={styles.pendingText}>
            {pendingMutations} change{pendingMutations === 1 ? "" : "s"} waiting to sync · pull down to retry
          </Text>
        </View>
      ) : null}

      {/* Today's metrics */}
      <View style={styles.metricsGrid}>
        <MetricCard icon="checkmark-done-outline" label="Visits today" value={`${todayVisitsDone}`} sub={`of ${todayVisitsTotal} · ${todayVisitsRemaining} left`} accent={todayVisitsRemaining === 0 && todayVisitsTotal > 0 ? "success" : "primary"} theme={theme} styles={styles} />
        <MetricCard icon="navigate-outline" label="Stops planned" value={`${stopsPlanned}`} sub={`${plannedDistanceKm} km · ${formatMinutes(plannedDurationMin)}`} accent="primary" theme={theme} styles={styles} />
        <MetricCard icon="people-outline" label="Open leads" value={`${openLeads}`} sub="assigned to you" accent={openLeads > 0 ? "warning" : "neutral"} theme={theme} styles={styles} />
        <MetricCard icon="sync-outline" label="Pending sync" value={`${pendingMutations}`} sub={pendingMutations === 0 ? "all clear" : "needs network"} accent={pendingMutations > 0 ? "warning" : "success"} theme={theme} styles={styles} />
      </View>

      {/* Quick actions — only the primary field actions live here; everything
          else (Map, Visits, Outlets, Leads, Orders) is a bottom-tab, so we don't
          duplicate them. */}
      <Text style={styles.sectionLabel}>Quick actions</Text>
      <View style={styles.actionsRow}>
        <QuickAction icon="location-outline" label="Check in" sub="Log a visit" onPress={() => onOpenOutletPicker("check_in")} theme={theme} styles={styles} />
        <QuickAction icon="cart-outline" label="Create order" sub="Capture an order" onPress={() => onOpenOutletPicker("create_order")} primary theme={theme} styles={styles} />
      </View>
      <View style={styles.actionsRow}>
        <QuickAction icon="cash-outline" label="Collect payment" sub="Record a collection" onPress={() => onOpenOutletPicker("collect_payment")} theme={theme} styles={styles} />
        <QuickAction icon="stats-chart-outline" label="My performance" sub="Your stats & rank" onPress={onOpenAnalytics ?? (() => undefined)} theme={theme} styles={styles} />
      </View>

      {/* Today's route */}
      <Text style={styles.sectionLabel}>Today's route</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {!today ? (
        <View style={styles.center}><ActivityIndicator color={theme.color.primary} /></View>
      ) : nextStops.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="map-outline" size={28} color={theme.color.textMuted} />
          <Text style={styles.emptyTitle}>No route planned for today</Text>
          <Text style={styles.emptyMeta}>
            Your manager hasn't assigned a route yet. You can still do an ad-hoc check-in or order from Quick actions above.
          </Text>
        </View>
      ) : (
        nextStops.map(({ planId, stop }, idx) => {
          const done = doneOutletIds.has(stop.outletId);
          const isActive = !done && idx === activeStopIndex;
          const locked = !done && !isActive;
          return (
            <TouchableOpacity
              key={stop.id}
              style={[styles.stop, isActive ? styles.stopActive : null, locked ? styles.stopLocked : null]}
              activeOpacity={locked || done ? 1 : 0.7}
              disabled={locked || done}
              onPress={() => onOpenStop(planId, stop)}
            >
              <View style={[styles.stopNumber, done ? styles.stopNumberDone : isActive ? styles.stopNumberActive : null]}>
                {done
                  ? <Ionicons name="checkmark" size={16} color={theme.color.textOnPrimary} />
                  : locked
                    ? <Ionicons name="lock-closed" size={13} color={theme.color.textMuted} />
                    : <Text style={styles.stopNumberText}>{idx + 1}</Text>}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.stopName, locked ? styles.stopDimText : null]} numberOfLines={1}>{stop.outletName}</Text>
                <Text style={styles.stopMeta}>
                  {done
                    ? "Visited today ✓"
                    : isActive
                      ? `Next stop · ~${stop.expectedDurationMinutes} min`
                      : "Complete the stop above to unlock"}
                </Text>
              </View>
              {isActive ? <Ionicons name="chevron-forward" size={16} color={theme.color.primary} style={{ marginLeft: 4 }} /> : null}
            </TouchableOpacity>
          );
        })
      )}

      <View style={{ height: 24 }} />

      <AccountMenu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        onSignOut={onSignOut ?? (() => undefined)}
        onOpenSettings={onOpenSettings}
      />
    </ScrollView>
  );
}

function MetricCard({ icon, label, value, sub, accent, theme, styles }: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string; value: string; sub: string; accent: Accent;
  theme: Theme; styles: ReturnType<typeof makeStyles>;
}): JSX.Element {
  const colour = accent === "success" ? theme.color.success
    : accent === "warning" ? theme.color.warning
    : accent === "neutral" ? theme.color.textSecondary
    : theme.color.primary;
  const soft = accent === "success" ? theme.color.successSoft
    : accent === "warning" ? theme.color.warningSoft
    : accent === "neutral" ? theme.color.surfaceMuted
    : theme.color.primarySoft;
  return (
    <View style={styles.metric}>
      <View style={[styles.metricIcon, { backgroundColor: soft }]}>
        <Ionicons name={icon} size={16} color={colour} />
      </View>
      <Text style={[styles.metricValue, { color: colour }]}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricSub}>{sub}</Text>
    </View>
  );
}

function QuickAction({ icon, label, sub, onPress, primary, theme, styles }: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string; sub: string; onPress: () => void; primary?: boolean;
  theme: Theme; styles: ReturnType<typeof makeStyles>;
}): JSX.Element {
  return (
    <TouchableOpacity style={[styles.actionCard, primary && styles.actionCardPrimary]} onPress={onPress} activeOpacity={0.85}>
      <View style={[styles.actionIcon, primary && styles.actionIconPrimary]}>
        <Ionicons name={icon} size={18} color={primary ? theme.color.textOnPrimary : theme.color.primary} />
      </View>
      <Text style={[styles.actionLabel, primary && styles.actionLabelPrimary]}>{label}</Text>
      <Text style={[styles.actionSub, primary && styles.actionSubPrimary]}>{sub}</Text>
    </TouchableOpacity>
  );
}

function greetingFor(d: Date): string {
  const h = d.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function formatMinutes(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60); const r = min % 60;
  return r === 0 ? `${h} h` : `${h} h ${r} min`;
}

const makeStyles = (theme: Theme) => StyleSheet.create({
  shell: { flex: 1, backgroundColor: theme.color.background },
  header: {
    flexDirection: "row", alignItems: "center", gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.md
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: theme.color.primary,
    alignItems: "center", justifyContent: "center",
    ...theme.elevation.glow
  },
  avatarText: { color: theme.color.textOnPrimary, fontWeight: "700", fontSize: 16 },
  greeting: { ...theme.font.title },
  date: { ...theme.font.caption, marginTop: 2 },
  sessionCard: {
    flexDirection: "row", alignItems: "center", gap: theme.spacing.sm,
    marginHorizontal: theme.spacing.lg, marginBottom: theme.spacing.md,
    padding: theme.spacing.md, borderRadius: theme.radius.lg, borderWidth: 1
  },
  sessionDot: { width: 10, height: 10, borderRadius: 5 },
  sessionActive: { backgroundColor: theme.color.successSoft, borderColor: "rgba(46, 213, 152, 0.32)" },
  sessionInactive: { backgroundColor: theme.color.surface, borderColor: theme.color.border, ...theme.elevation.sm },
  sessionLabel: { ...theme.font.bodyStrong },
  sessionMeta: { ...theme.font.caption, marginTop: 2 },
  sessionBtn: {
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: theme.radius.pill,
    minWidth: 80, alignItems: "center", marginLeft: theme.spacing.sm
  },
  sessionBtnInner: { flexDirection: "row", alignItems: "center", gap: 6 },
  sessionBtnStart: { backgroundColor: theme.color.primary },
  sessionBtnStop: { backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.danger },
  sessionBtnText: { fontWeight: "700", fontSize: 14 },
  sessionBtnTextStart: { color: theme.color.textOnPrimary },
  sessionBtnTextStop: { color: theme.color.danger },
  pendingPill: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginHorizontal: theme.spacing.lg, marginBottom: theme.spacing.md,
    paddingHorizontal: theme.spacing.md, paddingVertical: 9,
    backgroundColor: theme.color.warningSoft, borderRadius: theme.radius.md,
    borderWidth: 1, borderColor: "rgba(240, 179, 74, 0.28)"
  },
  pendingText: { color: theme.color.warning, fontSize: 12, fontWeight: "600", flex: 1 },
  metricsGrid: {
    flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg, marginBottom: theme.spacing.lg
  },
  metric: {
    flexBasis: "47%", flexGrow: 1,
    backgroundColor: theme.color.surface, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.color.border,
    padding: theme.spacing.md, ...theme.elevation.sm
  },
  metricIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  metricValue: { fontSize: 26, fontWeight: "700", lineHeight: 30 },
  metricLabel: { ...theme.font.caption, fontWeight: "600", color: theme.color.textPrimary, marginTop: 2 },
  metricSub: { ...theme.font.caption, marginTop: 1 },
  sectionLabel: { ...theme.font.label, textTransform: "uppercase", paddingHorizontal: theme.spacing.lg, marginBottom: theme.spacing.sm, marginTop: theme.spacing.xs },
  actionsRow: { flexDirection: "row", gap: theme.spacing.sm, paddingHorizontal: theme.spacing.lg, marginBottom: theme.spacing.sm },
  actionCard: {
    flex: 1, backgroundColor: theme.color.surface, borderRadius: theme.radius.lg,
    borderWidth: 1, borderColor: theme.color.border, padding: theme.spacing.md, ...theme.elevation.sm
  },
  actionCardPrimary: { backgroundColor: theme.color.primary, borderColor: theme.color.primary, ...theme.elevation.glow },
  actionIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: theme.color.primarySoft, marginBottom: 10 },
  actionIconPrimary: { backgroundColor: "rgba(255,255,255,0.18)" },
  actionLabel: { fontWeight: "700", fontSize: 15, color: theme.color.textPrimary },
  actionLabelPrimary: { color: theme.color.textOnPrimary },
  actionSub: { ...theme.font.caption, marginTop: 2 },
  actionSubPrimary: { color: "rgba(255,255,255,0.85)" },
  error: { color: theme.color.danger, paddingHorizontal: theme.spacing.lg, paddingVertical: 4, fontSize: 13 },
  center: { padding: theme.spacing.xl, alignItems: "center" },
  empty: { marginHorizontal: theme.spacing.lg, padding: theme.spacing.lg, backgroundColor: theme.color.surface, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.color.border, alignItems: "center", gap: 6 },
  emptyTitle: { ...theme.font.bodyStrong, marginTop: 4 },
  emptyMeta: { ...theme.font.caption, textAlign: "center" },
  stop: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: theme.spacing.md, paddingHorizontal: theme.spacing.md,
    marginHorizontal: theme.spacing.lg, marginBottom: theme.spacing.sm,
    backgroundColor: theme.color.surface, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.color.border, ...theme.elevation.sm
  },
  stopActive: { borderLeftWidth: 3, borderLeftColor: theme.color.primary },
  stopLocked: { opacity: 0.55, backgroundColor: theme.color.surfaceMuted },
  stopNumber: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: theme.color.primarySoft,
    alignItems: "center", justifyContent: "center", marginRight: theme.spacing.md
  },
  stopNumberActive: { backgroundColor: theme.color.primary },
  stopNumberDone: { backgroundColor: theme.color.success },
  stopNumberText: { color: theme.color.primaryDeep, fontWeight: "700" },
  stopName: { ...theme.font.bodyStrong },
  stopDimText: { color: theme.color.textMuted },
  stopMeta: { ...theme.font.caption, marginTop: 2 }
});
