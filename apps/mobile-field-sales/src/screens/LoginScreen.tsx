import { useMemo, useState, type JSX } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { loginAndPersist } from "../api-service";
import { useTheme } from "../theme-context";
import type { Theme } from "../theme";
import type { MobileSession, TokenStorage } from "../auth/token-storage";

interface Props {
  storage: TokenStorage;
  onAuthenticated: (session: MobileSession) => void;
}

/** Turn a raw API/network error into plain language a rep can act on. */
function friendlyLoginError(err: unknown): string {
  const raw = (err instanceof Error ? err.message : String(err)) || "";
  if (/\b401\b|\b403\b|unauthor|invalid|credential|incorrect|password|not\s*found/i.test(raw)) {
    return "Incorrect email, password, or organisation. Please check and try again.";
  }
  if (/network|failed to fetch|timeout|timed out|econn|fetch|offline|reach/i.test(raw)) {
    return "Can't reach Orbit. Check your internet connection and try again.";
  }
  return "Couldn't sign you in. Please try again in a moment.";
}

export function LoginScreen({ storage, onAuthenticated }: Props): JSX.Element {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [organisationId, setOrganisationId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError(null);
    setLoading(true);
    try {
      const session = await loginAndPersist(storage, { email, password, organisationId });
      onAuthenticated(session);
    } catch (err) {
      setError(friendlyLoginError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.shell} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
        <View style={styles.brandRow}>
          <View style={styles.brandBadge}>
            <Ionicons name="navigate" size={22} color={theme.color.textOnPrimary} />
          </View>
          <Text style={styles.brandText}>Orbit</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Sign in to your workspace</Text>
          <Text style={styles.subtitle}>Manage today&apos;s route, visits, and orders from the field.</Text>

          <Text style={styles.label}>Work email</Text>
          <View style={styles.inputWrap}>
            <Ionicons name="mail-outline" size={18} color={theme.color.textMuted} />
            <TextInput
              style={styles.input}
              placeholder="you@company.com"
              placeholderTextColor={theme.color.textMuted}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              value={email}
              onChangeText={setEmail}
            />
          </View>

          <Text style={styles.label}>Password</Text>
          <View style={styles.inputWrap}>
            <Ionicons name="lock-closed-outline" size={18} color={theme.color.textMuted} />
            <TextInput
              style={styles.input}
              placeholder="Enter your password"
              placeholderTextColor={theme.color.textMuted}
              secureTextEntry
              autoComplete="current-password"
              value={password}
              onChangeText={setPassword}
            />
          </View>

          <Text style={styles.label}>Organisation</Text>
          <View style={styles.inputWrap}>
            <Ionicons name="business-outline" size={18} color={theme.color.textMuted} />
            <TextInput
              style={styles.input}
              placeholder="Your organisation"
              placeholderTextColor={theme.color.textMuted}
              autoCapitalize="none"
              value={organisationId}
              onChangeText={setOrganisationId}
            />
          </View>

          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={16} color={theme.color.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <TouchableOpacity style={[styles.button, loading && styles.buttonDisabled]} onPress={submit} disabled={loading} activeOpacity={0.85}>
            {loading ? <ActivityIndicator color={theme.color.textOnPrimary} /> : <Text style={styles.buttonText}>Sign in</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (theme: Theme) => StyleSheet.create({
  shell: { flex: 1, backgroundColor: theme.color.background },
  scroll: { flexGrow: 1, justifyContent: "center", padding: theme.spacing.xl },
  brandRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, marginBottom: theme.spacing.xl, paddingHorizontal: 4 },
  brandBadge: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: theme.color.primary,
    alignItems: "center", justifyContent: "center", ...theme.elevation.glow
  },
  brandText: { ...theme.font.heading, fontSize: 18, fontWeight: "700" },
  card: {
    backgroundColor: theme.color.surface, borderRadius: theme.radius.lg,
    borderWidth: 1, borderColor: theme.color.border, padding: theme.spacing.xl, ...theme.elevation.md
  },
  title: { ...theme.font.title, fontSize: 21, marginBottom: theme.spacing.xs },
  subtitle: { ...theme.font.caption, marginBottom: theme.spacing.lg, lineHeight: 18 },
  label: { ...theme.font.label, marginTop: theme.spacing.md, marginBottom: theme.spacing.xs, textTransform: "uppercase" },
  inputWrap: {
    flexDirection: "row", alignItems: "center", gap: theme.spacing.sm,
    backgroundColor: theme.color.surfaceMuted,
    borderWidth: 1, borderColor: theme.color.border,
    paddingHorizontal: 14, borderRadius: theme.radius.md
  },
  input: { flex: 1, color: theme.color.textPrimary, paddingVertical: 13, fontSize: 15 },
  errorBox: {
    flexDirection: "row", alignItems: "center", gap: 8, marginTop: theme.spacing.md,
    padding: theme.spacing.sm, borderRadius: theme.radius.sm, backgroundColor: theme.color.dangerSoft
  },
  errorText: { color: theme.color.danger, fontSize: 13, flex: 1 },
  button: {
    backgroundColor: theme.color.primary, padding: 15, borderRadius: theme.radius.md,
    alignItems: "center", marginTop: theme.spacing.xl, ...theme.elevation.glow
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: theme.color.textOnPrimary, fontWeight: "700", fontSize: 15 }
});
