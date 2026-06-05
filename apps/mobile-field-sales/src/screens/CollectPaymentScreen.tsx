import { useCallback, useEffect, useMemo, useState, type JSX } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { apiClient } from "../api-service";
import { useTheme } from "../theme-context";
import type { Theme } from "../theme";
import { formatMinor, currencySymbol, useOrgCurrency } from "../money";

interface Props {
  outletId: string;
  outletName: string;
  onDone: () => void;
}

interface Ledger {
  orderedCents: number;
  paidCents: number;
  outstandingCents: number;
  items: Array<{ id: string; amountCents: number; method: string; note: string | null; createdAt: string }>;
}

const METHODS: { key: string; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "cash", label: "Cash", icon: "cash-outline" },
  { key: "upi", label: "UPI", icon: "qr-code-outline" },
  { key: "card", label: "Card", icon: "card-outline" },
  { key: "cheque", label: "Cheque", icon: "document-text-outline" },
  { key: "bank", label: "Bank", icon: "business-outline" }
];

export function CollectPaymentScreen({ outletId, outletName, onDone }: Props): JSX.Element {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const currency = useOrgCurrency();
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLedger(await apiClient.getOutletLedger(outletId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load the outlet balance");
    }
  }, [outletId]);

  useEffect(() => { void load(); }, [load]);

  async function submit() {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) { setError("Enter an amount greater than zero."); return; }
    setError(null);
    setSaving(true);
    try {
      await apiClient.recordPayment({ outletId, amountCents: Math.round(value * 100), method, note: note.trim() || undefined });
      setAmount("");
      setNote("");
      await load();
      Alert.alert("Payment recorded", `${formatMinor(Math.round(value * 100), currency)} collected from ${outletName}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't record the payment. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.shell} contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Collect payment</Text>
      <Text style={styles.subtitle}>{outletName}</Text>

      {/* Live balance from the server — what's still to collect, plus collected
          and ordered totals for this outlet. */}
      <View style={[styles.summaryCard, ledger && ledger.outstandingCents <= 0 ? styles.summaryCardSettled : null]}>
        <Text style={styles.summaryLabel}>{ledger && ledger.outstandingCents <= 0 ? "ALL SETTLED" : "PENDING · TO COLLECT"}</Text>
        <Text style={styles.summaryHero}>
          {ledger ? (ledger.outstandingCents <= 0 ? "✓ Nothing due" : formatMinor(ledger.outstandingCents, currency)) : "—"}
        </Text>
        <View style={styles.summaryRow}>
          <View style={styles.summaryStat}>
            <Text style={styles.summaryStatValue}>{ledger ? formatMinor(ledger.paidCents, currency) : "—"}</Text>
            <Text style={styles.summaryStatLabel}>Collected</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryStat}>
            <Text style={styles.summaryStatValue}>{ledger ? formatMinor(ledger.orderedCents, currency) : "—"}</Text>
            <Text style={styles.summaryStatLabel}>Ordered total</Text>
          </View>
        </View>
      </View>

      {ledger && ledger.outstandingCents > 0 ? (
        <TouchableOpacity style={styles.fillBtn} onPress={() => setAmount((ledger.outstandingCents / 100).toString())} activeOpacity={0.85}>
          <Ionicons name="flash-outline" size={15} color={theme.color.primary} />
          <Text style={styles.fillBtnText}>Collect full outstanding ({formatMinor(ledger.outstandingCents, currency)})</Text>
        </TouchableOpacity>
      ) : null}

      <Text style={styles.label}>Amount</Text>
      <View style={styles.amountWrap}>
        <Text style={styles.amountSymbol}>{currencySymbol(currency).trim()}</Text>
        <TextInput
          style={styles.amountInput}
          value={amount}
          onChangeText={(t) => setAmount(t.replace(/[^0-9.]/g, ""))}
          keyboardType="decimal-pad"
          placeholder="0.00"
          placeholderTextColor={theme.color.textMuted}
          autoFocus
        />
      </View>

      <Text style={styles.label}>Method</Text>
      <View style={styles.methods}>
        {METHODS.map((m) => {
          const active = method === m.key;
          return (
            <TouchableOpacity key={m.key} style={[styles.method, active && styles.methodActive]} onPress={() => setMethod(m.key)} activeOpacity={0.85}>
              <Ionicons name={m.icon} size={16} color={active ? theme.color.primary : theme.color.textSecondary} />
              <Text style={[styles.methodText, active && styles.methodTextActive]}>{m.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.label}>Note (optional)</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={note}
        onChangeText={setNote}
        multiline
        placeholder="Reference number, remarks…"
        placeholderTextColor={theme.color.textMuted}
      />

      {error ? (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle-outline" size={16} color={theme.color.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <TouchableOpacity style={[styles.submit, saving && styles.submitDisabled]} onPress={submit} disabled={saving} activeOpacity={0.85}>
        {saving ? <ActivityIndicator color={theme.color.textOnPrimary} /> : <Text style={styles.submitText}>Record payment</Text>}
      </TouchableOpacity>
      <TouchableOpacity style={styles.doneBtn} onPress={onDone}><Text style={styles.doneText}>Done</Text></TouchableOpacity>

      {ledger && ledger.items.length > 0 ? (
        <>
          <Text style={[styles.label, { marginTop: theme.spacing.lg }]}>Recent payments</Text>
          {ledger.items.slice(0, 8).map((p) => (
            <View key={p.id} style={styles.histRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.histAmount}>{formatMinor(p.amountCents, currency)}</Text>
                <Text style={styles.histMeta}>{p.method}{p.note ? ` · ${p.note}` : ""} · {new Date(p.createdAt).toLocaleDateString()}</Text>
              </View>
              <Ionicons name="checkmark-circle" size={18} color={theme.color.success} />
            </View>
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}

const makeStyles = (theme: Theme) => StyleSheet.create({
  shell: { flex: 1, backgroundColor: theme.color.background },
  title: { ...theme.font.title },
  subtitle: { ...theme.font.caption, marginTop: 2, marginBottom: theme.spacing.lg },
  summaryCard: {
    backgroundColor: theme.color.surface, borderRadius: theme.radius.lg,
    borderWidth: 1, borderColor: theme.color.warning,
    padding: theme.spacing.lg, ...theme.elevation.sm
  },
  summaryCardSettled: { borderColor: theme.color.success },
  summaryLabel: { ...theme.font.label, fontSize: 11, letterSpacing: 1, color: theme.color.textSecondary, textTransform: "uppercase" },
  summaryHero: { fontSize: 32, fontWeight: "800", color: theme.color.textPrimary, marginTop: 4 },
  summaryRow: { flexDirection: "row", alignItems: "center", marginTop: theme.spacing.md, borderTopWidth: 1, borderTopColor: theme.color.border, paddingTop: theme.spacing.md },
  summaryStat: { flex: 1, alignItems: "center" },
  summaryStatValue: { fontSize: 16, fontWeight: "700", color: theme.color.textPrimary },
  summaryStatLabel: { ...theme.font.caption, marginTop: 2 },
  summaryDivider: { width: 1, alignSelf: "stretch", backgroundColor: theme.color.border },
  fillBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    marginTop: theme.spacing.md, paddingVertical: 10, borderRadius: theme.radius.md,
    backgroundColor: theme.color.primarySoft, borderWidth: 1, borderColor: theme.color.primaryBorder
  },
  fillBtnText: { color: theme.color.primary, fontWeight: "700", fontSize: 13 },
  label: { ...theme.font.label, textTransform: "uppercase", marginTop: theme.spacing.lg, marginBottom: theme.spacing.sm },
  amountWrap: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.borderStrong,
    borderRadius: theme.radius.md, paddingHorizontal: theme.spacing.md
  },
  amountSymbol: { fontSize: 22, fontWeight: "700", color: theme.color.textSecondary },
  amountInput: { flex: 1, fontSize: 24, fontWeight: "700", color: theme.color.textPrimary, paddingVertical: 12 },
  methods: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm },
  method: {
    flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.color.border, backgroundColor: theme.color.surface
  },
  methodActive: { borderColor: theme.color.primary, backgroundColor: theme.color.primarySoft },
  methodText: { fontSize: 13, fontWeight: "600", color: theme.color.textSecondary },
  methodTextActive: { color: theme.color.primary },
  input: {
    backgroundColor: theme.color.surface, color: theme.color.textPrimary,
    borderWidth: 1, borderColor: theme.color.borderStrong, borderRadius: theme.radius.md, padding: 12, fontSize: 15
  },
  multiline: { minHeight: 70, textAlignVertical: "top" },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: theme.spacing.md, padding: theme.spacing.sm, borderRadius: theme.radius.sm, backgroundColor: theme.color.dangerSoft },
  errorText: { color: theme.color.danger, fontSize: 13, flex: 1 },
  submit: { backgroundColor: theme.color.primary, padding: 15, borderRadius: theme.radius.md, alignItems: "center", marginTop: theme.spacing.lg, ...theme.elevation.glow },
  submitDisabled: { opacity: 0.6 },
  submitText: { color: theme.color.textOnPrimary, fontWeight: "700", fontSize: 15 },
  doneBtn: { alignItems: "center", paddingVertical: theme.spacing.md, marginTop: 4 },
  doneText: { color: theme.color.textSecondary, fontWeight: "600", fontSize: 14 },
  histRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: theme.color.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.color.border,
    paddingVertical: theme.spacing.md, paddingHorizontal: theme.spacing.md, marginBottom: theme.spacing.sm
  },
  histAmount: { ...theme.font.bodyStrong },
  histMeta: { ...theme.font.caption, marginTop: 2, textTransform: "capitalize" }
});
