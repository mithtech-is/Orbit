import { getDatabasePool, queryRows } from "../../db/client.js";

export interface ProductRow {
  id: string;
  organisation_id: string;
  sku: string;
  name: string;
  inventory_available: number;
  unit_price_cents: number;
}

export interface FieldOrderRow {
  id: string;
  organisation_id: string;
  outlet_id: string;
  rep_user_id: string;
  status: string;
  source: string;
  total_cents: number;
  created_at: string;
}

/** Fetch a single order scoped to the tenant (for status transitions/ownership checks). */
export async function getFieldOrder(organisationId: string, id: string): Promise<FieldOrderRow | undefined> {
  const rows = await queryRows<FieldOrderRow>(
     `SELECT id, organisation_id, outlet_id, rep_user_id, status, source, total_cents, created_at
      FROM field_order WHERE organisation_id = $1 AND id = $2`,
    [organisationId, id]
  );
  return rows[0];
}

/** Persist a new status (caller validates the transition via order-status.ts). */
export async function updateFieldOrderStatus(organisationId: string, id: string, status: string): Promise<boolean> {
  const pool = getDatabasePool();
  const res = await pool.query(
    `UPDATE field_order SET status = $1 WHERE organisation_id = $2 AND id = $3`,
    [status, organisationId, id]
  );
  return (res.rowCount ?? 0) > 0;
}

export async function listProducts(organisationId: string): Promise<ProductRow[]> {
  return queryRows<ProductRow>(
    `SELECT id, organisation_id, sku, name, inventory_available, unit_price_cents
     FROM field_product
     WHERE organisation_id = $1
     ORDER BY name ASC`,
    [organisationId]
  );
}

export interface ProductInput {
  id: string;
  organisationId: string;
  sku: string;
  name: string;
  inventoryAvailable: number;
  unitPriceCents: number;
}

/** Create a catalogue product for the tenant. SKU is unique per organisation. */
export async function insertProduct(input: ProductInput): Promise<void> {
  const pool = getDatabasePool();
  await pool.query(
    `INSERT INTO field_product (id, organisation_id, sku, name, inventory_available, unit_price_cents)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [input.id, input.organisationId, input.sku, input.name, Math.max(0, Math.round(input.inventoryAvailable)), Math.max(0, Math.round(input.unitPriceCents))]
  );
}

/** Upsert a product by SKU (ERPNext-primary path). Returns the id (existing or new). */
export async function upsertProductBySku(input: ProductInput): Promise<string> {
  const pool = getDatabasePool();
  const res = await pool.query(
    `INSERT INTO field_product (id, organisation_id, sku, name, inventory_available, unit_price_cents)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (organisation_id, sku)
     DO UPDATE SET name = EXCLUDED.name, inventory_available = EXCLUDED.inventory_available,
                   unit_price_cents = EXCLUDED.unit_price_cents
     RETURNING id`,
    [input.id, input.organisationId, input.sku, input.name, Math.max(0, Math.round(input.inventoryAvailable)), Math.max(0, Math.round(input.unitPriceCents))]
  );
  return res.rows[0].id;
}

/** Update a product's name, price, and stock level (stock is set absolutely — a restock). */
export async function updateProduct(input: ProductInput): Promise<boolean> {
  const pool = getDatabasePool();
  const res = await pool.query(
    `UPDATE field_product
        SET name = $3, sku = $4, inventory_available = $5, unit_price_cents = $6
      WHERE id = $1 AND organisation_id = $2`,
    [input.id, input.organisationId, input.name, input.sku, Math.max(0, Math.round(input.inventoryAvailable)), Math.max(0, Math.round(input.unitPriceCents))]
  );
  return (res.rowCount ?? 0) > 0;
}

export async function listFieldOrders(organisationId: string): Promise<FieldOrderRow[]> {
  return queryRows<FieldOrderRow>(
     `SELECT id, organisation_id, outlet_id, rep_user_id, status, source, total_cents,
             created_at
      FROM field_order
      WHERE organisation_id = $1
      ORDER BY created_at DESC
      LIMIT 200`,
    [organisationId]
  );
}

/**
 * Rep-scoped order list. Filters by rep_user_id IN SQL (uses field_order_rep_idx)
 * instead of fetching the whole org and filtering in JS — see performance-audit C4.
 */
export async function listFieldOrdersForRep(
  organisationId: string,
  repUserId: string
): Promise<FieldOrderRow[]> {
  return queryRows<FieldOrderRow>(
    `SELECT id, organisation_id, outlet_id, rep_user_id, status, source, total_cents,
             created_at
     FROM field_order
     WHERE organisation_id = $1 AND rep_user_id = $2
     ORDER BY created_at DESC
     LIMIT 200`,
    [organisationId, repUserId]
  );
}

export interface CreateFieldOrderInput {
  id: string;
  organisationId: string;
  outletId: string;
  repUserId: string;
  source: "online" | "offline" | "sync";
  lines: Array<{ productId: string; quantity: number }>;
}

export interface CreateFieldOrderResult {
  id: string;
  totalCents: number;
  status: string;
}

/**
 * Creates a field order by joining the requested lines against `field_product`
 * (real PG read, real inventory check) and inserting the order header inside a
 * single transaction. Line items stored in audit_log.metadata.
 * The ERP event bus handles async push to ERPNext Sales Order.
 */
export async function createFieldOrder(input: CreateFieldOrderInput): Promise<CreateFieldOrderResult> {
  if (input.lines.length === 0) {
    throw new Error("order must have at least one line");
  }
  const pool = getDatabasePool();
  const client = await pool.connect();
  // Captured inside the transaction for the post-commit audit log.
  const lineSnapshots: Array<{ productId: string; productName: string; unitPriceCents: number; quantity: number }> = [];
  let outletName = input.outletId;
  let totalCents = 0;

  try {
    await client.query("BEGIN");

    const productIds = input.lines.map((l) => l.productId);
    const productRows = (await client.query(
      `SELECT id, name, unit_price_cents, inventory_available
       FROM field_product
       WHERE organisation_id = $1 AND id = ANY($2::text[])
       FOR UPDATE`,
      [input.organisationId, productIds]
    )).rows as Array<{ id: string; name: string; unit_price_cents: number; inventory_available: number }>;

    const productById = new Map(productRows.map((p) => [p.id, p]));
    for (const line of input.lines) {
      const product = productById.get(line.productId);
      if (!product) throw new Error(`product ${line.productId} not found`);
      if (line.quantity <= 0) throw new Error(`line for ${line.productId} must have positive quantity`);
      if (line.quantity > product.inventory_available) {
        throw new Error(`insufficient inventory for ${line.productId}`);
      }
      totalCents += product.unit_price_cents * line.quantity;
      lineSnapshots.push({
        productId: line.productId,
        productName: product.name,
        unitPriceCents: product.unit_price_cents,
        quantity: line.quantity
      });
    }

    for (const line of input.lines) {
      await client.query(
        `UPDATE field_product
         SET inventory_available = inventory_available - $1
         WHERE organisation_id = $2 AND id = $3`,
        [line.quantity, input.organisationId, line.productId]
      );
    }

    await client.query(
      `INSERT INTO field_order (id, organisation_id, outlet_id, rep_user_id, status, source, total_cents)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [input.id, input.organisationId, input.outletId, input.repUserId, "accepted", input.source, totalCents]
    );

    const outletRow = await client.query(
      `SELECT name FROM outlet WHERE organisation_id = $1 AND id = $2`,
      [input.organisationId, input.outletId]
    );
    if (outletRow.rows.length > 0) outletName = (outletRow.rows[0] as { name: string }).name;

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  // Local order persisted. The ERP event bus handles async push to ERPNext.
  return { id: input.id, totalCents, status: "accepted" };
}
