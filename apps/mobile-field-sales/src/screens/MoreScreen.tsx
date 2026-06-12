import { useEffect, useMemo, useState, type JSX } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, Linking, Alert, Modal, ActivityIndicator, StyleSheet, Platform, NativeModules } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, type ThemeMode } from "../theme-context";
import type { Theme } from "../theme";
import { useAuth } from "../auth/auth-context";
import { apiClient } from "../api-service";
import {
  requestForegroundLocationPermission,
  requestBackgroundLocationPermission,
  probeForegroundLocationPermission,
  probeBackgroundLocationPermission
} from "../tracking/location-probes";

interface Props {
  onSignOut: () => void | Promise<void>;
}

// Mirror the LAN-IP auto-detection in api-service.ts: derive the dashboard host
// from the live Metro connection so the "open dashboard" links work on any Wi-Fi
// (the PC's IP changes per network). EXPO_PUBLIC_WEB_DASHBOARD_URL overrides it.
function getFallbackWebUrl(): string {
  const scriptURL = NativeModules.SourceCode?.scriptURL as string | undefined;
  const match = scriptURL?.match(/^https?:\/\/([^:/]+)/);
  return match ? `http://${match[1]}:3001` : "http://localhost:3001";
}

const WEB_BASE = process.env.EXPO_PUBLIC_WEB_DASHBOARD_URL ?? getFallbackWebUrl();

interface WebLink {
  label: string;
  path: string;
  desc: string;
  /** User must have at least one of these permissions to see this link. */
  requiredAnyOf: string[];
}

// Permission strings mirror apps/web-dashboard/app/navigation.tsx so the same
// admin tools appear on both surfaces for the same roles. Reps see none of
// these by default — only managers / ops / admins surface them.
const WEB_LINKS: WebLink[] = [
  { label: "Live team map",         path: "/live-map",              desc: "Real-time positions of reps on shift",         requiredAnyOf: ["tracking:view_live"] },
  { label: "Route planner",         path: "/route-plans",           desc: "Build and assign optimised routes",            requiredAnyOf: ["route:plan"] },
  { label: "Reports",               path: "/reports",               desc: "Org metrics and per-rep activity",             requiredAnyOf: ["report:read"] },
  { label: "Team scorecard",        path: "/team-scorecard",        desc: "Per-rep visits + orders + revenue",            requiredAnyOf: ["report:read"] },
  { label: "Audit log",             path: "/audit-log",             desc: "Tamper-evident record of every change",        requiredAnyOf: ["audit:read"] },
  { label: "Sync issues",           path: "/sync-conflicts",        desc: "Offline mutations that need review",           requiredAnyOf: ["audit:read"] },
  { label: "Territories",           path: "/territories",           desc: "Define geographic areas for routing",          requiredAnyOf: ["territory:manage"] },
  { label: "Users",                 path: "/users",                 desc: "Invite reps, reset passwords, sign in as them", requiredAnyOf: ["user:manage"] },
  { label: "Organisation settings", path: "/organisation-settings", desc: "Working hours, check-in radius, currency",    requiredAnyOf: ["organisation:manage"] }
];

export function MoreScreen({ onSignOut }: Props): JSX.Element {
  const { theme, mode, setMode } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [fg, setFg] = useState<string>("unknown");
  const [bg, setBg] = useState<string>("unknown");
  const { session, hasAny } = useAuth();

  // Location-sharing (consent) state. `sharing=true` means consent granted +
  // not revoked. Reps can turn it OFF here; during working hours a reason is
  // required (server enforces, modal collects it).
  const [sharing, setSharing] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [reasonModal, setReasonModal] = useState(false);
  const [reason, setReason] = useState("");

  const isRep = hasAny(["tracking:send"]);

  async function refreshSharing() {
    try {
      const sessions = await apiClient.listSessions();
      // If we can't read consent directly, infer from an active session +
      // fall back to "on" unless a revoke is known. Simplest reliable signal:
      // an active session implies sharing is on.
      const active = sessions.items.some((s) => s.userId === session?.userId && s.status === "active");
      setSharing((prev) => (prev === null ? active : prev));
    } catch {
      setSharing((prev) => prev);
    }
  }

  async function turnOn() {
    setBusy(true);
    try {
      await apiClient.recordConsent({ granted: true });
      setSharing(true);
      Alert.alert("Location sharing on", "You can now start a work session from Home.");
    } catch (e) {
      Alert.alert("Couldn't turn on sharing", e instanceof Error ? e.message : "Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff(withReason?: string) {
    setBusy(true);
    try {
      await apiClient.revokeConsent(withReason);
      setSharing(false);
      setReasonModal(false);
      setReason("");
      Alert.alert("Location sharing off", "Your active session (if any) has been stopped.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      // 422 reason_required → open the reason modal (within working hours).
      if (/422|reason_required|reason/i.test(msg)) {
        setReasonModal(true);
      } else {
        Alert.alert("Couldn't turn off sharing", msg || "Try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  // Filter admin links by the logged-in user's permissions. A
  // field_sales_representative (lead:read, outlet:read, visit:write,
  // tracking:send, order:create) sees none of these — the whole "Admin tools"
  // section then hides itself below.
  const visibleLinks = WEB_LINKS.filter((link) => hasAny(link.requiredAnyOf));

  async function refresh() {
    setFg(await probeForegroundLocationPermission());
    setBg(await probeBackgroundLocationPermission());
  }

  useEffect(() => { void refresh(); void refreshSharing(); }, []);

  async function askForeground() {
    const result = await requestForegroundLocationPermission();
    setFg(result);
    if (result === "denied") {
      Alert.alert(
        "Location permission denied",
        "Orbit needs location access during work sessions to verify outlet check-ins and let your manager see your route progress. You can grant it later in Settings.",
        [{ text: "OK" }]
      );
    }
  }

  async function askBackground() {
    if (fg !== "granted") {
      Alert.alert("Grant location first", "Background tracking requires foreground location permission first. Tap \"Allow location\" above.");
      return;
    }
    const result = await requestBackgroundLocationPermission();
    setBg(result);
    if (result !== "granted" && Platform.OS === "android") {
      Alert.alert(
        "Background tracking",
        "Android needs you to choose \"Allow all the time\" in Settings. Tap \"Open device settings\" below.",
        [
          { text: "Open device settings", onPress: () => void Linking.openSettings().catch(() => undefined) },
          { text: "Not now" }
        ]
      );
    }
  }

  async function openWeb(path: string) {
    const url = `${WEB_BASE}${path}`;
    const supported = await Linking.canOpenURL(url);
    if (!supported) {
      Alert.alert("Cannot open link", `This device couldn't open ${url}.`);
      return;
    }
    await Linking.openURL(url);
  }

  return (
    <ScrollView style={styles.shell} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={styles.header}>
        <Text style={styles.title}>More</Text>
        <Text style={styles.subtitle}>Permissions, web admin tools, and account.</Text>
      </View>

      <Section title="Appearance" styles={styles}>
        <Text style={styles.note}>Choose how Orbit looks. &quot;Auto&quot; follows your device theme.</Text>
        <AppearanceToggle mode={mode} setMode={setMode} theme={theme} styles={styles} />
      </Section>

      {isRep ? (
        <Section title="Location tracking consent" styles={styles}>
          <View style={styles.permRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.permLabel}>Allow location tracking during work sessions</Text>
              <Text style={styles.note}>
                {sharing === false
                  ? "Off — the Start button on your Home tab is disabled until you turn this on. You won't appear on the live map."
                  : "On — your Home tab's Start button can begin a work session. Your manager sees your position only while that session is active; Stop ends sharing."}
              </Text>
            </View>
            {busy ? (
              <ActivityIndicator color={theme.color.primary} />
            ) : sharing === false ? (
              <TouchableOpacity style={styles.permBtn} onPress={() => void turnOn()}>
                <Text style={styles.permBtnText}>Turn on</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.permBtnOff} onPress={() => void turnOff()}>
                <Text style={styles.permBtnOffText}>Turn off</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.note}>
            During working hours you can still turn it off for a genuine reason — you'll be asked to write a short note that your manager can see.
          </Text>
        </Section>
      ) : null}

      <Section title="Location permissions" styles={styles}>
        <PermissionRow label="Foreground location" status={fg} action={fg === "granted" ? null : { label: "Allow location", onPress: askForeground }} theme={theme} styles={styles} />
        <PermissionRow
          label="Background tracking"
          status={bg}
          action={bg === "granted" ? null : { label: fg === "granted" ? "Allow background" : "Grant foreground first", onPress: askBackground }}
          theme={theme}
          styles={styles}
        />
        <Text style={styles.note}>
          Background tracking only runs during an active work session and stops when you sign out. {Platform.OS === "android" ? "Android may require \"Allow all the time\" in device settings." : ""}
        </Text>
      </Section>

      {visibleLinks.length > 0 ? (
        <Section title="Admin tools (opens in browser)" styles={styles}>
          <Text style={styles.note}>
            These manager / admin features live on the web dashboard. Tap one to open it in your phone's browser — sign in with the same credentials.
          </Text>
          {visibleLinks.map((link) => (
            <TouchableOpacity key={link.path} style={styles.linkRow} onPress={() => void openWeb(link.path)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.linkLabel}>{link.label}</Text>
                <Text style={styles.linkDesc}>{link.desc}</Text>
              </View>
              <Text style={styles.linkChevron}>↗</Text>
            </TouchableOpacity>
          ))}
        </Section>
      ) : null}

      <Section title="Account" styles={styles}>
        {session ? (
          <View style={styles.accountInfo}>
            <Text style={styles.accountName}>{session.name || session.email}</Text>
            <Text style={styles.accountMeta}>{session.role.replace(/_/g, " ")}</Text>
          </View>
        ) : null}
        <TouchableOpacity style={styles.signOut} onPress={() => void onSignOut()}>
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </Section>

      {/* Reason modal — shown when turning sharing off during working hours. */}
      <Modal visible={reasonModal} transparent animationType="fade" onRequestClose={() => setReasonModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Why are you turning off location sharing?</Text>
            <Text style={styles.note}>
              You're within working hours. Please give a short reason — your manager will see it.
            </Text>
            <TextInput
              style={styles.reasonInput}
              placeholder="e.g. Phone battery critical, personal emergency…"
              placeholderTextColor={theme.color.textMuted}
              value={reason}
              onChangeText={setReason}
              multiline
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => { setReasonModal(false); setReason(""); }}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirm, reason.trim().length < 5 && { opacity: 0.5 }]}
                disabled={reason.trim().length < 5 || busy}
                onPress={() => void turnOff(reason.trim())}
              >
                <Text style={styles.modalConfirmText}>{busy ? "Saving…" : "Turn off & send reason"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

type MoreStyles = ReturnType<typeof makeStyles>;

function Section({ title, children, styles }: { title: string; children: React.ReactNode; styles: MoreStyles }): JSX.Element {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

const APPEARANCE: { key: ThemeMode; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "system", label: "Auto", icon: "phone-portrait-outline" },
  { key: "light", label: "Light", icon: "sunny-outline" },
  { key: "dark", label: "Dark", icon: "moon-outline" }
];

function AppearanceToggle({ mode, setMode, theme, styles }: {
  mode: ThemeMode; setMode: (m: ThemeMode) => void; theme: Theme; styles: MoreStyles;
}): JSX.Element {
  return (
    <View style={styles.segment}>
      {APPEARANCE.map((m) => {
        const active = mode === m.key;
        return (
          <TouchableOpacity key={m.key} style={[styles.segmentItem, active && styles.segmentItemActive]} onPress={() => setMode(m.key)} activeOpacity={0.85}>
            <Ionicons name={m.icon} size={16} color={active ? theme.color.primary : theme.color.textSecondary} />
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{m.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function PermissionRow({ label, status, action, theme, styles }: {
  label: string;
  status: string;
  action: { label: string; onPress: () => void } | null;
  theme: Theme;
  styles: MoreStyles;
}): JSX.Element {
  const colours = status === "granted"
    ? { bg: theme.color.successSoft, fg: theme.color.success, txt: "Granted" }
    : status === "denied"
    ? { bg: theme.color.dangerSoft, fg: theme.color.danger, txt: "Denied" }
    : { bg: theme.color.warningSoft, fg: theme.color.warning, txt: "Not granted" };
  return (
    <View style={styles.permRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.permLabel}>{label}</Text>
        <View style={[styles.pill, { backgroundColor: colours.bg, alignSelf: "flex-start", marginTop: 4 }]}>
          <Text style={[styles.pillText, { color: colours.fg }]}>{colours.txt}</Text>
        </View>
      </View>
      {action ? (
        <TouchableOpacity style={styles.permBtn} onPress={action.onPress}>
          <Text style={styles.permBtnText}>{action.label}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const makeStyles = (theme: Theme) => StyleSheet.create({
  shell: { flex: 1, backgroundColor: theme.color.background },
  header: { padding: theme.spacing.lg },
  title: { ...theme.font.title },
  subtitle: { ...theme.font.caption, marginTop: theme.spacing.xs },
  section: { paddingHorizontal: theme.spacing.lg, marginBottom: theme.spacing.lg },
  sectionTitle: { ...theme.font.label, textTransform: "uppercase", marginBottom: theme.spacing.sm },
  segment: {
    flexDirection: "row", gap: 4, padding: 4, borderRadius: theme.radius.md,
    backgroundColor: theme.color.surfaceMuted, borderWidth: 1, borderColor: theme.color.border
  },
  segmentItem: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 9, borderRadius: theme.radius.sm },
  segmentItemActive: { backgroundColor: theme.color.surface, ...theme.elevation.sm },
  segmentText: { fontSize: 13, fontWeight: "600", color: theme.color.textSecondary },
  segmentTextActive: { color: theme.color.primary },
  permRow: {
    flexDirection: "row", alignItems: "center",
    padding: theme.spacing.md, marginBottom: theme.spacing.sm,
    backgroundColor: theme.color.surface, borderRadius: theme.radius.md,
    borderWidth: 1, borderColor: theme.color.border
  },
  permLabel: { ...theme.font.bodyStrong },
  permBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: theme.radius.sm, backgroundColor: theme.color.primary },
  permBtnText: { color: theme.color.textOnPrimary, fontWeight: "600", fontSize: 13 },
  permBtnOff: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: theme.radius.sm, backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.danger },
  permBtnOffText: { color: theme.color.danger, fontWeight: "600", fontSize: 13 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(17,24,39,0.45)", justifyContent: "center", padding: theme.spacing.lg },
  modalCard: { backgroundColor: theme.color.surface, borderRadius: theme.radius.lg, padding: theme.spacing.lg },
  modalTitle: { ...theme.font.heading, marginBottom: theme.spacing.xs },
  reasonInput: {
    borderWidth: 1, borderColor: theme.color.borderStrong, borderRadius: theme.radius.sm,
    padding: theme.spacing.md, minHeight: 80, textAlignVertical: "top",
    color: theme.color.textPrimary, marginTop: theme.spacing.sm, marginBottom: theme.spacing.md
  },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: theme.spacing.sm },
  modalCancel: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: theme.radius.sm },
  modalCancelText: { color: theme.color.textSecondary, fontWeight: "600" },
  modalConfirm: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: theme.radius.sm, backgroundColor: theme.color.danger },
  modalConfirmText: { color: theme.color.textOnPrimary, fontWeight: "700" },
  note: { ...theme.font.caption, marginVertical: theme.spacing.sm },
  pill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  pillText: { fontSize: 11, fontWeight: "600", textTransform: "capitalize" },
  linkRow: {
    flexDirection: "row", alignItems: "center",
    padding: theme.spacing.md, marginBottom: theme.spacing.sm,
    backgroundColor: theme.color.surface, borderRadius: theme.radius.md,
    borderWidth: 1, borderColor: theme.color.border
  },
  linkLabel: { ...theme.font.bodyStrong },
  linkDesc: { ...theme.font.caption, marginTop: 2 },
  linkChevron: { fontSize: 18, color: theme.color.primary, marginLeft: theme.spacing.md },
  signOut: {
    padding: theme.spacing.md, borderRadius: theme.radius.md,
    backgroundColor: theme.color.surface,
    borderWidth: 1, borderColor: "rgba(197, 48, 48, 0.4)",
    alignItems: "center"
  },
  signOutText: { color: theme.color.danger, fontWeight: "600", fontSize: 15 },
  accountInfo: {
    padding: theme.spacing.md, marginBottom: theme.spacing.sm,
    backgroundColor: theme.color.surface, borderRadius: theme.radius.md,
    borderWidth: 1, borderColor: theme.color.border
  },
  accountName: { ...theme.font.bodyStrong },
  accountMeta: { ...theme.font.caption, marginTop: 2, textTransform: "capitalize" }
});
