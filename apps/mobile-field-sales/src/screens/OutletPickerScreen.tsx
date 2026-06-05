import { useCallback, useEffect, useMemo, useState, type JSX } from "react";
import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { apiClient } from "../api-service";
import type { OutletSummary } from "@orbit/api-client";
import { haversineMeters } from "../geo";
import { getCurrentPosition, probeForegroundLocationPermission, requestForegroundLocationPermission } from "../tracking/location-probes";
import { onVisitCompleted } from "../visits/visit-events";
import { useTheme } from "../theme-context";
import type { Theme } from "../theme";

interface Props {
  mode: "check_in" | "create_order" | "collect_payment";
  onPick: (outlet: OutletSummary) => void;
}

/** Outlet decorated with its straight-line distance from the rep (when known). */
interface RankedOutlet extends OutletSummary {
  distanceMeters: number | null;
}

export function OutletPickerScreen({ mode, onPick }: Props): JSX.Element {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const gated = mode === "check_in";

  const [outlets, setOutlets] = useState<OutletSummary[] | null>(null);
  const [position, setPosition] = useState<{ latitude: number; longitude: number } | null>(null);
  const [doneOutletIds, setDoneOutletIds] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Which outlets the rep has already checked out of TODAY — they're skipped in
  // the gated sequence (shown as done, never re-locked). Seeded from the server
  // and topped up live as visits complete this session.
  const loadDoneToday = useCallback(async () => {
    try {
      const res = await apiClient.listVisits();
      const today = new Date().toISOString().slice(0, 10);
      const done = new Set(
        res.items
          .filter((v) => v.status === "completed" && (v.checkedOutAt ?? "").slice(0, 10) === today)
          .map((v) => v.outletId)
      );
      setDoneOutletIds((prev) => new Set([...prev, ...done]));
    } catch {
      // Non-fatal — the live onVisitCompleted events still advance the sequence.
    }
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      // Location first so distances/ordering are ready when outlets land.
      let perm = await probeForegroundLocationPermission();
      if (perm !== "granted") perm = await requestForegroundLocationPermission();
      if (perm === "granted") {
        const pos = await getCurrentPosition().catch(() => null);
        if (pos) setPosition({ latitude: pos.latitude, longitude: pos.longitude });
      }
      const res = await apiClient.listOutlets();
      setOutlets(res.items);
      if (gated) await loadDoneToday();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load outlets");
      setOutlets([]);
    }
  }, [gated, loadDoneToday]);

  useEffect(() => { void load(); }, [load]);

  // Live: when a visit completes (this or any screen), mark it done so the
  // sequence advances without a server round-trip.
  useEffect(() => onVisitCompleted((outletId) => {
    setDoneOutletIds((prev) => new Set(prev).add(outletId));
  }), []);

  // Returning from a completed visit: re-pull today's done list so the next
  // nearest outlet unlocks even if the live event was missed (offline sync).
  useFocusEffect(useCallback(() => {
    if (gated) void loadDoneToday();
  }, [gated, loadDoneToday]));

  // Rank by straight-line distance from the rep (nearest first). Without a
  // position we keep server order but still gate sequentially.
  const ranked: RankedOutlet[] = useMemo(() => {
    if (!outlets) return [];
    const withDist = outlets.map((o) => ({
      ...o,
      distanceMeters: position ? haversineMeters(position.latitude, position.longitude, o.latitude, o.longitude) : null
    }));
    if (position) withDist.sort((a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity));
    return withDist;
  }, [outlets, position]);

  // Free-pick modes allow search; the gated sequence does not (it's a guided
  // order, not a free list).
  const listData = useMemo(() => {
    if (gated) return ranked;
    const s = q.trim().toLowerCase();
    return s ? ranked.filter((o) => o.name.toLowerCase().includes(s)) : ranked;
  }, [ranked, q, gated]);

  // The active step = the nearest outlet not yet checked out today. Everything
  // before it is done; everything after is locked until the rep reaches it.
  const activeIndex = useMemo(() => {
    if (!gated) return -1;
    return ranked.findIndex((o) => !doneOutletIds.has(o.id));
  }, [gated, ranked, doneOutletIds]);

  const allDone = gated && ranked.length > 0 && activeIndex === -1;

  if (outlets === null) {
    return <View style={styles.center}><ActivityIndicator color={theme.color.primary} /></View>;
  }

  return (
    <View style={styles.shell}>
      <View style={styles.header}>
        <Text style={styles.title}>
          {mode === "check_in" ? "Check in — nearest first" : mode === "collect_payment" ? "Collect payment from…" : "Create order for…"}
        </Text>
        <Text style={styles.subtitle}>
          {gated
            ? "Visit outlets in order — the closest unlocks first, the next opens once you complete it."
            : mode === "collect_payment"
              ? "Pick the outlet you're collecting from"
              : "Pick the outlet placing the order"}
        </Text>
        {!gated ? (
          <TextInput
            style={styles.search}
            value={q}
            onChangeText={setQ}
            placeholder="Search outlets"
            placeholderTextColor={theme.color.textMuted}
            autoFocus
          />
        ) : null}
        {gated && !position ? (
          <View style={styles.notice}>
            <Ionicons name="location-outline" size={14} color={theme.color.warning} />
            <Text style={styles.noticeText}>Turn on location to order stops by distance.</Text>
          </View>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>

      {allDone ? (
        <View style={styles.empty}>
          <Ionicons name="checkmark-done-circle" size={40} color={theme.color.success} />
          <Text style={styles.emptyTitle}>All outlets visited 🎉</Text>
          <Text style={styles.rowMeta}>You've checked in everywhere on today's list.</Text>
        </View>
      ) : null}

      <FlatList
        data={listData}
        keyExtractor={(o) => o.id}
        contentContainerStyle={{ paddingBottom: 24 }}
        ListEmptyComponent={
          allDone ? null : (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>{q ? "No outlets match" : "No outlets yet"}</Text>
            </View>
          )
        }
        renderItem={({ item, index }) => {
          const done = doneOutletIds.has(item.id);
          const active = gated ? index === activeIndex : true;
          const locked = gated && !done && !active;
          const distance = formatDistance(item.distanceMeters);

          return (
            <TouchableOpacity
              style={[styles.row, active && gated ? styles.rowActive : null, locked ? styles.rowLocked : null, done ? styles.rowDone : null]}
              activeOpacity={locked || done ? 1 : 0.7}
              disabled={locked || done}
              onPress={() => onPick(item)}
            >
              {gated ? (
                <View style={[styles.badge, done ? styles.badgeDone : active ? styles.badgeActive : styles.badgeLocked]}>
                  {done
                    ? <Ionicons name="checkmark" size={16} color={theme.color.textOnPrimary} />
                    : locked
                      ? <Ionicons name="lock-closed" size={13} color={theme.color.textMuted} />
                      : <Text style={styles.badgeText}>{index + 1}</Text>}
                </View>
              ) : (
                <View style={styles.iconWrap}><Ionicons name="storefront" size={18} color={theme.color.primary} /></View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, locked ? styles.dimText : null]} numberOfLines={1}>{item.name}</Text>
                <Text style={[styles.rowMeta, locked ? styles.dimText : null]}>
                  {done
                    ? "Visited today ✓"
                    : locked
                      ? "Complete the stop above to unlock"
                      : distance
                        ? `${distance} away${active && gated ? " · start here" : ""}`
                        : active && gated ? "Start here" : "Tap to select"}
                </Text>
              </View>
              {!locked && !done ? <Ionicons name="chevron-forward" size={18} color={theme.color.textMuted} /> : null}
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

function formatDistance(meters: number | null): string | null {
  if (meters == null) return null;
  if (meters < 950) return `${Math.round(meters / 10) * 10} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

const makeStyles = (theme: Theme) => StyleSheet.create({
  shell: { flex: 1, backgroundColor: theme.color.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.color.background },
  header: { padding: theme.spacing.lg, paddingBottom: theme.spacing.sm },
  title: { ...theme.font.title },
  subtitle: { ...theme.font.caption, marginTop: theme.spacing.xs, marginBottom: theme.spacing.md },
  search: {
    padding: 10, borderRadius: theme.radius.sm,
    borderWidth: 1, borderColor: theme.color.borderStrong,
    backgroundColor: theme.color.surface, color: theme.color.textPrimary, fontSize: 14
  },
  notice: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: theme.spacing.xs },
  noticeText: { ...theme.font.caption, color: theme.color.warning },
  error: { color: theme.color.danger, marginTop: theme.spacing.sm, fontSize: 13 },
  row: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: theme.spacing.md, paddingHorizontal: theme.spacing.md,
    marginHorizontal: theme.spacing.lg, marginBottom: theme.spacing.sm,
    backgroundColor: theme.color.surface, borderRadius: theme.radius.md,
    borderWidth: 1, borderColor: theme.color.border
  },
  rowActive: { borderColor: theme.color.primary, borderWidth: 1.5, backgroundColor: theme.color.primarySoft },
  rowLocked: { opacity: 0.5, backgroundColor: theme.color.surfaceMuted },
  rowDone: { opacity: 0.8 },
  rowTitle: { ...theme.font.bodyStrong },
  rowMeta: { ...theme.font.caption, marginTop: 2 },
  dimText: { color: theme.color.textMuted },
  iconWrap: { width: 34, height: 34, borderRadius: 17, backgroundColor: theme.color.primarySoft, alignItems: "center", justifyContent: "center", marginRight: theme.spacing.md },
  badge: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", marginRight: theme.spacing.md },
  badgeActive: { backgroundColor: theme.color.primary },
  badgeDone: { backgroundColor: theme.color.success },
  badgeLocked: { backgroundColor: theme.color.surfaceMuted, borderWidth: 1, borderColor: theme.color.border },
  badgeText: { color: theme.color.textOnPrimary, fontWeight: "800", fontSize: 13 },
  empty: { alignItems: "center", padding: theme.spacing.xl, gap: 6 },
  emptyTitle: { ...theme.font.bodyStrong }
});
