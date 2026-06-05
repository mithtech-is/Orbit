import { useMemo, useState, type JSX } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator
} from "react-native";
import { apiClient } from "../api-service";
import type { OfflineSync } from "../sync/offline-queue";
import { emitOrderCreated } from "../visits/visit-events";
import { useTheme } from "../theme-context";
import type { Theme } from "../theme";
import { formatMinor, useOrgCurrency } from "../money";
import type { CartLine } from "./ProductCatalogScreen";

interface Props {
  outletId: string;
  outletName: string;
  visitId?: string;
  cart: CartLine[];
  sync: OfflineSync;
  flushNow: () => Promise<void>;
  onSubmitted: (result: { orderId: string; mode: "online" | "offline" }) => void;
  onEditCart: () => void;
}

type Stage = "review" | "submitting" | "done";

export function OrderReviewScreen({
  outletId, outletName, visitId, cart, sync, flushNow, onSubmitted, onEditCart
}: Props): JSX.Element {
  const { theme } = useTheme();
  const currency = useOrgCurrency();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [stage, setStage] = useState<Stage>("review");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const totalCents = cart.reduce((sum, l) => sum + l.unitPriceCents * l.quantity, 0);

  async function handleSubmit() {
    setError(null);
    setStage("submitting");

    const orderId = `order_mob_${visitId ?? "ad_hoc"}_${Date.now()}`;
    const lines = cart.map((l) => ({ productId: l.productId, quantity: l.quantity }));

    // Online-first attempt. If it fails (network), queue offline.
    try {
      const result = await apiClient.createFieldOrder({
        id: orderId,
        outletId,
        source: "online",
        lines
      });
      setStage("done");
      // Let a Visit screen underneath us confirm the order + invite completion.
      emitOrderCreated(outletId);
      onSubmitted({ orderId: result.id, mode: "online" });
      return;
    } catch (onlineErr) {
      // Fall back to offline queue. Mobile sync engine will retry on reconnect.
      try {
        sync.enqueueMutation({
          idempotencyKey: orderId,
          type: "order.create",
          payload: {
            id: orderId,
            outletId,
            source: "offline",
            lines,
            notes: notes.trim() || undefined,
            visitId: visitId ?? undefined
          }
        });
        // Best-effort immediate flush — if still offline, the next reconnect
        // (or pull-to-refresh on RouteToday) will retry. Failure is silent.
        void flushNow().catch(() => undefined);
        setStage("done");
        emitOrderCreated(outletId);
        onSubmitted({ orderId, mode: "offline" });
      } catch {
        const detail = onlineErr instanceof Error ? onlineErr.message : "submit failed";
        setError(`Couldn't save this order: ${detail}`);
        setStage("review");
      }
    }
  }

  if (stage === "done") {
    return (
      <View style={styles.shell}>
        <View style={styles.successBox}>
          <Text style={styles.successTitle}>Order saved</Text>
          <Text style={styles.muted}>You'll see it in your order history.</Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.shell} contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: 200 }}>
      <View style={styles.headerBlock}>
        <Text style={styles.heading}>Review order</Text>
        <Text style={styles.outlet}>{outletName}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Items</Text>
        {cart.map((line) => (
          <View key={line.productId} style={styles.lineRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.lineName}>{line.name}</Text>
              <Text style={styles.lineMeta}>
                {line.quantity} × {formatMinor(line.unitPriceCents, currency)}
              </Text>
            </View>
            <Text style={styles.lineTotal}>{formatMinor(line.unitPriceCents * line.quantity, currency)}</Text>
          </View>
        ))}
        <TouchableOpacity onPress={onEditCart} style={styles.editBtn}>
          <Text style={styles.editBtnText}>← Edit items</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Notes (optional)</Text>
        <TextInput
          style={styles.notesInput}
          value={notes}
          onChangeText={setNotes}
          multiline
          placeholder="Delivery instructions, customer comments…"
          placeholderTextColor={theme.color.textMuted}
        />
      </View>

      <View style={styles.totalBox}>
        <Text style={styles.totalLabel}>Order total</Text>
        <Text style={styles.totalAmount}>{formatMinor(totalCents, currency)}</Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TouchableOpacity
        style={[styles.submitBtn, stage === "submitting" && styles.submitBtnDisabled]}
        disabled={stage === "submitting"}
        onPress={() => void handleSubmit()}
      >
        {stage === "submitting"
          ? <ActivityIndicator color={theme.color.textOnPrimary} />
          : <Text style={styles.submitBtnText}>Submit order</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const makeStyles = (theme: Theme) => StyleSheet.create({
  shell: { flex: 1, backgroundColor: theme.color.background },
  headerBlock: { marginBottom: theme.spacing.lg },
  heading: { ...theme.font.title },
  outlet: { ...theme.font.caption, marginTop: theme.spacing.xs },
  section: { marginBottom: theme.spacing.lg },
  sectionLabel: { ...theme.font.label, marginBottom: theme.spacing.sm, textTransform: "uppercase" },
  lineRow: {
    flexDirection: "row",
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.color.border
  },
  lineName: { ...theme.font.bodyStrong },
  lineMeta: { ...theme.font.caption, marginTop: 2 },
  lineTotal: { ...theme.font.bodyStrong, marginLeft: theme.spacing.md, alignSelf: "center" },
  editBtn: { paddingVertical: theme.spacing.sm },
  editBtnText: { color: theme.color.primary, fontWeight: "600", fontSize: 13 },
  notesInput: {
    minHeight: 80,
    padding: 12,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.color.borderStrong,
    backgroundColor: theme.color.surface,
    color: theme.color.textPrimary,
    fontSize: 14,
    textAlignVertical: "top"
  },
  totalBox: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: theme.color.primarySoft,
    padding: theme.spacing.md,
    borderRadius: theme.radius.sm,
    marginBottom: theme.spacing.lg
  },
  totalLabel: { color: theme.color.textPrimary, fontWeight: "600" },
  totalAmount: { color: theme.color.primary, fontWeight: "700", fontSize: 18 },
  error: { color: theme.color.danger, marginBottom: theme.spacing.md },
  submitBtn: {
    backgroundColor: theme.color.primary,
    padding: 14,
    borderRadius: theme.radius.sm,
    alignItems: "center"
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: theme.color.textOnPrimary, fontWeight: "600", fontSize: 15 },
  successBox: {
    margin: theme.spacing.lg,
    padding: theme.spacing.xl,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.successSoft,
    borderWidth: 1,
    borderColor: "rgba(31, 157, 85, 0.2)",
    alignItems: "center"
  },
  successTitle: { ...theme.font.bodyStrong, color: theme.color.success, marginBottom: theme.spacing.xs },
  muted: { ...theme.font.caption, textAlign: "center" }
});
