import { useMemo, type JSX } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "../theme-context";
import type { Theme } from "../theme";
import type { TrackingDecision } from "../tracking/consent-policy";

interface Props {
  decision: TrackingDecision;
}

/**
 * Always-visible banner that tells the representative whether tracking is active.
 * Required by the privacy spec: the rep must always see tracking status.
 */
export function TrackingBanner({ decision }: Props): JSX.Element {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  if (decision.canSend) {
    return (
      <View style={[styles.banner, styles.bannerActive]}>
        <View style={[styles.dot, { backgroundColor: theme.color.success }]} />
        <Text style={styles.text}>Work session active · Location sharing on</Text>
      </View>
    );
  }
  if (decision.showActiveBanner) {
    return (
      <View style={[styles.banner, styles.bannerPending]}>
        <View style={[styles.dot, { backgroundColor: theme.color.warning }]} />
        <Text style={styles.text}>Allow background location to keep tracking on the move</Text>
      </View>
    );
  }
  return (
    <View style={[styles.banner, styles.bannerInactive]}>
      <View style={[styles.dot, { backgroundColor: theme.color.textMuted }]} />
      <Text style={styles.text}>Location sharing is off</Text>
    </View>
  );
}

const makeStyles = (theme: Theme) => StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: theme.color.border
  },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: theme.spacing.sm },
  bannerActive: { backgroundColor: theme.color.successSoft },
  bannerPending: { backgroundColor: theme.color.warningSoft },
  bannerInactive: { backgroundColor: theme.color.surfaceMuted },
  text: { ...theme.font.caption, color: theme.color.textPrimary, fontWeight: "500" }
});
