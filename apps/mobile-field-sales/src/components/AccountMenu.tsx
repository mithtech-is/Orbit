import { useMemo, type JSX } from "react";
import { View, Text, StyleSheet, Modal, Pressable, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../auth/auth-context";
import { useTheme, type ThemeMode } from "../theme-context";
import type { Theme } from "../theme";

/** Two-letter initials for the avatar (e.g. "Rohan Iyer" → "RI"). */
function initialsOf(name?: string, email?: string): string {
  const src = (name && name.trim()) || (email && email.split("@")[0]) || "";
  const parts = src.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const MODES: { key: ThemeMode; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "system", label: "Auto", icon: "phone-portrait-outline" },
  { key: "light", label: "Light", icon: "sunny-outline" },
  { key: "dark", label: "Dark", icon: "moon-outline" }
];

/**
 * The account sheet opened from the home avatar — profile header, appearance
 * (system/light/dark) toggle, a shortcut to settings, and sign out. Slides down
 * from the top so it reads as anchored to the avatar.
 */
export function AccountMenu({ visible, onClose, onSignOut, onOpenSettings }: {
  visible: boolean;
  onClose: () => void;
  onSignOut: () => void | Promise<void>;
  onOpenSettings?: () => void;
}): JSX.Element {
  const { session } = useAuth();
  const { theme, mode, setMode } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Stop propagation so taps inside the card don't dismiss it. */}
        <Pressable style={[styles.card, { marginTop: insets.top + 8 }]} onPress={() => undefined}>
          <View style={styles.profile}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initialsOf(session?.name, session?.email)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={1}>{session?.name || session?.email || "Signed in"}</Text>
              {session?.email ? <Text style={styles.email} numberOfLines={1}>{session.email}</Text> : null}
              {session?.role ? (
                <View style={styles.roleChip}><Text style={styles.roleChipText}>{session.role.replace(/_/g, " ")}</Text></View>
              ) : null}
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={10} style={styles.close}>
              <Ionicons name="close" size={20} color={theme.color.textMuted} />
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionLabel}>Appearance</Text>
          <View style={styles.segment}>
            {MODES.map((m) => {
              const active = mode === m.key;
              return (
                <TouchableOpacity
                  key={m.key}
                  style={[styles.segmentItem, active && styles.segmentItemActive]}
                  onPress={() => setMode(m.key)}
                  activeOpacity={0.85}
                >
                  <Ionicons name={m.icon} size={16} color={active ? theme.color.primary : theme.color.textSecondary} />
                  <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{m.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {onOpenSettings ? (
            <MenuRow icon="settings-outline" label="Settings & permissions" onPress={() => { onClose(); onOpenSettings(); }} theme={theme} styles={styles} />
          ) : null}
          <MenuRow icon="log-out-outline" label="Sign out" destructive onPress={() => { onClose(); void onSignOut(); }} theme={theme} styles={styles} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function MenuRow({ icon, label, onPress, destructive, theme, styles }: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  destructive?: boolean;
  theme: Theme;
  styles: ReturnType<typeof makeStyles>;
}): JSX.Element {
  const color = destructive ? theme.color.danger : theme.color.textPrimary;
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <Ionicons name={icon} size={19} color={color} />
      <Text style={[styles.rowLabel, { color }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={theme.color.textMuted} />
    </TouchableOpacity>
  );
}

const makeStyles = (theme: Theme) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", paddingHorizontal: theme.spacing.md, alignItems: "stretch" },
  card: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.color.border,
    padding: theme.spacing.md,
    ...theme.elevation.md
  },
  profile: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md, marginBottom: theme.spacing.md },
  avatar: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: theme.color.primary,
    alignItems: "center", justifyContent: "center"
  },
  avatarText: { color: theme.color.textOnPrimary, fontWeight: "700", fontSize: 17 },
  name: { ...theme.font.bodyStrong, fontSize: 16 },
  email: { ...theme.font.caption, marginTop: 1 },
  roleChip: {
    alignSelf: "flex-start", marginTop: 6, paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: theme.radius.pill, backgroundColor: theme.color.primarySoft
  },
  roleChipText: { color: theme.color.primaryDeep, fontSize: 11, fontWeight: "600", textTransform: "capitalize" },
  close: { padding: 4 },
  sectionLabel: { ...theme.font.label, textTransform: "uppercase", marginBottom: theme.spacing.sm },
  segment: {
    flexDirection: "row", gap: 4, padding: 4, borderRadius: theme.radius.md,
    backgroundColor: theme.color.surfaceMuted, marginBottom: theme.spacing.md
  },
  segmentItem: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    paddingVertical: 9, borderRadius: theme.radius.sm
  },
  segmentItemActive: { backgroundColor: theme.color.surface, ...theme.elevation.sm },
  segmentText: { fontSize: 13, fontWeight: "600", color: theme.color.textSecondary },
  segmentTextActive: { color: theme.color.primary },
  row: {
    flexDirection: "row", alignItems: "center", gap: theme.spacing.md,
    paddingVertical: 13, paddingHorizontal: 4, borderTopWidth: 1, borderTopColor: theme.color.divider
  },
  rowLabel: { flex: 1, fontSize: 15, fontWeight: "500" }
});
