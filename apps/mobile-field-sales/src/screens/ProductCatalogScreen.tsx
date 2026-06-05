import { useCallback, useMemo, useState, type JSX } from "react";
import {
  View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { apiClient } from "../api-service";
import type { ProductSummary } from "@orbit/api-client";
import { useTheme } from "../theme-context";
import type { Theme } from "../theme";
import { formatMinor, useOrgCurrency } from "../money";

export type CartLine = { productId: string; name: string; unitPriceCents: number; quantity: number };

interface Props {
  outletId: string;
  outletName: string;
  initialCart?: CartLine[];
  onReviewOrder: (cart: CartLine[]) => void;
}

export function ProductCatalogScreen({ outletName, initialCart, onReviewOrder }: Props): JSX.Element {
  const { theme } = useTheme();
  const currency = useOrgCurrency();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [products, setProducts] = useState<ProductSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<Map<string, CartLine>>(() => {
    const m = new Map<string, CartLine>();
    (initialCart ?? []).forEach((l) => m.set(l.productId, { ...l }));
    return m;
  });

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await apiClient.listProducts();
      setProducts(result.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load products");
      setProducts([]);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const filtered = useMemo(() => {
    if (!products) return [];
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q));
  }, [products, search]);

  const totalItems = useMemo(() => {
    let n = 0;
    cart.forEach((l) => { n += l.quantity; });
    return n;
  }, [cart]);

  const totalCents = useMemo(() => {
    let t = 0;
    cart.forEach((l) => { t += l.unitPriceCents * l.quantity; });
    return t;
  }, [cart]);

  function addOne(p: ProductSummary) {
    setCart((prev) => {
      const next = new Map(prev);
      const existing = next.get(p.id);
      const newQty = (existing?.quantity ?? 0) + 1;
      if (newQty > p.inventoryAvailable) return prev;
      next.set(p.id, {
        productId: p.id,
        name: p.name,
        unitPriceCents: p.unitPriceCents,
        quantity: newQty
      });
      return next;
    });
  }

  function removeOne(productId: string) {
    setCart((prev) => {
      const next = new Map(prev);
      const existing = next.get(productId);
      if (!existing) return prev;
      if (existing.quantity <= 1) next.delete(productId);
      else next.set(productId, { ...existing, quantity: existing.quantity - 1 });
      return next;
    });
  }

  function inCart(productId: string): number {
    return cart.get(productId)?.quantity ?? 0;
  }

  if (products === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.color.primary} />
        <Text style={[styles.muted, { marginTop: theme.spacing.sm }]}>Loading catalogue…</Text>
      </View>
    );
  }

  return (
    <View style={styles.shell}>
      <View style={styles.header}>
        <Text style={styles.outletName}>{outletName}</Text>
        <Text style={styles.outletSub}>Add products to this order</Text>
      </View>

      <TextInput
        style={styles.search}
        value={search}
        onChangeText={setSearch}
        placeholder="Search products or SKU"
        placeholderTextColor={theme.color.textMuted}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        data={filtered}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ paddingBottom: 120 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No products match</Text>
            <Text style={styles.muted}>Try a different search.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const qty = inCart(item.id);
          const outOfStock = item.inventoryAvailable === 0;
          const atMax = qty >= item.inventoryAvailable;
          return (
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.productName}>{item.name}</Text>
                <Text style={styles.productMeta}>
                  SKU {item.sku} · {item.inventoryAvailable} in stock
                </Text>
                <Text style={styles.productPrice}>{formatMinor(item.unitPriceCents, currency)}</Text>
              </View>
              <View style={styles.qtyBox}>
                {qty === 0 ? (
                  <TouchableOpacity
                    style={[styles.addBtn, outOfStock && styles.addBtnDisabled]}
                    disabled={outOfStock}
                    onPress={() => addOne(item)}
                  >
                    <Text style={styles.addBtnText}>{outOfStock ? "Out of stock" : "Add"}</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.stepper}>
                    <TouchableOpacity style={styles.stepperBtn} onPress={() => removeOne(item.id)}>
                      <Text style={styles.stepperBtnText}>−</Text>
                    </TouchableOpacity>
                    <Text style={styles.stepperQty}>{qty}</Text>
                    <TouchableOpacity
                      style={[styles.stepperBtn, atMax && styles.stepperBtnDisabled]}
                      disabled={atMax}
                      onPress={() => addOne(item)}
                    >
                      <Text style={styles.stepperBtnText}>+</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          );
        }}
      />

      {cart.size > 0 ? (
        <TouchableOpacity
          style={styles.cartBar}
          onPress={() => onReviewOrder(Array.from(cart.values()))}
        >
          <Text style={styles.cartCount}>
            {totalItems} item{totalItems === 1 ? "" : "s"} · {formatMinor(totalCents, currency)}
          </Text>
          <Text style={styles.cartCta}>Review order →</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const makeStyles = (theme: Theme) => StyleSheet.create({
  shell: { flex: 1, backgroundColor: theme.color.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.color.background },
  header: { padding: theme.spacing.lg, paddingBottom: theme.spacing.sm },
  outletName: { ...theme.font.title },
  outletSub: { ...theme.font.caption, marginTop: theme.spacing.xs },
  search: {
    marginHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
    padding: 10,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.color.borderStrong,
    backgroundColor: theme.color.surface,
    color: theme.color.textPrimary,
    fontSize: 14
  },
  error: { color: theme.color.danger, paddingHorizontal: theme.spacing.lg, paddingVertical: 4 },
  empty: { alignItems: "center", padding: theme.spacing.xl },
  emptyTitle: { ...theme.font.bodyStrong, marginBottom: theme.spacing.xs },
  muted: { ...theme.font.caption },
  row: {
    flexDirection: "row",
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.color.border,
    alignItems: "center"
  },
  productName: { ...theme.font.bodyStrong },
  productMeta: { ...theme.font.caption, marginTop: 2 },
  productPrice: { color: theme.color.primary, fontWeight: "600", fontSize: 14, marginTop: 4 },
  qtyBox: { marginLeft: theme.spacing.md },
  addBtn: {
    backgroundColor: theme.color.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: theme.radius.sm
  },
  addBtnDisabled: { backgroundColor: theme.color.borderStrong },
  addBtnText: { color: theme.color.textOnPrimary, fontWeight: "600", fontSize: 13 },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.color.primarySoft,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 4
  },
  stepperBtn: {
    width: 32, height: 32, alignItems: "center", justifyContent: "center"
  },
  stepperBtnDisabled: { opacity: 0.4 },
  stepperBtnText: { color: theme.color.primary, fontWeight: "700", fontSize: 18 },
  stepperQty: { color: theme.color.textPrimary, fontWeight: "600", minWidth: 24, textAlign: "center" },
  cartBar: {
    position: "absolute",
    left: theme.spacing.lg, right: theme.spacing.lg, bottom: theme.spacing.lg,
    backgroundColor: theme.color.primary,
    padding: 14,
    borderRadius: theme.radius.md,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8,
    elevation: 4
  },
  cartCount: { color: theme.color.textOnPrimary, fontWeight: "600", fontSize: 14 },
  cartCta: { color: theme.color.textOnPrimary, fontWeight: "700", fontSize: 14 }
});
