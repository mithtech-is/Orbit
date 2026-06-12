import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, Alert, Linking, ScrollView } from "react-native";
import * as Location from "expo-location";
import * as WebBrowser from "expo-web-browser";
import { apiClient } from "../api-service";
import type { OutletSummary, PreviewedRouteResponse, RouteStopDetail } from "@orbit/api-client";
import { useTheme } from "../theme-context";
import type { Theme } from "../theme";
import { requestForegroundLocationPermission, probeForegroundLocationPermission } from "../tracking/location-probes";
import { onVisitCompleted } from "../visits/visit-events";

interface OrderedStop {
  outletId: string;
  outletName: string;
  latitude: number;
  longitude: number;
  stopOrder: number;
  expectedDurationMinutes: number;
}

interface RouteMapScreenProps {
  onOpenStop?: (planId: string, stop: RouteStopDetail) => void;
}

function mapPageUrl(
  outlets: OutletSummary[],
  orderById: Map<string, OrderedStop>,
  currentStopIndex: number,
  currentPosition: { latitude: number; longitude: number } | null,
  polylineCoords: { latitude: number; longitude: number }[] | null,
): string {
  const markers = outlets.map((o) => {
    const inRoute = orderById.get(o.id);
    let color = "#9ca3af";
    let label = o.name;
    if (inRoute) {
      const z = inRoute.stopOrder - 1;
      color = z < currentStopIndex ? "#9ca3af" : z === currentStopIndex ? "#22c55e" : "#00aaff";
      label = `${inRoute.stopOrder}. ${o.name}`;
    }
    return `L.circleMarker([${o.latitude},${o.longitude}],{radius:7,color:"${color}",fillColor:"${color}",fillOpacity:.7,weight:2}).addTo(m).bindTooltip("${label}")`;
  });

  let polylineJs = "";
  if (polylineCoords && polylineCoords.length > 1) {
    const coords = polylineCoords.map((p) => `[${p.latitude},${p.longitude}]`).join(",");
    polylineJs = `L.polyline([${coords}],{color:"#00aaff",weight:4,opacity:.8}).addTo(m);`;
  }

  const pts: string[] = [];
  if (currentPosition) pts.push(`[${currentPosition.latitude},${currentPosition.longitude}]`);
  outlets.forEach((o) => pts.push(`[${o.latitude},${o.longitude}]`));
  const boundsJs = pts.length > 1 ? `setTimeout(()=>m.fitBounds([${pts.join(",")}],{padding:[40,40],maxZoom:15}),300);` : "";

  const html = `<!DOCTYPE html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>*{margin:0;padding:0}html,body,#m{width:100%;height:100%}</style></head>
<body><div id="m"></div><script>
var m=L.map('m',{zoomControl:true,attributionControl:false}).setView([12.97,77.59],10);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'OSM'}).addTo(m);
${currentPosition ? `L.circleMarker([${currentPosition.latitude},${currentPosition.longitude}],{radius:8,color:"#00aaff",fillColor:"#00aaff",fillOpacity:.4,weight:3}).addTo(m).bindTooltip("You");` : ""}
${markers.join(";")}
${polylineJs}
${boundsJs}
</script></body></html>`;

  return "data:text/html;charset=utf-8," + encodeURIComponent(html);
}

export function RouteMapScreen({ onOpenStop }: RouteMapScreenProps = {}): JSX.Element {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [loading, setLoading] = useState(true);
  const [outlets, setOutlets] = useState<OutletSummary[]>([]);
  const [planMode, setPlanMode] = useState(false);
  const [currentPosition, setCurrentPosition] = useState<{ latitude: number; longitude: number } | null>(null);
  const [optimised, setOptimised] = useState<PreviewedRouteResponse | null>(null);
  const [optimising, setOptimising] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const didAutoBuildRef = useRef(false);
  const [currentStopIndex, setCurrentStopIndex] = useState(0);

  const polylineCoords = useMemo(() => {
    if (!optimised) return null;
    if (optimised.routeGeometry && optimised.routeGeometry.length > 1) {
      return optimised.routeGeometry.map((p) => ({ latitude: p.latitude, longitude: p.longitude }));
    }
    if (!currentPosition) return null;
    return [
      { latitude: currentPosition.latitude, longitude: currentPosition.longitude },
      ...optimised.orderedStops.map((s) => ({ latitude: s.latitude, longitude: s.longitude })),
    ];
  }, [optimised, currentPosition]);

  const orderById: Map<string, OrderedStop> = useMemo(() => {
    const m = new Map<string, OrderedStop>();
    if (optimised) for (const s of optimised.orderedStops) m.set(s.outletId, s);
    return m;
  }, [optimised]);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const perm = await probeForegroundLocationPermission();
      if (perm !== "granted") {
        const result = await requestForegroundLocationPermission();
        if (result !== "granted") {
          setError("Location permission is required to plan a route from your position.");
          setLoading(false);
          return;
        }
      }
      const [pos, outletList, today] = await Promise.all([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        apiClient.listOutlets(),
        apiClient.getMyToday().catch(() => null),
      ]);
      setCurrentPosition({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });

      const planOutletIds = new Set((today?.routePlans ?? []).flatMap((p) => p.stops.map((s) => s.outletId)));
      const hasPlan = planOutletIds.size > 0;
      const scoped = hasPlan ? outletList.items.filter((o) => planOutletIds.has(o.id)) : outletList.items;
      didAutoBuildRef.current = false;
      setPlanMode(hasPlan);
      setOutlets(scoped);
      setOptimised(null);
      setCurrentStopIndex(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load map");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!planMode || optimised || optimising || !currentPosition || outlets.length === 0) return;
    if (didAutoBuildRef.current) return;
    didAutoBuildRef.current = true;
    void optimiseFromHere();
  }, [planMode, optimised, optimising, currentPosition, outlets]);

  async function optimiseFromHere() {
    if (!currentPosition) return;
    if (outlets.length === 0) {
      Alert.alert("No outlets to visit", "Add an outlet first from the Outlets tab or the web dashboard.");
      return;
    }
    setOptimising(true);
    setError(null);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const result = await apiClient.previewRoutePlan({
        routeDate: today,
        repLatitude: currentPosition.latitude,
        repLongitude: currentPosition.longitude,
        returnToStart: true,
        stopIds: outlets.map((o) => ({
          outletId: o.id,
          expectedDurationMinutes: 15,
          priority: 0,
        })),
      });
      setOptimised(result);
      setCurrentStopIndex(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't build your route. Please try again.");
    } finally {
      setOptimising(false);
    }
  }

  function clearRoute() {
    setOptimised(null);
    setCurrentStopIndex(0);
  }

  function navigateTo(latitude: number, longitude: number, label?: string) {
    const q = label ? `&destination_place_id=${encodeURIComponent(label)}` : "";
    const url = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}&travelmode=driving${q}`;
    void Linking.openURL(url).catch(() => {
      void Linking.openURL(`geo:${latitude},${longitude}`).catch(() => undefined);
    });
  }

  function openFullMap() {
    const url = mapPageUrl(outlets, orderById, currentStopIndex, currentPosition, polylineCoords);
    void WebBrowser.openBrowserAsync(url);
  }

  const stopsList = optimised?.orderedStops ?? [];
  const atHomeLeg = optimised ? currentStopIndex >= stopsList.length : false;
  const activeStop = !atHomeLeg ? stopsList[currentStopIndex] : undefined;

  function openVisit(stop: OrderedStop) {
    if (!onOpenStop) {
      Alert.alert("Open from Home", "Open this stop from the Home tab to record the visit.");
      return;
    }
    const detail: RouteStopDetail = {
      id: `maproute_${stop.outletId}`,
      outletId: stop.outletId,
      outletName: stop.outletName,
      outletLatitude: stop.latitude,
      outletLongitude: stop.longitude,
      stopOrder: stop.stopOrder,
      status: "pending",
      expectedDurationMinutes: stop.expectedDurationMinutes,
    };
    onOpenStop("maproute", detail);
  }

  useEffect(() => {
    const activeOutletId = activeStop?.outletId;
    if (!activeOutletId) return;
    return onVisitCompleted((outletId) => {
      if (outletId === activeOutletId) {
        setCurrentStopIndex((i) => Math.min(i + 1, stopsList.length));
      }
    });
  }, [activeStop?.outletId, stopsList.length]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.color.primary} />
        <Text style={[styles.muted, { marginTop: theme.spacing.sm }]}>Locating you…</Text>
      </View>
    );
  }

  return (
    <View style={styles.shell}>
      <TouchableOpacity style={styles.mapPlaceholder} onPress={openFullMap} activeOpacity={0.8}>
        <Text style={styles.mapPlaceholderIcon}>🗺</Text>
        <Text style={styles.mapPlaceholderText}>Tap to open full map</Text>
        <Text style={styles.mapPlaceholderHint}>Opens in browser with all stops & route</Text>
      </TouchableOpacity>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {!optimised ? (
        <View style={styles.controlsPanel}>
          <Text style={styles.panelTitle}>{planMode ? "Today's plan" : "Plan today's route"}</Text>
          <Text style={styles.panelSub}>
            {planMode
              ? `${outlets.length} stop${outlets.length === 1 ? "" : "s"} on your assigned plan`
              : `${outlets.length} outlet${outlets.length === 1 ? "" : "s"} on the map`}
          </Text>
          <TouchableOpacity style={styles.primaryBtn} disabled={optimising || !currentPosition} onPress={optimiseFromHere}>
            {optimising
              ? <ActivityIndicator color={theme.color.textOnPrimary} />
              : <Text style={styles.primaryBtnText}>{planMode ? "Build my route" : "Optimise route"}</Text>}
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView style={styles.scrollPanel}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={styles.panelTitle}>
              {atHomeLeg
                ? (optimised.returnHome ? "Head home" : "Route complete")
                : `Stop ${currentStopIndex + 1} of ${stopsList.length}`}
            </Text>
            <TouchableOpacity onPress={clearRoute}>
              <Text style={styles.clearLink}>Clear</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.summaryRow}>
            <SummaryCell label="Stops" value={String(stopsList.length)} styles={styles} />
            <SummaryCell label="Distance" value={formatKm(optimised.totalDistanceMeters)} styles={styles} />
            <SummaryCell label="Total time" value={formatDuration(optimised.totalDurationMinutes)} styles={styles} />
          </View>

          {activeStop ? (
            <View style={styles.targetCard}>
              <Text style={styles.targetLabel}>NEXT STOP</Text>
              <Text style={styles.targetName} numberOfLines={1}>{activeStop.stopOrder}. {activeStop.outletName}</Text>
              <View style={styles.targetBtnRow}>
                <TouchableOpacity style={styles.navBtn} onPress={() => navigateTo(activeStop.latitude, activeStop.longitude, activeStop.outletName)}>
                  <Text style={styles.navBtnText}>Navigate</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.nextBtn} onPress={() => openVisit(activeStop)}>
                  <Text style={styles.nextBtnText}>I&apos;ve arrived — log visit ▸</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.targetCard}>
              <Text style={styles.targetLabel}>{optimised.returnHome ? "HEAD HOME" : "ALL STOPS DONE"}</Text>
              <Text style={styles.targetName}>{optimised.returnHome ? "Drive back home" : "Route complete"}</Text>
              <View style={styles.targetBtnRow}>
                {optimised.returnHome && currentPosition ? (
                  <TouchableOpacity style={styles.navBtn} onPress={() => navigateTo(currentPosition.latitude, currentPosition.longitude, "Home")}>
                    <Text style={styles.navBtnText}>Navigate home</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity style={styles.nextBtn} onPress={clearRoute}>
                  <Text style={styles.nextBtnText}>Finish route ✓</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={{ maxHeight: 200 }}>
            {stopsList.map((stop, idx) => {
              const done = idx < currentStopIndex;
              const active = idx === currentStopIndex && !atHomeLeg;
              return (
                <TouchableOpacity key={stop.outletId} style={[styles.stopRow, active ? styles.stopRowActive : null]}
                  onPress={() => navigateTo(stop.latitude, stop.longitude, stop.outletName)}>
                  <View style={[styles.stopNumber, done ? styles.stopNumberDone : active ? styles.stopNumberActive : null]}>
                    <Text style={styles.stopNumberText}>{done ? "✓" : stop.stopOrder}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.stopName, done ? styles.stopNameDone : null]} numberOfLines={1}>{stop.outletName}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
            <View style={styles.stopRow}>
              <View style={[styles.stopNumber, styles.stopNumberHome]}><Text style={styles.stopNumberText}>⌂</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.stopName}>Home (start)</Text>
              </View>
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function SummaryCell({ label, value, styles }: { label: string; value: string; styles: ReturnType<typeof makeStyles> }): JSX.Element {
  return (
    <View style={styles.summaryCell}>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function formatKm(m: number): string { return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`; }
function formatDuration(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60); const r = min % 60;
  return r === 0 ? `${h}h` : `${h}h ${r}m`;
}

const makeStyles = (theme: Theme) => StyleSheet.create({
  shell: { flex: 1, backgroundColor: theme.color.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.color.background },
  muted: { ...theme.font.caption },
  mapPlaceholder: {
    height: 220, backgroundColor: theme.color.primarySoft, margin: 12, borderRadius: theme.radius.md,
    alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.color.border,
    borderStyle: "dashed",
  },
  mapPlaceholderIcon: { fontSize: 40, marginBottom: 8 },
  mapPlaceholderText: { ...theme.font.bodyStrong, color: theme.color.primary },
  mapPlaceholderHint: { ...theme.font.caption, marginTop: 4 },
  error: { color: theme.color.danger, fontSize: 12, margin: 12, marginBottom: 0 },
  controlsPanel: { margin: 12, padding: theme.spacing.md, backgroundColor: theme.color.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.color.border },
  scrollPanel: { margin: 12, marginTop: 0 },
  panelTitle: { ...theme.font.bodyStrong },
  panelSub: { ...theme.font.caption, marginTop: 2, marginBottom: 10 },
  primaryBtn: { backgroundColor: theme.color.primary, padding: 12, borderRadius: theme.radius.sm, alignItems: "center" },
  primaryBtnText: { color: theme.color.textOnPrimary, fontWeight: "700", fontSize: 14 },
  clearLink: { color: theme.color.primary, fontWeight: "600", fontSize: 13 },
  summaryRow: { flexDirection: "row", marginTop: theme.spacing.sm, marginBottom: 4 },
  summaryCell: { flex: 1, alignItems: "center", paddingVertical: 4 },
  summaryValue: { fontSize: 20, fontWeight: "700", color: theme.color.textPrimary },
  summaryLabel: { ...theme.font.caption },
  targetCard: { backgroundColor: theme.color.primarySoft, borderRadius: theme.radius.sm, padding: theme.spacing.sm, marginTop: theme.spacing.sm, marginBottom: theme.spacing.sm },
  targetLabel: { ...theme.font.caption, fontSize: 10, fontWeight: "700", color: theme.color.primary, letterSpacing: 1 },
  targetName: { ...theme.font.bodyStrong, fontSize: 15, marginTop: 2 },
  targetBtnRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  navBtn: { flex: 1, backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.primary, padding: 10, borderRadius: theme.radius.sm, alignItems: "center" },
  navBtnText: { color: theme.color.primary, fontWeight: "700", fontSize: 13 },
  nextBtn: { flex: 1.4, backgroundColor: theme.color.primary, padding: 10, borderRadius: theme.radius.sm, alignItems: "center" },
  nextBtnText: { color: theme.color.textOnPrimary, fontWeight: "700", fontSize: 13 },
  stopRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.color.border },
  stopNumber: { width: 22, height: 22, borderRadius: 11, backgroundColor: theme.color.primarySoft, alignItems: "center", justifyContent: "center", marginRight: 10 },
  stopNumberText: { color: theme.color.primary, fontWeight: "700", fontSize: 12 },
  stopName: { ...theme.font.bodyStrong, fontSize: 13 },
  stopNameDone: { textDecorationLine: "line-through", color: theme.color.textSecondary },
  stopRowActive: { backgroundColor: theme.color.primarySoft, borderRadius: theme.radius.sm },
  stopNumberDone: { backgroundColor: "#d1d5db" },
  stopNumberActive: { backgroundColor: "#22c55e" },
  stopNumberHome: { backgroundColor: theme.color.border },
});
