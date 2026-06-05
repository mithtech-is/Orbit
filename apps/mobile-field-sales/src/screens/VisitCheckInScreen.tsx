import { useEffect, useMemo, useState, type JSX } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import type { RouteStopDetail } from "@orbit/api-client";
import type { OfflineSync } from "../sync/offline-queue";
import { apiClient } from "../api-service";
import { emitVisitCompleted, onOrderCreated } from "../visits/visit-events";
import { buildVisitCheckoutMutation } from "../visits/checkout-payload";
import { useTheme } from "../theme-context";
import type { Theme } from "../theme";

interface Props {
  planId: string;
  stop: RouteStopDetail;
  getCurrentPosition: () => Promise<{ latitude: number; longitude: number }>;
  sync: OfflineSync;
  flushNow: () => Promise<void>;
  onCompleted: () => void;
  onCreateOrder?: () => void;
  /** When set, resume an already-checked-in visit: skip check-in, go straight to
   *  the in-progress form so the rep can finish a stuck/abandoned visit. */
  resumeVisitId?: string;
}

type Stage = "ready" | "checking_in" | "in_progress" | "checking_out" | "done";

interface ExpenseRow { category: string; amount: string }
interface IntelRow { competitor: string; product: string; price: string }
interface SampleRow { item: string; qty: string; recipient: string }
interface ProofPhoto { id: string; uri: string; contentType: string }

const EXPENSE_CATEGORIES = ["Fuel", "Toll", "Food", "Parking", "Other"];
// Common visit outcomes as one-tap chips. The rep can still type a custom one.
const OUTCOME_OPTIONS = ["Order taken", "No requirement", "Shop closed", "Follow-up needed", "Sampling done", "Payment collected"];

export function VisitCheckInScreen({ planId, stop, getCurrentPosition, sync, flushNow, onCompleted, onCreateOrder, resumeVisitId }: Props): JSX.Element {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  // Resuming an existing visit jumps straight to the in-progress form.
  const [stage, setStage] = useState<Stage>(resumeVisitId ? "in_progress" : "ready");
  const [visitId, setVisitId] = useState<string | null>(resumeVisitId ?? null);
  const [notes, setNotes] = useState("");
  // Required fields — start empty so the rep must deliberately fill them in.
  const [outcome, setOutcome] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Set true once an order is submitted for this outlet during the visit (the
  // order screens emit it as they unwind back here). Drives the confirmation
  // banner + auto-suggests the outcome.
  const [orderSaved, setOrderSaved] = useState(false);

  // --- Optional richer capture (Phase 3) — shown inline, never hidden ---
  const [rating, setRating] = useState<number | null>(null);
  const [nps, setNps] = useState("");
  const [feedbackText, setFeedbackText] = useState("");
  const [metWith, setMetWith] = useState("");
  const [proofPhotos, setProofPhotos] = useState<ProofPhoto[]>([]);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [intel, setIntel] = useState<IntelRow[]>([]);
  const [samples, setSamples] = useState<SampleRow[]>([]);

  // A visit can only be completed once its required details are filled in. This
  // is what gates the guided route map from advancing to the next stop.
  const canComplete = outcome.trim().length > 0 && notes.trim().length > 0 && proofPhotos.length > 0;

  // When an order is submitted mid-visit, the order stack unwinds back to this
  // (still-mounted) screen. Confirm it and pre-fill the outcome so completing
  // the visit is one tap away — the rep just adds notes.
  useEffect(() => onOrderCreated((outletId) => {
    if (outletId !== stop.outletId) return;
    setOrderSaved(true);
    setOutcome((cur) => (cur.trim() ? cur : "Order taken"));
  }), [stop.outletId]);

  async function handleCheckIn() {
    setError(null);
    setStage("checking_in");

    let pos: { latitude: number; longitude: number };
    try {
      pos = await getCurrentPosition();
    } catch {
      setError("Couldn't read your location. Turn on GPS/location and try again.");
      setStage("ready");
      return;
    }

    const id = `visit_${planId}_${stop.id}_${Date.now()}`;
    const key = `checkin_${id}`;
    sync.enqueueMutation({
      idempotencyKey: key,
      type: "visit.check_in",
      payload: { id, outletId: stop.outletId, latitude: pos.latitude, longitude: pos.longitude }
    });

    // CONFIRM the check-in with the server before advancing. The server enforces
    // the geofence (you must be physically at the outlet); if it rejects, we stay
    // on this screen and show why — instead of letting the rep complete a
    // "phantom" visit that never actually persists (the old bug: an off-target
    // check-in was rejected but the flow continued, so Home stayed at 0/0).
    let mutation = sync.queue.get(key);
    try {
      await sync.flush();
      mutation = sync.queue.get(key);
    } catch {
      mutation = sync.queue.get(key);
    }

    if (mutation?.status === "synced") {
      setVisitId(id);
      setStage("in_progress");
      return;
    }

    const reason = mutation?.lastError ?? "";
    // Genuinely offline (couldn't reach the server) → keep it queued and proceed
    // optimistically; the server re-validates when connectivity returns. Anything
    // else is a real server rejection (too far / open visit elsewhere) — show it.
    if (!mutation || mutation.status === "pending" || isOfflineError(reason)) {
      setVisitId(id);
      void flushNow();
      setStage("in_progress");
      return;
    }
    setError(reason || `Couldn't check in at ${stop.outletName}. Please try again.`);
    setStage("ready");
  }

  function buildExtras(): Record<string, unknown> {
    return {
      feedbackRating: rating,
      npsScore: nps.trim() ? Number(nps) : null,
      feedbackText: feedbackText.trim() || null,
      signedBy: metWith.trim() || null,
      proofPhotoIds: proofPhotos.map((p) => p.id),
      expenses: expenses
        .filter((e) => e.category.trim() && e.amount.trim())
        .map((e) => ({ category: e.category.trim(), amountCents: Math.round((Number(e.amount) || 0) * 100) })),
      competitorIntel: intel
        .filter((i) => i.competitor.trim())
        .map((i) => ({
          competitorName: i.competitor.trim(),
          productName: i.product.trim() || null,
          priceCents: i.price.trim() ? Math.round((Number(i.price) || 0) * 100) : null
        })),
      samples: samples
        .filter((s) => s.item.trim())
        .map((s) => ({ itemName: s.item.trim(), quantity: s.qty.trim() ? Number(s.qty) || 1 : 1, recipientName: s.recipient.trim() || null }))
    };
  }

  async function attachProofPhoto(source: "camera" | "library") {
    if (!visitId) return;
    setError(null);
    setPhotoUploading(true);
    try {
      const permission = source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError(source === "camera" ? "Camera permission is required to capture visit proof." : "Photo permission is required to upload visit proof.");
        return;
      }

      const result = source === "camera"
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.65, base64: true })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.65, base64: true });
      if (result.canceled) return;

      const asset = result.assets?.[0];
      if (!asset?.base64) {
        setError("The selected photo could not be read. Try taking the photo again.");
        return;
      }

      let pos: { latitude: number; longitude: number } | null = null;
      try {
        pos = await getCurrentPosition();
      } catch {
        pos = null;
      }
      const contentType = asset.mimeType?.startsWith("image/") ? asset.mimeType : "image/jpeg";
      const uploaded = await apiClient.uploadFile({
        category: "visit_proof_photo",
        visitId,
        contentType,
        dataBase64: asset.base64,
        caption: metWith.trim() ? `Met with ${metWith.trim()}` : "Visit proof photo",
        latitude: pos?.latitude,
        longitude: pos?.longitude
      });
      setProofPhotos((photos) => [...photos, { id: uploaded.id, uri: asset.uri, contentType }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to upload proof photo. Please try again.");
    } finally {
      setPhotoUploading(false);
    }
  }

  async function handleCheckOut() {
    if (!visitId) return;
    if (!canComplete) {
      setError("Enter the visit outcome and notes before completing this stop.");
      return;
    }
    setError(null);
    setStage("checking_out");
    try {
      sync.enqueueMutation(buildVisitCheckoutMutation({
        visitId,
        outcome: outcome.trim(),
        notes: notes.trim(),
        proofPhotoIds: proofPhotos.map((p) => p.id),
        extras: buildExtras()
      }));
      void flushNow();
      setStage("done");
      // Tell the guided route map this stop is done so it can advance. Only a
      // completed visit (with required details) ever moves the rep forward.
      emitVisitCompleted(stop.outletId);
      onCompleted();
    } catch {
      setError("Unable to record check-out. Please try again.");
      setStage("in_progress");
    }
  }

  const pendingCount = sync.queue.pending().length;

  return (
    <ScrollView style={styles.shell} contentContainerStyle={{ padding: theme.spacing.lg }}>
      <Text style={styles.title}>{stop.outletName}</Text>
      <Text style={styles.meta}>Stop {stop.stopOrder} · expected {stop.expectedDurationMinutes} min</Text>

      {pendingCount > 0 ? (
        <View style={styles.pendingPill}>
          <Text style={styles.pendingText}>
            {pendingCount} change{pendingCount === 1 ? "" : "s"} saved offline — will sync when reconnected
          </Text>
        </View>
      ) : null}

      {stage === "ready" || stage === "checking_in" ? (
        <TouchableOpacity style={[styles.primary, stage === "checking_in" && styles.primaryDisabled]} onPress={handleCheckIn} disabled={stage === "checking_in"}>
          {stage === "checking_in" ? <ActivityIndicator color={theme.color.textOnPrimary} /> : <Text style={styles.primaryText}>Check in here</Text>}
        </TouchableOpacity>
      ) : null}

      {stage === "in_progress" && onCreateOrder ? (
        <TouchableOpacity style={styles.secondary} onPress={onCreateOrder}>
          <Ionicons name="cart-outline" size={18} color={theme.color.primary} />
          <Text style={styles.secondaryText}>{orderSaved ? "Add another order" : "Create order"}</Text>
        </TouchableOpacity>
      ) : null}

      {orderSaved ? (
        <View style={styles.orderSavedPill}>
          <Ionicons name="checkmark-circle" size={16} color={theme.color.success} />
          <Text style={styles.orderSavedText}>Order saved. Add your notes below, then complete the visit.</Text>
        </View>
      ) : null}

      {stage === "in_progress" || stage === "checking_out" ? (
        <>
          {/* Required core — what happened at this outlet. */}
          <View style={styles.sectionHeadRow}>
            <Text style={styles.sectionTitle}>What happened here?</Text>
            <View style={[styles.tag, styles.tagRequired]}><Text style={styles.tagRequiredText}>Required</Text></View>
          </View>

          <Text style={styles.label}>Outcome *</Text>
          <View style={styles.chipRow}>
            {OUTCOME_OPTIONS.map((o) => (
              <TouchableOpacity key={o} onPress={() => setOutcome(o)} style={[styles.chip, outcome === o ? styles.chipOn : null]}>
                <Text style={[styles.chipText, outcome === o ? styles.chipTextOn : null]}>{o}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput style={[styles.input, { marginTop: 8 }]} value={outcome} onChangeText={setOutcome} placeholder="…or type your own outcome" placeholderTextColor={theme.color.textMuted} />

          <Text style={styles.label}>Notes *</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={notes}
            onChangeText={setNotes}
            multiline
            placeholder="What did you see and discuss? Shelf, stock, follow-ups…"
            placeholderTextColor={theme.color.textMuted}
          />

          {/* Optional richer capture — always visible, clearly optional. */}
          <View style={[styles.sectionHeadRow, { marginTop: theme.spacing.xl }]}>
            <Text style={styles.sectionTitle}>Visit details</Text>
            <View style={[styles.tag, styles.tagOptional]}><Text style={styles.tagOptionalText}>Optional</Text></View>
          </View>
          <Text style={styles.detailsHint}>Anything useful — it feeds your performance reports and the team dashboard.</Text>

          {/* Customer feedback */}
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <Ionicons name="happy-outline" size={18} color={theme.color.primary} />
              <Text style={styles.cardTitle}>Customer feedback</Text>
            </View>
            <Text style={styles.label}>Rating</Text>
            <View style={styles.starRow}>
              {[1, 2, 3, 4, 5].map((n) => (
                <TouchableOpacity key={n} onPress={() => setRating(rating === n ? null : n)} style={[styles.star, rating != null && n <= rating ? styles.starOn : null]}>
                  <Text style={[styles.starText, rating != null && n <= rating ? styles.starTextOn : null]}>★</Text>
                </TouchableOpacity>
              ))}
              {rating != null ? (
                <TouchableOpacity onPress={() => setRating(null)} style={styles.clearStar}><Text style={styles.clearStarText}>clear</Text></TouchableOpacity>
              ) : null}
            </View>
            <Text style={styles.label}>Would recommend us (0–10)</Text>
            <TextInput style={styles.input} value={nps} onChangeText={(t) => setNps(t.replace(/[^0-9]/g, "").slice(0, 2))} keyboardType="number-pad" placeholder="0–10" placeholderTextColor={theme.color.textMuted} />
            <Text style={styles.label}>What did they say?</Text>
            <TextInput style={[styles.input, styles.multiline]} value={feedbackText} onChangeText={setFeedbackText} multiline placeholder="Customer comments, complaints, requests…" placeholderTextColor={theme.color.textMuted} />
          </View>

          {/* Expenses */}
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <Ionicons name="wallet-outline" size={18} color={theme.color.primary} />
              <Text style={styles.cardTitle}>Expenses</Text>
              <TouchableOpacity style={styles.addPill} onPress={() => setExpenses((r) => [...r, { category: "Fuel", amount: "" }])}>
                <Ionicons name="add" size={14} color={theme.color.primary} /><Text style={styles.addPillText}>Add</Text>
              </TouchableOpacity>
            </View>
            {expenses.length === 0 ? <Text style={styles.cardEmpty}>Log fuel, tolls or food spent on this visit.</Text> : null}
            {expenses.map((row, i) => (
              <View key={i} style={styles.rowCard}>
                <View style={styles.chipRow}>
                  {EXPENSE_CATEGORIES.map((c) => (
                    <TouchableOpacity key={c} onPress={() => setExpenses((rs) => rs.map((r, idx) => idx === i ? { ...r, category: c } : r))} style={[styles.chip, row.category === c ? styles.chipOn : null]}>
                      <Text style={[styles.chipText, row.category === c ? styles.chipTextOn : null]}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.twoCol}>
                  <TextInput style={[styles.input, { flex: 1 }]} value={row.amount} onChangeText={(t) => setExpenses((rs) => rs.map((r, idx) => idx === i ? { ...r, amount: t.replace(/[^0-9.]/g, "") } : r))} keyboardType="decimal-pad" placeholder="Amount ₹" placeholderTextColor={theme.color.textMuted} />
                  <RemoveBtn onPress={() => setExpenses((rs) => rs.filter((_, idx) => idx !== i))} styles={styles} />
                </View>
              </View>
            ))}
          </View>

          {/* Competitor intel */}
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <Ionicons name="eye-outline" size={18} color={theme.color.primary} />
              <Text style={styles.cardTitle}>Competitor intel</Text>
              <TouchableOpacity style={styles.addPill} onPress={() => setIntel((r) => [...r, { competitor: "", product: "", price: "" }])}>
                <Ionicons name="add" size={14} color={theme.color.primary} /><Text style={styles.addPillText}>Add</Text>
              </TouchableOpacity>
            </View>
            {intel.length === 0 ? <Text style={styles.cardEmpty}>Spotted a rival brand, scheme or price? Note it here.</Text> : null}
            {intel.map((row, i) => (
              <View key={i} style={styles.rowCard}>
                <TextInput style={styles.input} value={row.competitor} onChangeText={(t) => setIntel((rs) => rs.map((r, idx) => idx === i ? { ...r, competitor: t } : r))} placeholder="Competitor brand" placeholderTextColor={theme.color.textMuted} />
                <View style={styles.twoCol}>
                  <TextInput style={[styles.input, { flex: 1.4 }]} value={row.product} onChangeText={(t) => setIntel((rs) => rs.map((r, idx) => idx === i ? { ...r, product: t } : r))} placeholder="Product / SKU" placeholderTextColor={theme.color.textMuted} />
                  <TextInput style={[styles.input, { flex: 1 }]} value={row.price} onChangeText={(t) => setIntel((rs) => rs.map((r, idx) => idx === i ? { ...r, price: t.replace(/[^0-9.]/g, "") } : r))} keyboardType="decimal-pad" placeholder="Price ₹" placeholderTextColor={theme.color.textMuted} />
                  <RemoveBtn onPress={() => setIntel((rs) => rs.filter((_, idx) => idx !== i))} styles={styles} />
                </View>
              </View>
            ))}
          </View>

          {/* Samples distributed */}
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <Ionicons name="gift-outline" size={18} color={theme.color.primary} />
              <Text style={styles.cardTitle}>Samples distributed</Text>
              <TouchableOpacity style={styles.addPill} onPress={() => setSamples((r) => [...r, { item: "", qty: "1", recipient: "" }])}>
                <Ionicons name="add" size={14} color={theme.color.primary} /><Text style={styles.addPillText}>Add</Text>
              </TouchableOpacity>
            </View>
            {samples.length === 0 ? <Text style={styles.cardEmpty}>Gave out free samples? Record what and how many.</Text> : null}
            {samples.map((row, i) => (
              <View key={i} style={styles.rowCard}>
                <View style={styles.twoCol}>
                  <TextInput style={[styles.input, { flex: 1.6 }]} value={row.item} onChangeText={(t) => setSamples((rs) => rs.map((r, idx) => idx === i ? { ...r, item: t } : r))} placeholder="Item" placeholderTextColor={theme.color.textMuted} />
                  <TextInput style={[styles.input, { flex: 0.7 }]} value={row.qty} onChangeText={(t) => setSamples((rs) => rs.map((r, idx) => idx === i ? { ...r, qty: t.replace(/[^0-9.]/g, "") } : r))} keyboardType="decimal-pad" placeholder="Qty" placeholderTextColor={theme.color.textMuted} />
                  <RemoveBtn onPress={() => setSamples((rs) => rs.filter((_, idx) => idx !== i))} styles={styles} />
                </View>
                <TextInput style={styles.input} value={row.recipient} onChangeText={(t) => setSamples((rs) => rs.map((r, idx) => idx === i ? { ...r, recipient: t } : r))} placeholder="Recipient (optional)" placeholderTextColor={theme.color.textMuted} />
              </View>
            ))}
          </View>

          {/* Visit proof — uploaded photo replaces customer signature capture. */}
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <Ionicons name="camera-outline" size={18} color={theme.color.primary} />
              <Text style={styles.cardTitle}>Visit proof photo</Text>
              <View style={[styles.tag, styles.tagRequired]}><Text style={styles.tagRequiredText}>Required</Text></View>
            </View>
            <TextInput style={styles.input} value={metWith} onChangeText={setMetWith} placeholder="Name of person met (optional)" placeholderTextColor={theme.color.textMuted} />
            <View style={styles.photoActions}>
              <TouchableOpacity style={[styles.photoButton, photoUploading ? styles.primaryDisabled : null]} disabled={photoUploading} onPress={() => void attachProofPhoto("camera")}>
                <Ionicons name="camera-outline" size={18} color={theme.color.primary} />
                <Text style={styles.photoButtonText}>{photoUploading ? "Uploading…" : "Take photo"}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.photoButton, photoUploading ? styles.primaryDisabled : null]} disabled={photoUploading} onPress={() => void attachProofPhoto("library")}>
                <Ionicons name="image-outline" size={18} color={theme.color.primary} />
                <Text style={styles.photoButtonText}>Upload photo</Text>
              </TouchableOpacity>
            </View>
            {proofPhotos.length === 0 ? (
              <Text style={styles.cardEmpty}>Add at least one photo from the meeting before completing the visit.</Text>
            ) : (
              <View style={styles.photoGrid}>
                {proofPhotos.map((photo) => (
                  <Image key={photo.id} source={{ uri: photo.uri }} style={styles.photoThumb} />
                ))}
              </View>
            )}
          </View>

          <TouchableOpacity
            style={[styles.primary, (stage === "checking_out" || !canComplete) && styles.primaryDisabled]}
            onPress={handleCheckOut}
            disabled={stage === "checking_out" || !canComplete}
          >
            {stage === "checking_out" ? <ActivityIndicator color={theme.color.textOnPrimary} /> : <Text style={styles.primaryText}>Complete visit</Text>}
          </TouchableOpacity>
          {!canComplete ? (
            <Text style={styles.requiredHint}>Add an outcome, notes and a proof photo to complete this visit — an order isn't required.</Text>
          ) : null}
        </>
      ) : null}

      {stage === "done" ? (
        <View style={styles.successPill}>
          <Text style={styles.successText}>Visit completed. Changes will sync automatically.</Text>
        </View>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

/** True when an error reads like a connectivity failure (vs a server rejection). */
function isOfflineError(msg: string): boolean {
  return /network|fetch|timeout|connection|offline|failed to fetch|networkerror|aborted/i.test(msg);
}

function RemoveBtn({ onPress, styles }: { onPress: () => void; styles: ReturnType<typeof makeStyles> }): JSX.Element {
  return (
    <TouchableOpacity onPress={onPress} style={styles.removeBtn}>
      <Text style={styles.removeText}>✕</Text>
    </TouchableOpacity>
  );
}

const makeStyles = (theme: Theme) => StyleSheet.create({
  shell: { flex: 1, backgroundColor: theme.color.background },
  title: { ...theme.font.title },
  meta: { ...theme.font.caption, marginTop: theme.spacing.xs, marginBottom: theme.spacing.lg },
  pendingPill: {
    backgroundColor: theme.color.warningSoft,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: "rgba(180, 83, 9, 0.2)"
  },
  pendingText: { color: theme.color.warning, fontSize: 12, fontWeight: "500" },
  primary: {
    backgroundColor: theme.color.primary,
    padding: 14,
    borderRadius: theme.radius.sm,
    alignItems: "center",
    marginTop: theme.spacing.lg
  },
  primaryDisabled: { opacity: 0.55 },
  primaryText: { color: theme.color.textOnPrimary, fontWeight: "600", fontSize: 15 },
  secondary: {
    backgroundColor: theme.color.primarySoft,
    padding: 12,
    borderRadius: theme.radius.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: theme.spacing.md
  },
  secondaryText: { color: theme.color.primary, fontWeight: "600", fontSize: 14 },
  orderSavedPill: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: theme.color.successSoft,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm,
    marginTop: theme.spacing.md,
    borderWidth: 1, borderColor: "rgba(31, 157, 85, 0.2)"
  },
  orderSavedText: { color: theme.color.success, fontWeight: "600", fontSize: 12, flex: 1 },
  requiredHint: { ...theme.font.caption, color: theme.color.textSecondary, marginTop: theme.spacing.sm, textAlign: "center" },
  sectionHeadRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: theme.spacing.lg },
  sectionTitle: { ...theme.font.bodyStrong, fontSize: 16 },
  tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  tagRequired: { backgroundColor: theme.color.primarySoft },
  tagRequiredText: { color: theme.color.primary, fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  tagOptional: { backgroundColor: theme.color.surfaceMuted, borderWidth: 1, borderColor: theme.color.border },
  tagOptionalText: { color: theme.color.textMuted, fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  detailsHint: { ...theme.font.caption, marginTop: 2 },
  card: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1, borderColor: theme.color.border,
    padding: theme.spacing.md,
    marginTop: theme.spacing.md
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardTitle: { ...theme.font.bodyStrong, fontSize: 14, flex: 1 },
  cardEmpty: { ...theme.font.caption, marginTop: theme.spacing.sm },
  addPill: { flexDirection: "row", alignItems: "center", gap: 2, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: theme.color.primarySoft },
  addPillText: { color: theme.color.primary, fontWeight: "700", fontSize: 12 },
  photoActions: { flexDirection: "row", gap: 8, marginTop: theme.spacing.md },
  photoButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.color.borderStrong,
    backgroundColor: theme.color.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6
  },
  photoButtonText: { color: theme.color.primary, fontWeight: "700", fontSize: 13 },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: theme.spacing.md },
  photoThumb: { width: 88, height: 88, borderRadius: theme.radius.sm, backgroundColor: theme.color.surfaceMuted },
  clearStar: { justifyContent: "center", paddingHorizontal: 8 },
  clearStarText: { ...theme.font.caption, color: theme.color.textMuted },
  label: { ...theme.font.label, marginTop: theme.spacing.md, marginBottom: theme.spacing.xs, textTransform: "uppercase" },
  input: {
    backgroundColor: theme.color.surface,
    color: theme.color.textPrimary,
    padding: 12,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.color.borderStrong,
    fontSize: 15,
    marginTop: 4
  },
  multiline: { minHeight: 80, textAlignVertical: "top" },
  successPill: {
    backgroundColor: theme.color.successSoft,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    marginTop: theme.spacing.lg,
    borderWidth: 1,
    borderColor: "rgba(31, 157, 85, 0.2)"
  },
  successText: { color: theme.color.success, fontWeight: "600" },
  error: { color: theme.color.danger, marginTop: theme.spacing.md },
  starRow: { flexDirection: "row", gap: 6, marginTop: 4, alignItems: "center" },
  star: { width: 40, height: 40, borderRadius: theme.radius.sm, borderWidth: 1, borderColor: theme.color.border, alignItems: "center", justifyContent: "center", backgroundColor: theme.color.surface },
  starOn: { backgroundColor: theme.color.warningSoft, borderColor: theme.color.warning },
  starText: { fontSize: 20, color: theme.color.textMuted },
  starTextOn: { color: theme.color.warning },
  twoCol: { flexDirection: "row", gap: 8, alignItems: "center" },
  rowCard: { backgroundColor: theme.color.surfaceMuted, borderRadius: theme.radius.sm, borderWidth: 1, borderColor: theme.color.border, padding: theme.spacing.sm, marginTop: theme.spacing.sm },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: theme.color.border, backgroundColor: theme.color.surface },
  chipOn: { backgroundColor: theme.color.primarySoft, borderColor: theme.color.primary },
  chipText: { fontSize: 12, color: theme.color.textSecondary, fontWeight: "600" },
  chipTextOn: { color: theme.color.primary },
  removeBtn: { width: 38, height: 44, alignItems: "center", justifyContent: "center" },
  removeText: { color: theme.color.danger, fontSize: 16, fontWeight: "700" }
});
