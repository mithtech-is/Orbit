import { useCallback, useMemo, useState, type JSX } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import type { OutletSummary } from "@orbit/api-client";
import { apiClient } from "../api-service";
import { useTheme } from "../theme-context";
import type { Theme } from "../theme";
import { formatMinor, useOrgCurrency } from "../money";

interface Props {
  outlet: OutletSummary;
  onOrder: (outlet: OutletSummary) => void;
  onCollectPayment: (outlet: OutletSummary) => void;
}

interface Ledger { orderedCents: number; paidCents: number; outstandingCents: number; items: Array<{ id: string; amountCents: number; method: string; createdAt: string }> }

export function OutletDetailScreen({ outlet, onOrder, onCollectPayment }: Props): JSX.Element {
  const { theme } = useTheme();
  const currency = useOrgCurrency();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setLedger(await apiClient.getOutletLedger(outlet.id)); } catch { /* ledger optional */ }
  }, [outlet.id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const lastVisit = outlet.lastVisitedAt
    ? (() => {
        const days = Math.floor((Date.now() - new Date(outlet.lastVisitedAt as string).getTime()) / 86_400_000);
        return days === 0 ? "Today" : days === 1 ? "Yesterday" : `${days}d ago`;
      })()
    : "Never";

  return (
    <ScrollView
      style={styles.shell}
      contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: 60 }}
      refreshControl={<RefreshControl tintColor={theme.color.primary} refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    >
      <View style={styles.headerRow}>
        <View style={styles.icon}><Ionicons name="storefront" size={22} color={theme.color.primary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{outlet.name}</Text>
          <Text style={styles.meta}>{outlet.latitude.toFixed(5)}, {outlet.longitude.toFixed(5)}</Text>
        </View>
      </View>

      <View style={styles.statRow}>
        <Stat label="Visits" value={`${outlet.visitCount ?? 0}`} styles={styles} />
        <Stat label="Last visit" value={lastVisit} styles={styles} />
      </View>

      <Text style={styles.sectionLabel}>Balance</Text>
      <View style={styles.ledger}>
        <Stat label="Ordered" value={ledger ? formatMinor(ledger.orderedCents, currency) : "—"} styles={styles} />
        <Stat label="Paid" value={ledger ? formatMinor(ledger.paidCents, currency) : "—"} styles={styles} />
        <Stat label="Outstanding" value={ledger ? formatMinor(ledger.outstandingCents, currency) : "—"} accent styles={styles} />
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={[styles.actionBtn, styles.actionBtnPrimary]} onPress={() => onOrder(outlet)} activeOpacity={0.85}>
          <Ionicons name="cart-outline" size={18} color={theme.color.textOnPrimary} />
          <Text style={[styles.actionText, styles.actionTextPrimary]}>New order</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={() => onCollectPayment(outlet)} activeOpacity={0.85}>
          <Ionicons name="cash-outline" size={18} color={theme.color.primary} />
          <Text style={styles.actionText}>Collect payment</Text>
        </TouchableOpacity>
      </View>

      {ledger && ledger.items.length > 0 ? (
        <>
          <Text style={styles.sectionLabel}>Recent payments</Text>
          {ledger.items.slice(0, 8).map((p) => (
            <View key={p.id} style={styles.histRow}>
              <Text style={styles.histAmount}>{formatMinor(p.amountCents, currency)}</Text>
              <Text style={styles.histMeta}>{p.method} · {new Date(p.createdAt).toLocaleDateString()}</Text>
            </View>
          ))}
        </>
      ) : ledger ? (
        <Text style={styles.empty}>No payments recorded yet.</Text>
      ) : (
        <View style={{ paddingVertical: theme.spacing.lg, alignItems: "center" }}><ActivityIndicator color={theme.color.primary} /></View>
      )}
    </ScrollView>
  );
}

function Stat({ label, value, accent, styles }: { label: string; value: string; accent?: boolean; styles: ReturnType<typeof makeStyles> }): JSX.Element {
  return (
    <View style={styles.statCell}>
      <Text style={[styles.statValue, accent ? styles.statValueAccent : null]} numberOfLines={1}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const makeStyles = (theme: Theme) => StyleSheet.create({
  shell: { flex: 1, backgroundColor: theme.color.background },
  headerRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md, marginBottom: theme.spacing.lg },
  icon: { width: 48, height: 48, borderRadius: 14, backgroundColor: theme.color.primarySoft, alignItems: "center", justifyContent: "center" },
  name: { ...theme.font.title, fontSize: 20 },
  meta: { ...theme.font.caption, marginTop: 2 },
  statRow: { flexDirection: "row", backgroundColor: theme.color.surface, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.color.border, ...theme.elevation.sm },
  sectionLabel: { ...theme.font.label, textTransform: "uppercase", marginTop: theme.spacing.lg, marginBottom: theme.spacing.sm },
  ledger: { flexDirection: "row", backgroundColor: theme.color.surface, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.color.border, ...theme.elevation.sm },
  statCell: { flex: 1, alignItems: "center", paddingVertical: theme.spacing.md },
  statValue: { fontSize: 16, fontWeight: "700", color: theme.color.textPrimary },
  statValueAccent: { color: theme.color.warning },
  statLabel: { ...theme.font.caption, marginTop: 2 },
  actions: { flexDirection: "row", gap: theme.spacing.sm, marginTop: theme.spacing.lg },
  actionBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 13, borderRadius: theme.radius.md,
    borderWidth: 1, borderColor: theme.color.primaryBorder, backgroundColor: theme.color.primarySoft
  },
  actionBtnPrimary: { backgroundColor: theme.color.primary, borderColor: theme.color.primary, ...theme.elevation.glow },
  actionText: { color: theme.color.primary, fontWeight: "700", fontSize: 14 },
  actionTextPrimary: { color: theme.color.textOnPrimary },
  histRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: theme.color.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.color.border, paddingVertical: theme.spacing.md, paddingHorizontal: theme.spacing.md, marginBottom: theme.spacing.sm },
  histAmount: { ...theme.font.bodyStrong },
  histMeta: { ...theme.font.caption, textTransform: "capitalize" },
  empty: { ...theme.font.caption, textAlign: "center", paddingVertical: theme.spacing.lg }
});
