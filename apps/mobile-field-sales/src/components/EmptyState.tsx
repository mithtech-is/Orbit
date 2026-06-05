import { useEffect, useMemo, useRef, type JSX, type ReactNode } from "react";
import { View, Text, Animated, Easing, StyleSheet } from "react-native";
import { useTheme } from "../theme-context";
import type { Theme } from "../theme";

/**
 * Friendly animated empty state so no mobile screen is ever blank. The emoji
 * illustration gently floats (looping) and the whole block fades + rises in on
 * mount. Pass a contextual `icon` + copy for the screen.
 */
export function EmptyState({ icon, title, message, action }: {
  icon: string;
  title: string;
  message: string;
  action?: ReactNode;
}): JSX.Element {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const enter = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // A single quiet fade + rise on mount — no looping motion.
    Animated.timing(enter, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [enter]);

  const enterY = enter.interpolate({ inputRange: [0, 1], outputRange: [12, 0] });

  return (
    <Animated.View style={[styles.shell, { opacity: enter, transform: [{ translateY: enterY }] }]}>
      <View style={styles.iconWrap}>
        <Text style={styles.icon}>{icon}</Text>
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {action ? <View style={styles.action}>{action}</View> : null}
    </Animated.View>
  );
}

const makeStyles = (theme: Theme) => StyleSheet.create({
  shell: { alignItems: "center", justifyContent: "center", padding: theme.spacing.xl, marginTop: theme.spacing.lg },
  iconWrap: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: theme.color.primarySoft,
    alignItems: "center", justifyContent: "center", marginBottom: theme.spacing.lg
  },
  icon: { fontSize: 44 },
  title: { ...theme.font.bodyStrong, fontSize: 16, textAlign: "center", marginBottom: 6 },
  message: { ...theme.font.caption, textAlign: "center", maxWidth: 280, lineHeight: 18 },
  action: { marginTop: theme.spacing.md }
});
