import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, Alert, Linking, ScrollView } from "react-native";
import MapView, { Marker, Polyline, type Region } from "react-native-maps";
import * as Location from "expo-location";
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
  /** Opens the full visit page for a stop (geofenced check-in + notes + outcome). */
  onOpenStop?: (planId: string, stop: RouteStopDetail) => void;
}

export function RouteMapScreen({ onOpenStop }: RouteMapScreenProps = {}): JSX.Element {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [loading, setLoading] = useState(true);
  const [outlets, setOutlets] = useState<OutletSummary[]>([]);
  // True when today has an assigned route plan — the map then shows ONLY that
  // plan's stops (not every outlet) and auto-builds the guided route.
  const [planMode, setPlanMode] = useState(false);
  const [currentPosition, setCurrentPosition] = useState<{ latitude: number; longitude: number } | null>(null);
  const [optimised, setOptimised] = useState<PreviewedRouteResponse | null>(null);
  const [optimising, setOptimising] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Auto-build the route once per plan load (so the rep doesn't have to tap).
  const didAutoBuildRef = useRef(false);
  // Guided navigation: the rep follows the route in order. `currentStopIndex` is
  // the active target. It ONLY advances when the rep completes that stop's visit
  // (see the onVisitCompleted effect below) — there is no manual skip, so a rep
  // can't jump ahead without logging the stop. When it reaches the stop count,
  // the last leg is heading home.
  const [currentStopIndex, setCurrentStopIndex] = useState(0);
  // The bottom panel can be minimised to a slim handle so the rep sees the full map.
  const [panelMinimized, setPanelMinimized] = useState(false);
  const mapRef = useRef<MapView | null>(null);

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
        apiClient.getMyToday().catch(() => null)
      ]);
      setCurrentPosition({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });

      // If a route plan is assigned for today, restrict the map to ONLY that
      // plan's outlets (and we'll auto-build the guided route below). Without a
      // plan, fall back to all outlets for an ad-hoc "optimise from here" route.
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

  // When today has an assigned plan, build its guided route automatically so the
  // rep just follows it step-by-step (no "optimise" tap needed). Runs once per
  // plan load thanks to the ref guard.
  useEffect(() => {
    if (!planMode || optimised || optimising || !currentPosition || outlets.length === 0) return;
    if (didAutoBuildRef.current) return;
    didAutoBuildRef.current = true;
    // optimiseFromHere reads the latest currentPosition/outlets via closure; the
    // ref guard prevents re-runs, so it intentionally isn't in the dep list.
    void optimiseFromHere();
  }, [planMode, optimised, optimising, currentPosition, outlets]);

  // Auto-fit the map to current position + outlets once we have data.
  useEffect(() => {
    if (!mapRef.current || !currentPosition || outlets.length === 0) return;
    const points = [
      { latitude: currentPosition.latitude, longitude: currentPosition.longitude },
      ...outlets.map((o) => ({ latitude: o.latitude, longitude: o.longitude }))
    ];
    setTimeout(() => {
      mapRef.current?.fitToCoordinates(points, {
        edgePadding: { top: 80, right: 60, bottom: 220, left: 60 },
        animated: false
      });
    }, 400);
  }, [currentPosition, outlets]);

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
        // Round trip: start at the rep's current spot, head to the NEAREST outlet
        // first, fan outward, then loop back home as the final leg. The optimiser
        // pins the nearest stop to first and keeps the drive-home leg last, so the
        // rep can finish the day back home on time (not stranded at a far outlet).
        returnToStart: true,
        stopIds: outlets.map((o) => ({
          outletId: o.id,
          expectedDurationMinutes: 15,
          priority: 0
        }))
      });
      setOptimised(result);
      setCurrentStopIndex(0);
      // Fit map to the optimised path.
      if (mapRef.current) {
        const points = [
          { latitude: currentPosition.latitude, longitude: currentPosition.longitude },
          ...result.orderedStops.map((s) => ({ latitude: s.latitude, longitude: s.longitude }))
        ];
        mapRef.current.fitToCoordinates(points, {
          edgePadding: { top: 80, right: 60, bottom: 240, left: 60 },
          animated: true
        });
      }
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

  // Open the device's maps app to navigate to a single point (turn-by-turn).
  function navigateTo(latitude: number, longitude: number, label?: string) {
    const q = label ? `&destination_place_id=${encodeURIComponent(label)}` : "";
    const url = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}&travelmode=driving${q}`;
    void Linking.openURL(url).catch(() => {
      void Linking.openURL(`geo:${latitude},${longitude}`).catch(() => undefined);
    });
  }

  const stopsList = optimised?.orderedStops ?? [];
  const atHomeLeg = optimised ? currentStopIndex >= stopsList.length : false;
  const activeStop = !atHomeLeg ? stopsList[currentStopIndex] : undefined;

  // "I've arrived" opens the stop's VISIT page (the existing geofenced check-in
  // flow: it records the rep's GPS + distance to the outlet, then they enter the
  // outcome and notes and tap "Complete visit"). It does NOT silently mark the
  // visit done — completion only happens when the rep finishes that screen.
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
      expectedDurationMinutes: stop.expectedDurationMinutes
    };
    onOpenStop("maproute", detail);
  }

  // The ONLY way to advance the guided pointer: completing the active stop's
  // visit (geofenced check-in + required outcome/notes on VisitCheckInScreen).
  // VisitCheckInScreen emits `visitCompleted(outletId)` on a successful
  // check-out; when that matches the stop we're currently heading to, we move
  // on. There is no manual skip — a rep can't reach the next stop without
  // logging the current one.
  useEffect(() => {
    const activeOutletId = activeStop?.outletId;
    if (!activeOutletId) return;
    return onVisitCompleted((outletId) => {
      if (outletId === activeOutletId) {
        setCurrentStopIndex((i) => Math.min(i + 1, stopsList.length));
      }
    });
  }, [activeStop?.outletId, stopsList.length]);

  // Recenter the map on whatever the rep is currently heading to (active stop,
  // or home on the final leg) whenever the pointer moves or a route is set.
  useEffect(() => {
    if (!mapRef.current || !optimised) return;
    const target = stopsList[currentStopIndex] ?? (currentPosition ?? null);
    if (!target) return;
    mapRef.current.animateToRegion(
      { latitude: target.latitude, longitude: target.longitude, latitudeDelta: 0.02, longitudeDelta: 0.02 },
      600
    );
  }, [currentStopIndex, optimised, currentPosition, stopsList]);

  const initialRegion: Region = currentPosition ? {
    latitude: currentPosition.latitude,
    longitude: currentPosition.longitude,
    latitudeDelta: 0.1, longitudeDelta: 0.1
  } : outlets[0] ? {
    latitude: outlets[0].latitude, longitude: outlets[0].longitude,
    latitudeDelta: 0.1, longitudeDelta: 0.1
  } : { latitude: 12.97, longitude: 77.59, latitudeDelta: 0.5, longitudeDelta: 0.5 };

  // The polyline path. Prefer the real road-following geometry from the routing
  // provider (OSRM) — street-by-street, like Google Maps. Only if the provider
  // didn't return geometry (e.g. the mock provider) do we fall back to straight
  // segments between current position and each stop.
  const polylineCoords = useMemo(() => {
    if (!optimised) return null;
    if (optimised.routeGeometry && optimised.routeGeometry.length > 1) {
      return optimised.routeGeometry.map((p) => ({ latitude: p.latitude, longitude: p.longitude }));
    }
    if (!currentPosition) return null;
    return [
      { latitude: currentPosition.latitude, longitude: currentPosition.longitude },
      ...optimised.orderedStops.map((s) => ({ latitude: s.latitude, longitude: s.longitude }))
    ];
  }, [optimised, currentPosition]);

  // Which outlets to render as numbered markers (optimised order) vs plain (unrouted).
  const orderById: Map<string, OrderedStop> = useMemo(() => {
    const m = new Map<string, OrderedStop>();
    if (optimised) for (const s of optimised.orderedStops) m.set(s.outletId, s);
    return m;
  }, [optimised]);

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
      <MapView
        ref={(r: MapView | null) => { mapRef.current = r; }}
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion}
        showsUserLocation
        showsMyLocationButton
      >
        {/* Current position marker (in addition to native blue dot) */}
        {currentPosition ? (
          <Marker
            coordinate={currentPosition}
            title="Your location"
            description="Route starts here"
            pinColor={theme.color.primary}
          />
        ) : null}

        {/* Outlet markers — numbered by visiting order; the ACTIVE stop is green,
            already-visited stops gray, upcoming stops blue. */}
        {outlets.map((o) => {
          const inRoute = orderById.get(o.id);
          let pinColor = "#9ca3af"; // not in route
          if (inRoute) {
            const zeroIdx = inRoute.stopOrder - 1;
            pinColor = zeroIdx < currentStopIndex ? "#9ca3af" : zeroIdx === currentStopIndex ? "#22c55e" : "#00aaff";
          }
          return (
            <Marker
              key={o.id}
              coordinate={{ latitude: o.latitude, longitude: o.longitude }}
              title={inRoute ? `${inRoute.stopOrder}. ${o.name}` : o.name}
              description={inRoute ? `Stop ${inRoute.stopOrder} of ${stopsList.length}` : "Tap 'Optimise route' to include"}
              pinColor={pinColor}
            />
          );
        })}

        {/* Optimised path */}
        {polylineCoords ? (
          <Polyline coordinates={polylineCoords} strokeColor={theme.color.primary} strokeWidth={4} lineDashPattern={[0]} />
        ) : null}
      </MapView>

      {/* Overlay panel — collapsible so the rep can see the whole map. */}
      <View style={[styles.panel, panelMinimized ? styles.panelMin : null]}>
        <TouchableOpacity style={styles.handle} activeOpacity={0.8} onPress={() => setPanelMinimized((m) => !m)}>
          <View style={styles.handleGrip} />
          <Text style={styles.handleText} numberOfLines={1}>
            {panelMinimized
              ? (!optimised
                  ? (planMode ? "▴  Today's plan" : "▴  Plan today's route")
                  : atHomeLeg
                    ? (optimised.returnHome ? "▴  Head home" : "▴  Route complete")
                    : `▴  Stop ${currentStopIndex + 1}/${stopsList.length}${activeStop ? ` · ${activeStop.outletName}` : ""}`)
              : "▾  Minimise"}
          </Text>
        </TouchableOpacity>
        {panelMinimized ? null : (
        <>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {!optimised ? (
          <>
            <Text style={styles.panelTitle}>{planMode ? "Today's plan" : "Plan today's route"}</Text>
            <Text style={styles.panelSub}>
              {planMode
                ? `${outlets.length} stop${outlets.length === 1 ? "" : "s"} on your assigned plan · visit them in order, one at a time.`
                : `${outlets.length} outlet${outlets.length === 1 ? "" : "s"} on the map · we'll start with the nearest one, work outward, then loop you back home.`}
            </Text>
            <TouchableOpacity style={styles.primaryBtn} disabled={optimising || !currentPosition} onPress={optimiseFromHere}>
              {optimising
                ? <ActivityIndicator color={theme.color.textOnPrimary} />
                : <Text style={styles.primaryBtnText}>{planMode ? "Build my route" : "Optimise route from here"}</Text>}
            </TouchableOpacity>
          </>
        ) : (
          <>
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
            <Text style={styles.providerHint}>
              Ordered for the shortest drive{optimised.returnHome ? " · returns to your starting point" : ""}
            </Text>

            {/* Guided current target: navigate to THIS stop only, then advance. */}
            {activeStop ? (
              <View style={styles.targetCard}>
                <Text style={styles.targetLabel}>NEXT STOP</Text>
                <Text style={styles.targetName} numberOfLines={1}>{activeStop.stopOrder}. {activeStop.outletName}</Text>
                <Text style={styles.targetMeta}>
                  {activeStop.driveMinutes != null ? `~${activeStop.driveMinutes} min drive` : "drive"}
                  {activeStop.etaMinutes != null ? ` · arrive in ~${formatDuration(activeStop.etaMinutes)}` : ""}
                  {` · ${activeStop.expectedDurationMinutes} min visit`}
                </Text>
                <View style={styles.targetBtnRow}>
                  <TouchableOpacity style={styles.navBtn} onPress={() => navigateTo(activeStop.latitude, activeStop.longitude, activeStop.outletName)}>
                    <Text style={styles.navBtnText}>Navigate</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.nextBtn} onPress={() => openVisit(activeStop)}>
                    <Text style={styles.nextBtnText}>I&apos;ve arrived — log visit ▸</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.gateHint}>Complete this stop&apos;s visit to unlock the next stop.</Text>
              </View>
            ) : (
              <View style={styles.targetCard}>
                <Text style={styles.targetLabel}>{optimised.returnHome ? "HEAD HOME" : "ALL STOPS DONE"}</Text>
                <Text style={styles.targetName}>{optimised.returnHome ? "Drive back home 🏠" : "Route complete 🎉"}</Text>
                <Text style={styles.targetMeta}>
                  {optimised.returnHome
                    ? `Every stop visited · ~${optimised.returnHome.driveMinutes} min drive back to your start.`
                    : "You've visited every stop on today's route."}
                </Text>
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

            {/* Full plan — view-only, so the rep follows the sequence rather than skipping around. */}
            <ScrollView style={{ maxHeight: 150 }}>
              {stopsList.map((stop, idx) => {
                const done = idx < currentStopIndex;
                const active = idx === currentStopIndex && !atHomeLeg;
                return (
                  <View key={stop.outletId} style={[styles.stopRow, active ? styles.stopRowActive : null]}>
                    <View style={[styles.stopNumber, done ? styles.stopNumberDone : active ? styles.stopNumberActive : null]}>
                      <Text style={styles.stopNumberText}>{done ? "✓" : stop.stopOrder}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.stopName, done ? styles.stopNameDone : null]} numberOfLines={1}>{stop.outletName}</Text>
                      <Text style={styles.stopMeta}>
                        {stop.etaMinutes != null ? `arrive in ~${formatDuration(stop.etaMinutes)}` : `${stop.expectedDurationMinutes} min visit`}
                      </Text>
                    </View>
                  </View>
                );
              })}
              <View style={styles.stopRow}>
                <View style={[styles.stopNumber, styles.stopNumberHome]}><Text style={styles.stopNumberText}>⌂</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.stopName}>Home (start)</Text>
                  <Text style={styles.stopMeta}>{optimised.returnHome ? `~${optimised.returnHome.driveMinutes} min drive back` : "end of route"}</Text>
                </View>
              </View>
            </ScrollView>
          </>
        )}
        </>
        )}
      </View>
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
  panel: {
    position: "absolute", left: 12, right: 12, bottom: 12,
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.color.border,
    padding: theme.spacing.md,
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 10,
    elevation: 6
  },
  panelMin: { paddingBottom: theme.spacing.sm },
  handle: { alignItems: "center", paddingBottom: theme.spacing.sm },
  handleGrip: { width: 40, height: 4, borderRadius: 2, backgroundColor: theme.color.border, marginBottom: 6 },
  handleText: { ...theme.font.caption, fontWeight: "700", color: theme.color.primary },
  panelTitle: { ...theme.font.bodyStrong },
  panelSub: { ...theme.font.caption, marginTop: 2, marginBottom: 10 },
  primaryBtn: { backgroundColor: theme.color.primary, padding: 12, borderRadius: theme.radius.sm, alignItems: "center" },
  primaryBtnText: { color: theme.color.textOnPrimary, fontWeight: "700", fontSize: 14 },
  clearLink: { color: theme.color.primary, fontWeight: "600", fontSize: 13 },
  summaryRow: { flexDirection: "row", marginTop: theme.spacing.sm, marginBottom: 4 },
  summaryCell: { flex: 1, alignItems: "center", paddingVertical: 4 },
  summaryValue: { fontSize: 20, fontWeight: "700", color: theme.color.textPrimary },
  summaryLabel: { ...theme.font.caption },
  providerHint: { ...theme.font.caption, marginBottom: theme.spacing.sm, fontStyle: "italic" },
  stopRow: { flexDirection: "row", alignItems: "center", paddingVertical: 6 },
  stopNumber: {
    width: 22, height: 22, borderRadius: 11, backgroundColor: theme.color.primarySoft,
    alignItems: "center", justifyContent: "center", marginRight: 10
  },
  stopNumberText: { color: theme.color.primary, fontWeight: "700", fontSize: 12 },
  stopName: { ...theme.font.bodyStrong, fontSize: 13 },
  stopNameDone: { textDecorationLine: "line-through", color: theme.color.textSecondary },
  stopMeta: { ...theme.font.caption, fontSize: 11 },
  error: { color: theme.color.danger, fontSize: 12, marginBottom: 8 },

  targetCard: {
    backgroundColor: theme.color.primarySoft,
    borderRadius: theme.radius.sm,
    padding: theme.spacing.sm,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.sm
  },
  targetLabel: { ...theme.font.caption, fontSize: 10, fontWeight: "700", color: theme.color.primary, letterSpacing: 1 },
  targetName: { ...theme.font.bodyStrong, fontSize: 15, marginTop: 2 },
  targetMeta: { ...theme.font.caption, fontSize: 12, marginTop: 2, marginBottom: 8 },
  targetBtnRow: { flexDirection: "row", gap: 8 },
  gateHint: { ...theme.font.caption, fontSize: 11, color: theme.color.textSecondary, textAlign: "center", marginTop: 8, fontStyle: "italic" },
  navBtn: { flex: 1, backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.primary, padding: 10, borderRadius: theme.radius.sm, alignItems: "center" },
  navBtnText: { color: theme.color.primary, fontWeight: "700", fontSize: 13 },
  nextBtn: { flex: 1.4, backgroundColor: theme.color.primary, padding: 10, borderRadius: theme.radius.sm, alignItems: "center" },
  nextBtnText: { color: theme.color.textOnPrimary, fontWeight: "700", fontSize: 13 },
  stopRowActive: { backgroundColor: theme.color.primarySoft, borderRadius: theme.radius.sm },
  stopNumberDone: { backgroundColor: "#d1d5db" },
  stopNumberActive: { backgroundColor: "#22c55e" },
  stopNumberHome: { backgroundColor: theme.color.border }
});
