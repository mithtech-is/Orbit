import { useMemo, useRef, useState, type JSX } from "react";
import { View, Text, TouchableOpacity, PanResponder, StyleSheet } from "react-native";
import { useTheme } from "../theme-context";
import type { Theme } from "../theme";

interface Point { x: number; y: number }

/**
 * Pure-JS signature pad — no native dependency (works in the current dev client,
 * no rebuild). Captures strokes via PanResponder, renders the ink as a dense
 * trail of small dots, and emits the signature as an SVG path string
 * ("M x y L x y … M …") which the web dashboard can render natively.
 * Emits `null` when cleared / empty.
 */
export function SignaturePad({ onChange, height = 160 }: { onChange: (svgPath: string | null) => void; height?: number }): JSX.Element {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  // strokesRef holds every stroke (each a list of points); the last entry is the
  // in-progress stroke. We mutate it in place + force a re-render for the dots.
  const strokesRef = useRef<Point[][]>([]);
  const [tick, setTick] = useState(0);
  const rerender = () => setTick((n) => n + 1);

  function emit() {
    const parts = strokesRef.current
      .filter((s) => s.length > 0)
      .map((s) => "M " + s.map((p, i) => `${i === 0 ? "" : "L "}${Math.round(p.x)} ${Math.round(p.y)}`).join(" "));
    onChange(parts.length ? parts.join(" ") : null);
  }

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        strokesRef.current.push([{ x: e.nativeEvent.locationX, y: e.nativeEvent.locationY }]);
        rerender();
      },
      onPanResponderMove: (e) => {
        const cur = strokesRef.current[strokesRef.current.length - 1];
        if (!cur) return;
        const pt = { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY };
        const last = cur[cur.length - 1];
        // Throttle to ~2.5px so the point count stays bounded.
        if (!last || Math.abs(pt.x - last.x) + Math.abs(pt.y - last.y) > 2.5) {
          cur.push(pt);
          rerender();
        }
      },
      onPanResponderRelease: () => emit()
    })
  ).current;

  function clear() {
    strokesRef.current = [];
    onChange(null);
    rerender();
  }

  // tick is referenced so the lint/compiler keep the re-render dependency honest.
  void tick;
  const dots = strokesRef.current.flat();

  return (
    <View>
      <View style={[styles.pad, { height }]} {...responder.panHandlers}>
        {dots.length === 0 ? <Text style={styles.hint}>Sign here</Text> : null}
        {dots.map((p, i) => (
          <View key={i} pointerEvents="none" style={[styles.ink, { left: p.x - 1.5, top: p.y - 1.5 }]} />
        ))}
      </View>
      <View style={styles.row}>
        <Text style={styles.caption}>{dots.length > 0 ? "Signature captured" : "Customer signs above"}</Text>
        <TouchableOpacity onPress={clear} disabled={dots.length === 0}>
          <Text style={[styles.clear, dots.length === 0 ? styles.clearOff : null]}>Clear</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const makeStyles = (theme: Theme) => StyleSheet.create({
  pad: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.color.borderStrong,
    borderStyle: "dashed",
    marginTop: 4,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center"
  },
  hint: { ...theme.font.caption, color: theme.color.textMuted },
  ink: { position: "absolute", width: 3, height: 3, borderRadius: 1.5, backgroundColor: theme.color.textPrimary },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6 },
  caption: { ...theme.font.caption, fontSize: 11 },
  clear: { color: theme.color.primary, fontWeight: "600", fontSize: 13 },
  clearOff: { color: theme.color.textMuted }
});
