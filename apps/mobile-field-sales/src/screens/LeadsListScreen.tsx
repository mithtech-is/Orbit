import { useCallback, useMemo, useState, type JSX } from "react";
import { View, Text, FlatList, RefreshControl, StyleSheet, ActivityIndicator, TouchableOpacity, Modal, Pressable, Alert } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { apiClient } from "../api-service";
import type { LeadSummary, OutletSummary } from "@orbit/api-client";
import { useAuth } from "../auth/auth-context";
import { useTheme } from "../theme-context";
import type { Theme } from "../theme";
import { EmptyState } from "../components/EmptyState";

/** Statuses a rep can move their own lead through (mirrors the backend allow-list). */
const STATUS_OPTIONS = ["new", "contacted", "qualified", "in_progress", "nurture", "won", "lost"];

function statusColor(status: string, theme: Theme): { bg: string; fg: string } {
  if (status === "won") return { bg: theme.color.successSoft, fg: theme.color.success };
  if (status === "qualified" || status === "in_progress") return { bg: theme.color.primarySoft, fg: theme.color.primary };
  if (status === "lost") return { bg: theme.color.dangerSoft, fg: theme.color.danger };
  if (status === "nurture" || status === "contacted") return { bg: theme.color.warningSoft, fg: theme.color.warning };
  return { bg: theme.color.surfaceMuted, fg: theme.color.textSecondary };
}

function priorityColor(p: number, theme: Theme): { bg: string; fg: string } {
  if (p <= 1) return { bg: theme.color.dangerSoft, fg: theme.color.danger };
  if (p <= 3) return { bg: theme.color.warningSoft, fg: theme.color.warning };
  return { bg: theme.color.surfaceMuted, fg: theme.color.textSecondary };
}

export function LeadsListScreen(): JSX.Element {
  const { theme } = useTheme();
  const { session } = useAuth();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [leads, setLeads] = useState<LeadSummary[] | null>(null);
  const [outlets, setOutlets] = useState<OutletSummary[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<LeadSummary | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const load = useCallback(async () => {
    setError(null);
    try {
      const [l, o] = await Promise.all([
        apiClient.listLeads(),
        apiClient.listOutlets().catch(() => null)
      ]);
      setLeads(l.items);
      if (o) setOutlets(o.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load leads");
      setLeads([]);
    }
  }, []);

  // Reload whenever the screen regains focus, so changes made elsewhere
  // (status updates, reassignments, deletes) are never shown stale.
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  function outletName(id: string): string {
    return outlets.find((o) => o.id === id)?.name ?? id;
  }

  async function changeStatus(lead: LeadSummary, status: string) {
    if (status === lead.status) { setEditing(null); return; }
    setSaving(true);
    try {
      await apiClient.updateLeadStatus(lead.id, status);
      setEditing(null);
      await load();
    } catch (err) {
      Alert.alert("Couldn't update status", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setSaving(false);
    }
  }

  // Reps own a lead when it's assigned to them — only then can they move its status.
  if (leads === null) {
    return <View style={styles.center}><ActivityIndicator color={theme.color.primary} /></View>;
  }

  // Reps only see (and manage) leads assigned to them.
  const myLeads = leads.filter((l) => Boolean(session?.userId) && l.assignedUserId === session?.userId);
  const filters = ["all", ...Array.from(new Set(myLeads.map((l) => l.status)))];
  const visible = filterStatus === "all" ? myLeads : myLeads.filter((l) => l.status === filterStatus);

  return (
    <>
      <FlatList
        style={styles.shell}
        data={visible}
        keyExtractor={(l) => l.id}
        refreshControl={<RefreshControl tintColor={theme.color.primary} refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>My leads</Text>
            <Text style={styles.subtitle}>
              {myLeads.length > 0 ? `${myLeads.length} assigned to you · tap one to update its status` : "Leads assigned to you appear here."}
            </Text>
            {myLeads.length > 0 ? (
              <View style={styles.filterRow}>
                {filters.map((f) => {
                  const active = filterStatus === f;
                  return (
                    <TouchableOpacity key={f} style={[styles.filterChip, active && styles.filterChipActive]} onPress={() => setFilterStatus(f)} activeOpacity={0.8}>
                      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{f === "all" ? "All" : f.replace(/_/g, " ")}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>
        }
        ListEmptyComponent={
          <EmptyState icon="🎯" title={filterStatus === "all" ? "No leads yet" : "None in this filter"} message="Leads assigned to you appear here — tap one to move it along your pipeline." />
        }
        renderItem={({ item }) => {
          const c = statusColor(item.status, theme);
          const p = priorityColor(item.priority, theme);
          return (
            <TouchableOpacity style={[styles.row, styles.rowOwned]} activeOpacity={0.7} onPress={() => setEditing(item)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.rowMeta} numberOfLines={1}>{outletName(item.outletId)}</Text>
                <View style={styles.chipRow}>
                  <View style={[styles.statusChip, { backgroundColor: c.bg }]}>
                    <Text style={[styles.statusChipText, { color: c.fg }]}>{item.status.replace(/_/g, " ")}</Text>
                  </View>
                  <View style={[styles.prioChip, { backgroundColor: p.bg }]}>
                    <Text style={[styles.prioChipText, { color: p.fg }]}>P{item.priority}</Text>
                  </View>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.color.textMuted} />
            </TouchableOpacity>
          );
        }}
      />

      {/* Status picker — only reachable for the rep's own leads. */}
      <Modal visible={editing !== null} transparent animationType="slide" onRequestClose={() => setEditing(null)}>
        <Pressable style={styles.backdrop} onPress={() => !saving && setEditing(null)}>
          <Pressable style={styles.sheet} onPress={() => undefined}>
            <View style={styles.sheetGrip} />
            <Text style={styles.sheetTitle} numberOfLines={1}>{editing?.name}</Text>
            <Text style={styles.sheetSub}>Update lead status</Text>
            {STATUS_OPTIONS.map((s) => {
              const active = editing?.status === s;
              const c = statusColor(s, theme);
              return (
                <TouchableOpacity key={s} style={[styles.option, active ? styles.optionActive : null]} disabled={saving} onPress={() => editing && void changeStatus(editing, s)}>
                  <View style={[styles.optionDot, { backgroundColor: c.fg }]} />
                  <Text style={[styles.optionText, active ? styles.optionTextActive : null]}>{s.replace(/_/g, " ")}</Text>
                  {active ? <Ionicons name="checkmark" size={18} color={theme.color.primary} /> : null}
                </TouchableOpacity>
              );
            })}
            {saving ? <ActivityIndicator color={theme.color.primary} style={{ marginTop: 8 }} /> : null}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const makeStyles = (theme: Theme) => StyleSheet.create({
  shell: { flex: 1, backgroundColor: theme.color.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.color.background },
  header: { padding: theme.spacing.lg, paddingBottom: theme.spacing.md },
  title: { ...theme.font.title },
  subtitle: { ...theme.font.caption, marginTop: theme.spacing.xs },
  error: { color: theme.color.danger, marginTop: theme.spacing.sm, fontSize: 13 },
  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: theme.spacing.md },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.color.border, backgroundColor: theme.color.surface },
  filterChipActive: { backgroundColor: theme.color.primary, borderColor: theme.color.primary },
  filterChipText: { fontSize: 12, fontWeight: "600", color: theme.color.textSecondary, textTransform: "capitalize" },
  filterChipTextActive: { color: theme.color.textOnPrimary },
  row: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: theme.spacing.md, paddingHorizontal: theme.spacing.md,
    marginHorizontal: theme.spacing.lg, marginBottom: theme.spacing.sm,
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.color.border, ...theme.elevation.sm
  },
  rowOwned: { borderColor: theme.color.primaryBorder },
  rowTitle: { ...theme.font.bodyStrong, flexShrink: 1 },
  rowMeta: { ...theme.font.caption, marginTop: 2 },
  chipRow: { flexDirection: "row", gap: 6, marginTop: 8 },
  statusChip: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: theme.radius.pill },
  statusChipText: { fontSize: 11, fontWeight: "700", textTransform: "capitalize" },
  prioChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: theme.radius.pill },
  prioChipText: { fontSize: 11, fontWeight: "700" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: theme.color.surface, borderTopLeftRadius: theme.radius.lg, borderTopRightRadius: theme.radius.lg,
    padding: theme.spacing.lg, paddingBottom: theme.spacing.xl, gap: 2
  },
  sheetGrip: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: theme.color.border, marginBottom: theme.spacing.md },
  sheetTitle: { ...theme.font.heading },
  sheetSub: { ...theme.font.caption, marginBottom: theme.spacing.sm },
  option: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: theme.color.divider },
  optionActive: {},
  optionDot: { width: 8, height: 8, borderRadius: 4 },
  optionText: { flex: 1, fontSize: 15, fontWeight: "500", color: theme.color.textPrimary, textTransform: "capitalize" },
  optionTextActive: { color: theme.color.primary, fontWeight: "700" }
});
