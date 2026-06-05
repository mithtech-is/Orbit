/**
 * Minimal Medusa admin HTTP client used by the dev-server scaffold to bridge
 * Orbit `field_order` records into Medusa `draft_order` entities, so they
 * show up in the Medusa admin UI at :9001/app/orders.
 *
 * Design note: this is a "best-effort" dual-write — Orbit's local order
 * succeeds even if Medusa is down. The Medusa side is fire-and-forget with a
 * caught error so the rep's order is never blocked by infrastructure outages.
 * See docs/engineering/order-flow-audit.md for the architectural rationale.
 */

interface MedusaBridgeConfig {
  backendUrl: string;
  adminEmail: string;
  adminPassword: string;
  regionId: string;
  salesChannelId: string;
  customerEmail: string;
}

let cachedToken: { value: string; expiresAt: number } | undefined;

function readConfig(): MedusaBridgeConfig | null {
  const cfg: MedusaBridgeConfig = {
    backendUrl: process.env.MEDUSA_BRIDGE_URL ?? "http://localhost:9001",
    adminEmail: process.env.MEDUSA_BRIDGE_ADMIN_EMAIL ?? "admin@mithtech.local",
    adminPassword: process.env.MEDUSA_BRIDGE_ADMIN_PASSWORD ?? "admin12345",
    regionId: process.env.MEDUSA_BRIDGE_REGION_ID ?? "",
    salesChannelId: process.env.MEDUSA_BRIDGE_SALES_CHANNEL_ID ?? "",
    customerEmail: process.env.MEDUSA_BRIDGE_CUSTOMER_EMAIL ?? "orders@mithtech.local"
  };
  if (!cfg.regionId || !cfg.salesChannelId) return null;
  return cfg;
}

async function getAdminToken(cfg: MedusaBridgeConfig): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60_000) return cachedToken.value;

  const response = await fetch(`${cfg.backendUrl}/auth/user/emailpass`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: cfg.adminEmail, password: cfg.adminPassword })
  });
  if (!response.ok) {
    throw new Error(`medusa admin auth failed: ${response.status}`);
  }
  const body = (await response.json()) as { token?: string };
  if (!body.token) throw new Error("medusa admin auth returned no token");
  cachedToken = { value: body.token, expiresAt: now + 23 * 3600 * 1000 };
  return body.token;
}

export interface BridgeOrderLine {
  /** Field-product id (kept as metadata for traceability). */
  productId: string;
  /** Human-readable product name to show in Medusa admin. */
  title: string;
  /** Per-unit price in the smallest currency unit (e.g. paise / cents). */
  unitPriceCents: number;
  quantity: number;
}

export interface BridgeOrderInput {
  fieldOrderId: string;
  organisationId: string;
  outletId: string;
  outletName: string;
  repUserId: string;
  source: string;
  lines: BridgeOrderLine[];
}

export interface BridgeOrderResult {
  /** Medusa draft-order id (e.g. `order_01KSQ2D7F6WXBJ9EH2A3P79F99`). */
  medusaOrderId: string;
}

/**
 * Create a Medusa draft order mirroring a Orbit field_order. Returns the
 * Medusa order id so the caller can persist it back to `field_order.medusa_order_id`.
 *
 * Throws on transport / auth / API errors. Callers should swallow these to keep
 * the user-facing flow non-blocking — the local field_order has already
 * persisted, and the bridge can be retried later.
 */
export async function bridgeFieldOrderToMedusa(input: BridgeOrderInput): Promise<BridgeOrderResult> {
  const cfg = readConfig();
  if (!cfg) {
    throw new Error("medusa bridge not configured (MEDUSA_BRIDGE_REGION_ID and MEDUSA_BRIDGE_SALES_CHANNEL_ID required)");
  }

  const token = await getAdminToken(cfg);

  const items = input.lines.map((line) => ({
    title: line.title,
    unit_price: line.unitPriceCents,
    quantity: line.quantity,
    metadata: { field_product_id: line.productId }
  }));

  const response = await fetch(`${cfg.backendUrl}/admin/draft-orders`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      region_id: cfg.regionId,
      sales_channel_id: cfg.salesChannelId,
      email: cfg.customerEmail,
      items,
      metadata: {
        routepilot_field_order_id: input.fieldOrderId,
        routepilot_organisation_id: input.organisationId,
        routepilot_outlet_id: input.outletId,
        routepilot_outlet_name: input.outletName,
        routepilot_rep_user_id: input.repUserId,
        routepilot_source: input.source
      }
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`medusa draft-order create failed (${response.status}): ${errorBody.slice(0, 200)}`);
  }

  const body = (await response.json()) as { draft_order?: { id?: string } };
  const medusaOrderId = body.draft_order?.id;
  if (!medusaOrderId) throw new Error("medusa draft-order create returned no id");

  return { medusaOrderId };
}

export function isMedusaBridgeConfigured(): boolean {
  return readConfig() !== null;
}
