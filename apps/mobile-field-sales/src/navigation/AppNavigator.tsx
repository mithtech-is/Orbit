import { useEffect, useState, type JSX } from "react";
import { NavigationContainer, DefaultTheme, DarkTheme, type Theme as NavTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { ActivityIndicator, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { RouteStopDetail, OutletSummary } from "@orbit/api-client";
import { rehydrateAuth, logoutAndClear } from "../api-service";
import { LoginScreen } from "../screens/LoginScreen";
import { HomeScreen } from "../screens/HomeScreen";
import { MyAnalyticsScreen } from "../screens/MyAnalyticsScreen";
import { VisitCheckInScreen } from "../screens/VisitCheckInScreen";
import { ProductCatalogScreen, type CartLine } from "../screens/ProductCatalogScreen";
import { OrderReviewScreen } from "../screens/OrderReviewScreen";
import { OrderHistoryScreen } from "../screens/OrderHistoryScreen";
import { VisitsListScreen } from "../screens/VisitsListScreen";
import { OutletsListScreen } from "../screens/OutletsListScreen";
import { LeadsListScreen } from "../screens/LeadsListScreen";
import { MoreScreen } from "../screens/MoreScreen";
import { OutletPickerScreen } from "../screens/OutletPickerScreen";
import { CollectPaymentScreen } from "../screens/CollectPaymentScreen";
import { OutletDetailScreen } from "../screens/OutletDetailScreen";
import { RouteMapScreen } from "../screens/RouteMapScreen";
import type { MobileSession, TokenStorage } from "../auth/token-storage";
import { AuthProvider, hasAnyPermission, useAuth } from "../auth/auth-context";
import type { BackgroundPermission, ForegroundPermission } from "../tracking/consent-policy";
import type { WorkSessionState } from "@orbit/shared-types";
import { useOfflineSync } from "../sync/use-offline-sync";
import { requestForegroundLocationPermission, probeForegroundLocationPermission } from "../tracking/location-probes";
import { useActiveTracking } from "../tracking/use-active-tracking";
import { useTheme } from "../theme-context";

export type RootStackParamList = {
  Login: undefined;
  Main: undefined;
  MyAnalytics: undefined;
  VisitCheckIn: { planId: string; stop: RouteStopDetail; resumeVisitId?: string };
  ProductCatalog: { outletId: string; outletName: string; visitId?: string; initialCart?: CartLine[] };
  OrderReview: { outletId: string; outletName: string; visitId?: string; cart: CartLine[] };
  OutletPicker: { mode: "check_in" | "create_order" | "collect_payment" };
  CollectPayment: { outletId: string; outletName: string };
  OutletDetail: { outlet: OutletSummary };
};

export type TabParamList = {
  HomeTab: undefined;
  Map: undefined;
  Visits: undefined;
  Outlets: undefined;
  Leads: undefined;
  Orders: undefined;
  More: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

export interface AppNavigatorProps {
  storage: TokenStorage;
  probes: {
    loadConsent: () => Promise<boolean>;
    loadSessionState: () => Promise<WorkSessionState>;
    foreground: () => Promise<ForegroundPermission>;
    background: () => Promise<BackgroundPermission>;
    getCurrentPosition: () => Promise<{ latitude: number; longitude: number }>;
  };
}

export function AppNavigator({ storage, probes }: AppNavigatorProps): JSX.Element {
  const { theme, scheme } = useTheme();
  const [bootstrapped, setBootstrapped] = useState(false);
  const [session, setSession] = useState<MobileSession | null>(null);

  useEffect(() => {
    void (async () => {
      const restored = await rehydrateAuth(storage);
      setSession(restored);
      setBootstrapped(true);
    })();
  }, [storage]);

  if (!bootstrapped) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.color.background }}>
        <ActivityIndicator color={theme.color.primary} />
      </View>
    );
  }

  // Drive React Navigation's own chrome (card backgrounds, etc.) from our theme
  // so there's never a white flash behind screens in dark mode.
  const navTheme: NavTheme = {
    ...(scheme === "dark" ? DarkTheme : DefaultTheme),
    colors: {
      ...(scheme === "dark" ? DarkTheme : DefaultTheme).colors,
      primary: theme.color.primary,
      background: theme.color.background,
      card: theme.color.surface,
      text: theme.color.textPrimary,
      border: theme.color.border
    }
  };

  return (
    <AuthProvider session={session}>
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: theme.color.surface },
          headerTintColor: theme.color.textPrimary,
          headerTitleStyle: { fontWeight: "600" },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: theme.color.background }
        }}
      >
        {!session ? (
          <Stack.Screen name="Login" options={{ headerShown: false }}>
            {() => <LoginScreen storage={storage} onAuthenticated={(s) => setSession(s)} />}
          </Stack.Screen>
        ) : (
          <>
            <Stack.Screen name="Main" options={{ headerShown: false }}>
              {({ navigation }) => (
                <MainTabs
                  onOpenStop={(planId, stop) => navigation.navigate("VisitCheckIn", { planId, stop })}
                  onResumeVisit={(stop, resumeVisitId) => navigation.navigate("VisitCheckIn", { planId: "resume", stop, resumeVisitId })}
                  onOpenOutletPicker={(mode) => navigation.navigate("OutletPicker", { mode })}
                  onOpenAnalytics={() => navigation.navigate("MyAnalytics")}
                  onOpenOrderFor={(outlet) => navigation.navigate("ProductCatalog", { outletId: outlet.id, outletName: outlet.name })}
                  onOpenDetailFor={(outlet) => navigation.navigate("OutletDetail", { outlet })}
                  onSignOut={async () => {
                    await logoutAndClear(storage);
                    setSession(null);
                  }}
                />
              )}
            </Stack.Screen>
            <Stack.Screen name="MyAnalytics" component={MyAnalyticsScreen} options={{ title: "My performance" }} />
            <Stack.Screen name="VisitCheckIn" options={{ title: "Visit" }}>
              {({ route, navigation }) => (
                <VisitCheckInWrapper
                  planId={route.params.planId}
                  stop={route.params.stop}
                  resumeVisitId={route.params.resumeVisitId}
                  probes={probes}
                  onCompleted={() => navigation.goBack()}
                  onCreateOrder={() => navigation.navigate("ProductCatalog", {
                    outletId: route.params.stop.outletId,
                    outletName: route.params.stop.outletName,
                    visitId: route.params.planId
                  })}
                />
              )}
            </Stack.Screen>
            <Stack.Screen name="ProductCatalog" options={{ title: "Products" }}>
              {({ route, navigation }) => (
                <ProductCatalogScreen
                  outletId={route.params.outletId}
                  outletName={route.params.outletName}
                  initialCart={route.params.initialCart}
                  onReviewOrder={(cart) => navigation.navigate("OrderReview", {
                    outletId: route.params.outletId,
                    outletName: route.params.outletName,
                    visitId: route.params.visitId,
                    cart
                  })}
                />
              )}
            </Stack.Screen>
            <Stack.Screen name="OrderReview" options={{ title: "Review order" }}>
              {({ route, navigation }) => (
                <OrderReviewWrapper
                  outletId={route.params.outletId}
                  outletName={route.params.outletName}
                  visitId={route.params.visitId}
                  cart={route.params.cart}
                  onSubmitted={() => {
                    // Unwind ONLY the two order screens (ProductCatalog + this
                    // OrderReview). When the order was started mid-visit, that
                    // lands back on the still-mounted VisitCheckIn screen so the
                    // rep finishes the visit there — NOT all the way to Home.
                    // From a non-visit entry it lands on whatever opened the
                    // catalog (Outlet detail / Home), which is also correct.
                    if (navigation.canGoBack()) navigation.pop(2);
                  }}
                  onEditCart={() => navigation.navigate("ProductCatalog", {
                    outletId: route.params.outletId,
                    outletName: route.params.outletName,
                    visitId: route.params.visitId,
                    initialCart: route.params.cart
                  })}
                />
              )}
            </Stack.Screen>
            <Stack.Screen name="OutletPicker" options={{ title: "Select outlet" }}>
              {({ route, navigation }) => (
                <OutletPickerScreen
                  mode={route.params.mode}
                  onPick={(outlet) => {
                    if (route.params.mode === "create_order") {
                      navigation.replace("ProductCatalog", { outletId: outlet.id, outletName: outlet.name });
                    } else if (route.params.mode === "collect_payment") {
                      navigation.replace("CollectPayment", { outletId: outlet.id, outletName: outlet.name });
                    } else {
                      // check_in: NAVIGATE (don't replace) so the gated picker
                      // stays in the stack — after completing this visit the rep
                      // returns to it and the next-nearest outlet unlocks.
                      navigation.navigate("VisitCheckIn", { planId: "adhoc", stop: adHocStop(outlet) });
                    }
                  }}
                />
              )}
            </Stack.Screen>
            <Stack.Screen name="CollectPayment" options={{ title: "Collect payment" }}>
              {({ route, navigation }) => (
                <CollectPaymentScreen
                  outletId={route.params.outletId}
                  outletName={route.params.outletName}
                  onDone={() => navigation.goBack()}
                />
              )}
            </Stack.Screen>
            <Stack.Screen name="OutletDetail" options={{ title: "Outlet" }}>
              {({ route, navigation }) => (
                <OutletDetailScreen
                  outlet={route.params.outlet}
                  onOrder={(o) => navigation.navigate("ProductCatalog", { outletId: o.id, outletName: o.name })}
                  onCollectPayment={(o) => navigation.navigate("CollectPayment", { outletId: o.id, outletName: o.name })}
                />
              )}
            </Stack.Screen>
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
    </AuthProvider>
  );
}

/**
 * Per-tab permission requirements. Mirrors the web dashboard nav (see
 * apps/web-dashboard/app/navigation.tsx) so the same `requiredAnyOf` array
 * gates the same feature on both surfaces. `null` = always visible.
 *
 * HomeTab and More are intentionally always-visible: Today is the rep's
 * landing screen, and More owns Sign-out + permission UI that every
 * authenticated user must reach.
 */
const TAB_PERMISSIONS: Record<keyof TabParamList, string[] | null> = {
  HomeTab: null,
  Map: ["visit:write", "route:plan"],
  Visits: ["visit:write", "report:read"],
  Outlets: ["outlet:read", "outlet:write"],
  Leads: ["lead:read", "lead:write"],
  Orders: ["order:create", "report:read"],
  More: null
};

interface MainTabsProps {
  onOpenStop: (planId: string, stop: RouteStopDetail) => void;
  onResumeVisit: (stop: RouteStopDetail, resumeVisitId: string) => void;
  onOpenOutletPicker: (mode: "check_in" | "create_order" | "collect_payment") => void;
  onOpenAnalytics: () => void;
  onOpenOrderFor: (outlet: OutletSummary) => void;
  onOpenDetailFor: (outlet: OutletSummary) => void;
  onSignOut: () => void | Promise<void>;
}

/** Build a minimal ad-hoc stop for an unplanned check-in at an outlet. */
function adHocStop(outlet: OutletSummary): RouteStopDetail {
  return {
    id: `adhoc_${outlet.id}_${Date.now()}`,
    outletId: outlet.id,
    outletName: outlet.name,
    outletLatitude: outlet.latitude,
    outletLongitude: outlet.longitude,
    stopOrder: 1,
    status: "pending",
    expectedDurationMinutes: 15
  };
}

/** Outline/filled Ionicons per tab — filled when focused for a crisp active state. */
const TAB_ICON: Record<keyof TabParamList, { on: keyof typeof Ionicons.glyphMap; off: keyof typeof Ionicons.glyphMap }> = {
  HomeTab: { on: "home", off: "home-outline" },
  Map: { on: "map", off: "map-outline" },
  Visits: { on: "clipboard", off: "clipboard-outline" },
  Outlets: { on: "storefront", off: "storefront-outline" },
  Leads: { on: "people", off: "people-outline" },
  Orders: { on: "receipt", off: "receipt-outline" },
  More: { on: "ellipsis-horizontal-circle", off: "ellipsis-horizontal-circle-outline" }
};

function MainTabs({ onOpenStop, onResumeVisit, onOpenOutletPicker, onOpenAnalytics, onOpenOrderFor, onOpenDetailFor, onSignOut }: MainTabsProps): JSX.Element {
  const offline = useOfflineSync();
  const { session } = useAuth();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  // First-launch foreground location prompt — fires once per app session if not granted.
  useEffect(() => {
    void (async () => {
      const status = await probeForegroundLocationPermission();
      if (status !== "granted") {
        await requestForegroundLocationPermission();
      }
    })();
  }, []);

  // Continuously stream GPS pings while a work session is active and the app
  // is in the foreground. The hook polls /api/v1/tracking to detect when the
  // rep starts/stops a session from the Home screen card, then subscribes to
  // `Location.watchPositionAsync` and POSTs each position to the backend.
  // The backend broadcasts via WebSocket so the manager's live map updates
  // in real time. See [tracking/use-active-tracking.ts].
  useActiveTracking({
    enabled: Boolean(session?.userId),
    userId: session?.userId
  });

  // Drop tabs the current user lacks permission for. A rep (lead:read,
  // outlet:read, visit:write, tracking:send, order:create) keeps all five
  // operational tabs but loses anything report-only; a readonly_analyst sees
  // only Today + More.
  const canSee = (tab: keyof TabParamList): boolean =>
    hasAnyPermission(session?.permissions, TAB_PERMISSIONS[tab]);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarActiveTintColor: theme.color.primary,
        tabBarInactiveTintColor: theme.color.textMuted,
        // Respect the device's bottom safe area (home indicator / gesture bar)
        // so the icons + labels sit comfortably above the edge instead of being
        // jammed against the very bottom.
        tabBarStyle: {
          backgroundColor: theme.color.surface,
          borderTopColor: theme.color.border,
          borderTopWidth: 1,
          height: 60 + insets.bottom,
          paddingBottom: insets.bottom + 8,
          paddingTop: 8
        },
        tabBarItemStyle: { paddingTop: 2 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600", marginTop: 2 },
        tabBarHideOnKeyboard: true,
        tabBarIcon: ({ color, focused, size }) => {
          const icon = TAB_ICON[route.name as keyof TabParamList];
          return <Ionicons name={focused ? icon.on : icon.off} size={size ?? 22} color={color} />;
        },
        headerStyle: { backgroundColor: theme.color.surface },
        headerTintColor: theme.color.textPrimary,
        headerTitleStyle: { fontWeight: "600" },
        headerShadowVisible: false
      })}
    >
      {canSee("HomeTab") && (
        <Tab.Screen name="HomeTab" options={{ headerShown: false, tabBarLabel: "Home" }}>
          {({ navigation }) => (
            <HomeScreen
              pendingMutations={offline.sync.queue.pending().length}
              flushNow={offline.flushNow}
              onOpenStop={onOpenStop}
              onOpenOutletPicker={onOpenOutletPicker}
              onOpenAnalytics={onOpenAnalytics}
              onSignOut={onSignOut}
              onOpenSettings={() => navigation.navigate("More" as never)}
            />
          )}
        </Tab.Screen>
      )}
      {canSee("Map") && (
        <Tab.Screen name="Map" options={{ tabBarLabel: "Map" }}>
          {() => <RouteMapScreen onOpenStop={onOpenStop} />}
        </Tab.Screen>
      )}
      {canSee("Visits") && (
        <Tab.Screen name="Visits">
          {() => (
            <VisitsListScreen
              sync={offline.sync}
              flushNow={offline.flushNow}
              onResume={onResumeVisit}
            />
          )}
        </Tab.Screen>
      )}
      {canSee("Outlets") && (
        <Tab.Screen name="Outlets">
          {() => (
            <OutletsListScreen
              onOpenDetail={onOpenDetailFor}
              onCreateOrder={onOpenOrderFor}
            />
          )}
        </Tab.Screen>
      )}
      {canSee("Leads") && <Tab.Screen name="Leads" component={LeadsListScreen} />}
      {canSee("Orders") && (
        <Tab.Screen name="Orders">
          {() => <OrderHistoryScreen sync={offline.sync} flushNow={offline.flushNow} />}
        </Tab.Screen>
      )}
      {canSee("More") && (
        <Tab.Screen name="More">
          {() => <MoreScreen onSignOut={onSignOut} />}
        </Tab.Screen>
      )}
    </Tab.Navigator>
  );
}

interface VisitCheckInWrapperProps {
  planId: string;
  stop: RouteStopDetail;
  resumeVisitId?: string;
  probes: AppNavigatorProps["probes"];
  onCompleted: () => void;
  onCreateOrder: () => void;
}

function VisitCheckInWrapper({ planId, stop, resumeVisitId, probes, onCompleted, onCreateOrder }: VisitCheckInWrapperProps): JSX.Element {
  const offline = useOfflineSync();
  return (
    <VisitCheckInScreen
      planId={planId}
      stop={stop}
      resumeVisitId={resumeVisitId}
      getCurrentPosition={probes.getCurrentPosition}
      sync={offline.sync}
      flushNow={offline.flushNow}
      onCompleted={onCompleted}
      onCreateOrder={onCreateOrder}
    />
  );
}

interface OrderReviewWrapperProps {
  outletId: string;
  outletName: string;
  visitId?: string;
  cart: CartLine[];
  onSubmitted: () => void;
  onEditCart: () => void;
}

function OrderReviewWrapper({ outletId, outletName, visitId, cart, onSubmitted, onEditCart }: OrderReviewWrapperProps): JSX.Element {
  const offline = useOfflineSync();
  return (
    <OrderReviewScreen
      outletId={outletId}
      outletName={outletName}
      visitId={visitId}
      cart={cart}
      sync={offline.sync}
      flushNow={offline.flushNow}
      onSubmitted={onSubmitted}
      onEditCart={onEditCart}
    />
  );
}
