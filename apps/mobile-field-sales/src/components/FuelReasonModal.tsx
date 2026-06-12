import { useEffect, useMemo, useState, type JSX } from "react";
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { useTheme } from "../theme-context";
import type { Theme } from "../theme";

interface FuelSummary {
  expenseId: string;
  actualKm: number;
  plannedKm: number;
  deviationKm: number;
  amountCents: number;
  deviationAmountCents: number;
  overLimit: boolean;
}

interface Props {
  visible: boolean;
  summary: FuelSummary | null;
  /** Called when the rep submits a reason. Receives expenseId + reason. */
  onSubmit: (expenseId: string, reason: string) => Promise<void> | void;
  /** Dismiss without submitting (the expense stays pending with no reason). */
  onSkip: () => void;
}

function rupees(cents: number): string {
  return `₹${(cents / 100).toFixed(2)}`;
}

/**
 * Bottom-sheet modal shown when the rep stops a session with a deviation or
 * over-limit fuel expense. The rep can either explain (preferred) or skip and
 * let the manager review without a reason — but the prompt is unmissable so
 * skipping is a deliberate choice, not an oversight.
 */
export function FuelReasonModal({ visible, summary, onSubmit, onSkip }: Props): JSX.Element | null {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Reset state each time the modal opens for a new expense.
  useEffect(() => {
    if (visible) {
      setReason("");
      setSubmitting(false);
    }
  }, [visible, summary?.expenseId]);

  if (!summary) return null;

  async function handleSubmit() {
    const trimmed = reason.trim();
    if (trimmed.length < 5 || !summary) return;
    setSubmitting(true);
    try {
      await onSubmit(summary.expenseId, trimmed);
    } finally {
      setSubmitting(false);
    }
  }

  const headline = summary.deviationKm > 0
    ? "Off-plan today"
    : summary.overLimit
      ? "Over the daily fuel limit"
      : "Quick check";

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onSkip}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <Text style={styles.title}>{headline}</Text>
          <Text style={styles.subtitle}>
            Your manager needs a quick note before approving this expense. Anything that
            actually happened — traffic, road closure, a customer in a new location — works.
          </Text>

          <View style={styles.summary}>
            <SummaryRow label="Actual distance" value={`${summary.actualKm.toFixed(2)} km`} />
            <SummaryRow label="Planned" value={`${summary.plannedKm.toFixed(2)} km`} />
            {summary.deviationKm > 0 ? (
              <SummaryRow
                label="Off-plan"
                value={`+${summary.deviationKm.toFixed(2)} km · ${rupees(summary.deviationAmountCents)}`}
                emphasis
              />
            ) : null}
            <SummaryRow label="Total fuel" value={rupees(summary.amountCents)} bold />
          </View>

          <TextInput
            style={styles.input}
            placeholder="What happened? (minimum 5 characters)"
            placeholderTextColor={theme.color.textSecondary}
            value={reason}
            onChangeText={setReason}
            multiline
            numberOfLines={3}
            autoFocus
          />

          <View style={styles.actions}>
            <TouchableOpacity style={styles.skip} onPress={onSkip} disabled={submitting}>
              <Text style={styles.skipText}>Skip</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.submit, (reason.trim().length < 5 || submitting) ? styles.submitDisabled : null]}
              onPress={() => void handleSubmit()}
              disabled={reason.trim().length < 5 || submitting}
            >
              {submitting
                ? <ActivityIndicator color={theme.color.textOnPrimary} />
                : <Text style={styles.submitText}>Submit reason</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function SummaryRow({ label, value, emphasis, bold }: { label: string; value: string; emphasis?: boolean; bold?: boolean }): JSX.Element {
  const { theme } = useTheme();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 }}>
      <Text style={{ color: theme.color.textSecondary, fontSize: 13 }}>{label}</Text>
      <Text style={{
        color: emphasis ? theme.color.warning : theme.color.textPrimary,
        fontSize: 13,
        fontWeight: bold || emphasis ? "700" : "500"
      }}>{value}</Text>
    </View>
  );
}

const makeStyles = (theme: Theme) => StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: {
    backgroundColor: theme.color.surface,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  },
  grabber: { alignSelf: "center", width: 36, height: 4, backgroundColor: theme.color.border, borderRadius: 2, marginBottom: 12 },
  title: { ...theme.font.heading, fontSize: 18 },
  subtitle: { ...theme.font.caption, marginTop: 4, marginBottom: theme.spacing.md, lineHeight: 18 },
  summary: {
    backgroundColor: theme.color.primarySoft,
    borderRadius: theme.radius.sm,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  input: {
    minHeight: 80,
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: theme.radius.sm,
    padding: theme.spacing.sm,
    color: theme.color.textPrimary,
    backgroundColor: theme.color.background,
    textAlignVertical: "top",
  },
  actions: { flexDirection: "row", marginTop: theme.spacing.md, gap: theme.spacing.sm },
  skip: { flex: 1, padding: 14, borderRadius: theme.radius.sm, alignItems: "center", borderWidth: 1, borderColor: theme.color.border },
  skipText: { ...theme.font.bodyStrong, color: theme.color.textSecondary, fontSize: 14 },
  submit: { flex: 1.4, padding: 14, borderRadius: theme.radius.sm, alignItems: "center", backgroundColor: theme.color.primary },
  submitDisabled: { opacity: 0.5 },
  submitText: { color: theme.color.textOnPrimary, fontWeight: "700", fontSize: 14 },
});
