import { useCallback, useMemo, useState, type JSX } from "react";
import {
  View, Text, FlatList, StyleSheet, RefreshControl, TouchableOpacity, ActivityIndicator
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { apiClient } from "../api-service";
import type { FieldOrderSummary, OutletSummary } from "@orbit/api-client";
import type { OfflineSync } from "../sync/offline-queue";
import { useTheme } from "../theme-context";
import type { Theme } from "../theme";
import { EmptyState } from "../components/EmptyState";

interface Props {
  sync: OfflineSync;
  flushNow: () => Promise<void>;
}

interface PendingOrderRow {
  kind: "pending";
  id: string;              // mutation idempotency key (also the order id we'll get)
  outletId: string;
  totalCents: number;
  qty: number;
  status: "queued" | "needs_attention";
  errorReason?: string;
}

interface SyncedOrderRow {
  kind: "synced";
  id: string;
  outletId: string;
  totalCents: number;
  status: string;
  source: string;
  createdAt: string;
  erpOrderId?: string | null;
}

type Row = PendingOrderRow | SyncedOrderRow;

export function OrderHistoryScreen({ sync, flushNow }: Props): JSX.Element {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [synced, setSynced] = useState<FieldOrderSummary[]>([]);
  const [outlets, setOutlets] = useState<OutletSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setPendingTick] = useState(0);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const [result, o] = await Promise.all([
        apiClient.listFieldOrders(),
        apiClient.listOutlets().catch(() => null)
      ]);
      setSynced(result.items);
      if (o) setOutlets(o.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load orders");
    }
  }, []);

  const outletName = (id: string) => outlets.find((o) => o.id === id)?.name ?? `Outlet ${id.slice(-6)}`;

  useFocusEffect(useCallback(() => {
    void reload().finally(() => setLoading(false));
  }, [reload]));

  async function handleRefresh() {
    setRefreshing(true);
    await flushNow().catch(() => undefined);
    await reload();
    setPendingTick((t) => t + 1);
    setRefreshing(false);
  }

  async function retryPending() {
    await flushNow().catch(() => undefined);
    await reload();
    setPendingTick((t) => t + 1);
  }

  // Combine the local sync queue (pending/needs_attention) + server-side history.
  const queue = sync.queue.pending().filter((m) => m.type === "order.create");
  const failed = sync.queue.failed().filter((m) => m.type === "order.create");

  const rows: Row[] = [
    ...queue.map<PendingOrderRow>((m) => ({
      kind: "pending",
      id: m.idempotencyKey,
      outletId: getOutletId(m.payload),
      totalCents: 0,
      qty: getLineQty(m.payload),
      status: "queued"
    })),
    ...failed.map<PendingOrderRow>((m) => ({
      kind: "pending",
      id: m.idempotencyKey,
      outletId: getOutletId(m.payload),
      totalCents: 0,
      qty: getLineQty(m.payload),
      status: "needs_attention",
      errorReason: m.lastError ?? "unknown"
    })),
    ...synced.map<SyncedOrderRow>((o) => ({
      kind: "synced",
      id: o.id,
      outletId: o.outletId,
      totalCents: o.totalCents,
      status: o.status,
      source: o.source,
      createdAt: o.createdAt,
      erpOrderId: o.erpOrderId
    }))
  ];

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.color.primary} />
        <Text style={[styles.muted, { marginTop: theme.spacing.sm }]}>Loading orders…</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.shell}
      data={rows}
      keyExtractor={(r) => r.id}
      refreshControl={
        <RefreshControl tintColor={theme.color.primary} refreshing={refreshing} onRefresh={handleRefresh} />
      }
      ListHeaderComponent={
        <View style={{ padding: theme.spacing.lg }}>
          <Text style={styles.heading}>Orders</Text>
          <Text style={styles.muted}>Pull to refresh and retry any queued orders.</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {queue.length + failed.length > 0 ? (
            <TouchableOpacity onPress={retryPending} style={styles.retryBtn}>
              <Text style={styles.retryBtnText}>
                Retry {queue.length + failed.length} pending order{queue.length + failed.length === 1 ? "" : "s"}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        <EmptyState icon="🧾" title="No orders yet" message="Orders you create at outlets will appear here." />
      }
      renderItem={({ item }) => {
        if (item.kind === "pending") {
          const isFailed = item.status === "needs_attention";
          return (
            <View style={[styles.row, isFailed ? styles.rowFailed : styles.rowQueued]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{outletName(item.outletId)}</Text>
                <Text style={styles.rowMeta}>
                  {item.qty} item{item.qty === 1 ? "" : "s"} · {isFailed ? "Needs attention" : "Saved offline · will sync"}
                </Text>
                {isFailed && item.errorReason ? (
                  <Text style={styles.errorReason}>{item.errorReason}</Text>
                ) : null}
              </View>
              <View style={[styles.pill, isFailed ? styles.pillFailed : styles.pillQueued]}>
                <Text style={[styles.pillText, isFailed ? styles.pillTextFailed : styles.pillTextQueued]}>
                  {isFailed ? "Failed" : "Queued"}
                </Text>
              </View>
            </View>
          );
        }
        return (
          <View style={[styles.row, styles.rowSynced]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Order — {item.outletId}</Text>
              <Text style={styles.rowMeta}>
                {(item.totalCents / 100).toFixed(2)} · {item.source} · {new Date(item.createdAt).toLocaleTimeString()}
              </Text>
              {item.erpOrderId ? (
                <Text style={styles.erpRef}>Synced to ERPNext · {item.erpOrderId}</Text>
              ) : null}
            </View>
            <View style={[styles.pill, styles.pillSynced]}>
              <Text style={[styles.pillText, styles.pillTextSynced]}>{item.status}</Text>
            </View>
          </View>
        );
      }}
    />
  );
}

function getOutletId(payload: unknown): string {
  if (payload && typeof payload === "object" && "outletId" in payload) {
    const o = (payload as Record<string, unknown>).outletId;
    return typeof o === "string" ? o : "";
  }
  return "";
}
function getLineQty(payload: unknown): number {
  if (payload && typeof payload === "object" && "lines" in payload) {
    const lines = (payload as Record<string, unknown>).lines;
    if (Array.isArray(lines)) {
      return lines.reduce((sum, l) => {
        const q = (l as Record<string, unknown>).quantity;
        return sum + (typeof q === "number" ? q : 0);
      }, 0);
    }
  }
  return 0;
}

const makeStyles = (theme: Theme) => StyleSheet.create({
  shell: { flex: 1, backgroundColor: theme.color.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  heading: { ...theme.font.title, marginBottom: theme.spacing.xs },
  muted: { ...theme.font.caption },
  error: { color: theme.color.danger, marginTop: theme.spacing.sm },
  retryBtn: {
    marginTop: theme.spacing.md,
    backgroundColor: theme.color.primarySoft,
    padding: 10,
    borderRadius: theme.radius.sm,
    alignItems: "center"
  },
  retryBtnText: { color: theme.color.primary, fontWeight: "600", fontSize: 13 },
  empty: { alignItems: "center", padding: theme.spacing.xl },
  emptyTitle: { ...theme.font.bodyStrong, marginBottom: theme.spacing.xs },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    marginHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1
  },
  rowSynced: { borderColor: theme.color.border },
  rowQueued: { borderColor: "rgba(180, 83, 9, 0.2)", backgroundColor: theme.color.warningSoft },
  rowFailed: { borderColor: "rgba(197, 48, 48, 0.3)", backgroundColor: "rgba(254, 226, 226, 0.4)" },
  rowTitle: { ...theme.font.bodyStrong },
  rowMeta: { ...theme.font.caption, marginTop: 2 },
  errorReason: { color: theme.color.danger, fontSize: 11, marginTop: 2 },
  erpRef: { color: theme.color.success, fontSize: 11, marginTop: 2, fontWeight: "600" },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, marginLeft: theme.spacing.md },
  pillText: { fontSize: 11, fontWeight: "600", textTransform: "capitalize" },
  pillSynced: { backgroundColor: theme.color.successSoft },
  pillTextSynced: { color: theme.color.success },
  pillQueued: { backgroundColor: theme.color.warningSoft },
  pillTextQueued: { color: theme.color.warning },
  pillFailed: { backgroundColor: "rgba(254, 226, 226, 0.6)" },
  pillTextFailed: { color: theme.color.danger }
});
