import { useCallback, useMemo, useState, type JSX } from "react";
import { View, Text, TextInput, FlatList, RefreshControl, StyleSheet, ActivityIndicator, TouchableOpacity } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { apiClient } from "../api-service";
import type { OutletSummary } from "@orbit/api-client";
import { useTheme } from "../theme-context";
import type { Theme } from "../theme";
import { EmptyState } from "../components/EmptyState";

interface Props {
  /** Open the outlet's detail screen (info, balance, order + payment actions). */
  onOpenDetail?: (outlet: OutletSummary) => void;
  /** Start a new order for this outlet. */
  onCreateOrder?: (outlet: OutletSummary) => void;
}

export function OutletsListScreen({ onOpenDetail, onCreateOrder }: Props = {}): JSX.Element {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [outlets, setOutlets] = useState<OutletSummary[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await apiClient.listOutlets();
      setOutlets(res.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load outlets");
      setOutlets([]);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const filtered = useMemo(() => {
    if (!outlets) return [];
    const s = q.trim().toLowerCase();
    if (!s) return outlets;
    return outlets.filter((o) => o.name.toLowerCase().includes(s));
  }, [outlets, q]);

  if (outlets === null) {
    return <View style={styles.center}><ActivityIndicator color={theme.color.primary} /></View>;
  }

  return (
    <FlatList
      style={styles.shell}
      data={filtered}
      keyExtractor={(o) => o.id}
      refreshControl={<RefreshControl tintColor={theme.color.primary} refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.title}>Outlets</Text>
          <Text style={styles.subtitle}>All customer locations in your workspace.</Text>
          <TextInput
            style={styles.search}
            value={q}
            onChangeText={setQ}
            placeholder="Search outlets"
            placeholderTextColor={theme.color.textMuted}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      }
      ListEmptyComponent={
        <EmptyState icon="🏪" title="No outlets match" message="Try a different search term, or add outlets from the dashboard." />
      }
      renderItem={({ item }) => {
        const daysSince = item.lastVisitedAt
          ? Math.floor((Date.now() - new Date(item.lastVisitedAt).getTime()) / 86_400_000)
          : null;
        const showActions = Boolean(onOpenDetail || onCreateOrder);
        return (
          <TouchableOpacity style={styles.row} activeOpacity={onOpenDetail ? 0.7 : 1} disabled={!onOpenDetail} onPress={() => onOpenDetail?.(item)}>
            <View style={styles.rowHead}>
              <View style={styles.outletIcon}>
                <Ionicons name="storefront" size={18} color={theme.color.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{item.name}</Text>
                {item.visitCount !== undefined && item.visitCount > 0 ? (
                  <Text style={styles.rowMeta}>
                    {item.visitCount} visit{item.visitCount === 1 ? "" : "s"} · last {daysSince === 0 ? "today" : daysSince === 1 ? "yesterday" : `${daysSince}d ago`}
                  </Text>
                ) : (
                  <Text style={styles.rowMeta}>Never visited</Text>
                )}
              </View>
              {onOpenDetail ? <Ionicons name="chevron-forward" size={18} color={theme.color.textMuted} /> : null}
            </View>
            {showActions ? (
              <View style={styles.actions}>
                {onOpenDetail ? (
                  <TouchableOpacity style={styles.actionBtn} onPress={() => onOpenDetail(item)} activeOpacity={0.85}>
                    <Ionicons name="information-circle-outline" size={16} color={theme.color.primary} />
                    <Text style={styles.actionBtnText}>Details</Text>
                  </TouchableOpacity>
                ) : null}
                {onCreateOrder ? (
                  <TouchableOpacity style={[styles.actionBtn, styles.actionBtnPrimary]} onPress={() => onCreateOrder(item)} activeOpacity={0.85}>
                    <Ionicons name="cart-outline" size={16} color={theme.color.textOnPrimary} />
                    <Text style={[styles.actionBtnText, styles.actionBtnTextPrimary]}>Order</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}
          </TouchableOpacity>
        );
      }}
    />
  );
}

const makeStyles = (theme: Theme) => StyleSheet.create({
  shell: { flex: 1, backgroundColor: theme.color.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.color.background },
  header: { padding: theme.spacing.lg, paddingBottom: theme.spacing.sm },
  title: { ...theme.font.title },
  subtitle: { ...theme.font.caption, marginTop: theme.spacing.xs },
  search: {
    marginTop: theme.spacing.md,
    padding: 10, borderRadius: theme.radius.sm,
    borderWidth: 1, borderColor: theme.color.borderStrong,
    backgroundColor: theme.color.surface, color: theme.color.textPrimary, fontSize: 14
  },
  error: { color: theme.color.danger, marginTop: theme.spacing.sm, fontSize: 13 },
  row: {
    paddingVertical: theme.spacing.md, paddingHorizontal: theme.spacing.md,
    marginHorizontal: theme.spacing.lg, marginBottom: theme.spacing.sm,
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.color.border, ...theme.elevation.sm
  },
  rowHead: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md },
  outletIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: theme.color.primarySoft, alignItems: "center", justifyContent: "center" },
  rowTitle: { ...theme.font.bodyStrong },
  rowMeta: { ...theme.font.caption, marginTop: 2 },
  actions: { flexDirection: "row", gap: theme.spacing.sm, marginTop: theme.spacing.md },
  actionBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    paddingVertical: 9, borderRadius: theme.radius.md,
    borderWidth: 1, borderColor: theme.color.primaryBorder, backgroundColor: theme.color.primarySoft
  },
  actionBtnPrimary: { backgroundColor: theme.color.primary, borderColor: theme.color.primary },
  actionBtnText: { color: theme.color.primary, fontWeight: "700", fontSize: 13 },
  actionBtnTextPrimary: { color: theme.color.textOnPrimary },
  empty: { alignItems: "center", padding: theme.spacing.xl },
  emptyTitle: { ...theme.font.bodyStrong, marginBottom: theme.spacing.xs }
});
