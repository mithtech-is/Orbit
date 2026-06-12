/**
 * ERP sync coordinator. Loads Orbit records from Postgres and drives the
 * registered ErpProvider (no-op when ERP is disabled, ERPNext when configured).
 * Keeps all "what to send to ERP" logic in one place so route handlers stay thin.
 *
 * Best-effort: every provider call is wrapped so ERP downtime never blocks the
 * rep's primary write (order/outlet still succeed locally).
 *
 * Order matters for a Sales Order: the Customer and Items must exist in ERP
 * BEFORE the order references them, so syncFieldOrder pushes customer -> items
 * -> order in sequence.
 */
import { randomUUID } from "node:crypto";
import { queryRows } from "../db/client.js";
import { getErpProvider } from "./erp-provider.js";
import { countErpMappings, getErpMapping, saveErpMapping, deleteErpMapping } from "./erp-mapping-repository.js";
import { upsertProductBySku } from "../modules/commerce/repository.js";

/**
 * Master off-switch. The ERP integration is a DORMANT, OPT-IN plugin: unless a
 * real provider has been registered at boot (which only happens when
 * ERPNEXT_ENABLED=true + keys are present), this returns false and every sync
 * function below returns immediately — no DB reads, no HTTP calls, no mapping
 * writes. With ERP disabled the core flows behave exactly as if this plugin
 * did not exist. To connect ANY ERPNext later, set the env and restart.
 */
function erpEnabled(): boolean {
  return getErpProvider().name !== "noop";
}

interface OutletRow { id: string; name: string }
interface ProductRow { id: string; sku: string; name: string; unit_price_cents: number }
interface LeadRow { id: string; name: string; status: string; outlet_name: string | null; owner_email: string | null; owner_name: string | null }
interface RepRow { id: string; name: string; email: string; role: string }

// Roles whose users are mirrored to ERPNext as Sales Persons (the field-facing
// sellers). Other roles (ops, analysts, admins) are not sales reps → skipped.
const SALES_REP_ROLES = new Set(["field_sales_representative", "sales_manager"]);

/** Is this Orbit role a sales-facing rep that should appear in ERPNext? */
export function isSalesRepRole(role: string): boolean {
  return SALES_REP_ROLES.has(role);
}

function logErr(stage: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`[erp-sync] ${stage} failed: ${msg}\n`);
}

async function loadOutlet(organisationId: string, outletId: string): Promise<OutletRow | undefined> {
  const rows = await queryRows<OutletRow>(
    `SELECT id, name FROM outlet WHERE organisation_id = $1 AND id = $2`,
    [organisationId, outletId]
  );
  return rows[0];
}

async function loadProducts(organisationId: string, productIds: string[]): Promise<Map<string, ProductRow>> {
  if (productIds.length === 0) return new Map();
  const rows = await queryRows<ProductRow>(
    `SELECT id, sku, name, unit_price_cents
     FROM field_product
     WHERE organisation_id = $1 AND id = ANY($2::text[])`,
    [organisationId, productIds]
  );
  return new Map(rows.map((r) => [r.id, r]));
}

async function orgCurrency(organisationId: string): Promise<string> {
  const rows = await queryRows<{ currency: string }>(
    `SELECT currency FROM organisation_setting WHERE organisation_id = $1`,
    [organisationId]
  );
  return rows[0]?.currency ?? process.env.ERPNEXT_CURRENCY ?? "INR";
}

async function pushCustomer(organisationId: string, outlet: OutletRow): Promise<boolean> {
  try {
    await getErpProvider().pushCustomer({ outletId: outlet.id, name: outlet.name }, { organisationId });
    return true;
  } catch (err) {
    logErr(`pushCustomer(${outlet.id})`, err);
    return false;
  }
}

async function pushProduct(organisationId: string, p: ProductRow): Promise<boolean> {
  try {
    await getErpProvider().pushProduct(
      { fieldProductId: p.id, sku: p.sku, name: p.name, unitPriceCents: p.unit_price_cents },
      { organisationId }
    );
    return true;
  } catch (err) {
    logErr(`pushProduct(${p.id})`, err);
    return false;
  }
}

// Lead's outlet (if any) becomes CRM Lead.organization; the assigned rep
// (app_user) becomes the CRM Lead owner/assignee.
const LEAD_SELECT = `SELECT l.id, l.name, l.status, o.name AS outlet_name,
                            au.email AS owner_email, au.name AS owner_name
                     FROM lead l
                     LEFT JOIN outlet o ON o.id = l.outlet_id AND o.organisation_id = l.organisation_id
                     LEFT JOIN app_user au ON au.id = l.assigned_user_id`;

async function loadLead(organisationId: string, leadId: string): Promise<LeadRow | undefined> {
  const rows = await queryRows<LeadRow>(
    `${LEAD_SELECT} WHERE l.organisation_id = $1 AND l.id = $2`,
    [organisationId, leadId]
  );
  return rows[0];
}

async function pushLead(organisationId: string, lead: LeadRow): Promise<boolean> {
  try {
    await getErpProvider().pushLead(
      {
        leadId: lead.id,
        name: lead.name,
        status: lead.status,
        organization: lead.outlet_name ?? undefined,
        ownerEmail: lead.owner_email ?? undefined,
        ownerName: lead.owner_name ?? undefined
      },
      { organisationId }
    );
    return true;
  } catch (err) {
    logErr(`pushLead(${lead.id})`, err);
    return false;
  }
}

const REP_SELECT = `SELECT id, name, email, role FROM app_user`;

async function loadRep(organisationId: string, userId: string): Promise<RepRow | undefined> {
  const rows = await queryRows<RepRow>(
    `${REP_SELECT} WHERE organisation_id = $1 AND id = $2`,
    [organisationId, userId]
  );
  return rows[0];
}

async function pushSalesRep(organisationId: string, rep: RepRow): Promise<boolean> {
  try {
    await getErpProvider().pushSalesRep(
      { repUserId: rep.id, name: rep.name, email: rep.email, role: rep.role },
      { organisationId }
    );
    return true;
  } catch (err) {
    logErr(`pushSalesRep(${rep.id})`, err);
    return false;
  }
}

async function pushEmployee(organisationId: string, rep: RepRow): Promise<boolean> {
  try {
    await getErpProvider().pushEmployee(
      { repUserId: rep.id, name: rep.name, email: rep.email, role: rep.role },
      { organisationId }
    );
    return true;
  } catch (err) {
    logErr(`pushEmployee(${rep.id})`, err);
    return false;
  }
}

/**
 * Push one user -> ERPNext Employee (HR module). Required by Expense Claim.
 * No-op when ERP is disabled or the user isn't sales-facing. Idempotent.
 */
export async function syncRepToErpAsEmployee(organisationId: string, userId: string): Promise<void> {
  if (!erpEnabled()) return;
  const rep = await loadRep(organisationId, userId);
  if (!rep || !isSalesRepRole(rep.role)) return;
  await pushEmployee(organisationId, rep);
}

/** Push one outlet -> ERP Customer. No-op when the ERP plugin is disabled. */
export async function syncOutletToErp(organisationId: string, outletId: string): Promise<void> {
  if (!erpEnabled()) return;
  const outlet = await loadOutlet(organisationId, outletId);
  if (!outlet) return;
  await pushCustomer(organisationId, outlet);
}

/** Push one product -> ERP Item. No-op when the ERP plugin is disabled. */
export async function syncProductToErp(organisationId: string, productId: string): Promise<void> {
  if (!erpEnabled()) return;
  const p = (await loadProducts(organisationId, [productId])).get(productId);
  if (!p) return;
  await pushProduct(organisationId, p);
}

/** Push one lead -> Frappe CRM Lead. No-op when the ERP plugin is disabled. */
export async function syncLeadToErp(organisationId: string, leadId: string): Promise<void> {
  if (!erpEnabled()) return;
  const lead = await loadLead(organisationId, leadId);
  if (!lead) return;
  await pushLead(organisationId, lead);
}

/**
 * Propagate a lead deletion to the CRM (deletes the mapped CRM Lead, then drops
 * the mapping). Best-effort: ERP errors never block the local delete. Call this
 * BEFORE the local row is removed so the mapping is still resolvable.
 */
export async function deleteLeadFromErp(organisationId: string, leadId: string): Promise<void> {
  if (!erpEnabled()) return;
  const mapping = await getErpMapping(organisationId, "lead", leadId);
  if (!mapping) return;
  // Attempt the CRM-side delete. Frappe protects a lead that has linked activity
  // (CRM notifications / assignments) from hard deletion — that's expected and
  // not fatal: we still drop the local mapping so the app side is clean and no
  // dangling mapping is left behind.
  try {
    await getErpProvider().deleteEntity?.("lead", mapping.erp_id, { organisationId });
  } catch (err) {
    process.stderr.write(`[erp-sync] CRM lead ${mapping.erp_id} retained (delete blocked): ${err instanceof Error ? err.message.slice(0, 160) : String(err)}\n`);
  }
  await deleteErpMapping(organisationId, "lead", leadId);
}

/**
 * Push one user -> ERPNext Sales Person. No-op when ERP is disabled or the user
 * isn't a sales-facing role (only field reps + sales managers are mirrored).
 */
export async function syncSalesRepToErp(organisationId: string, userId: string): Promise<void> {
  if (!erpEnabled()) return;
  const rep = await loadRep(organisationId, userId);
  if (!rep || !isSalesRepRole(rep.role)) return;
  // Mirror the rep to BOTH ERPNext modules:
  //   Selling/Sales Person  → so sales orders/leads can be attributed
  //   HR/Employee           → so Expense Claims can reference them
  await pushSalesRep(organisationId, rep);
  await pushEmployee(organisationId, rep);
}

// Outcome → ERP doctype classification. A visit whose outcome matches an "issue"
// keyword becomes an ERPNext Issue; one matching an "opportunity" keyword becomes
// an Opportunity. Substring match (so "interested in a demo" matches). Override
// the keyword sets via env per instance.
function csvEnv(name: string, fallback: string): string[] {
  return (process.env[name] ?? fallback).split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}
const OPPORTUNITY_OUTCOMES = csvEnv("ERPNEXT_OPPORTUNITY_OUTCOMES", "interested,demo,opportunity,follow_up,follow up,quote,quotation,proposal");
const ISSUE_OUTCOMES = csvEnv("ERPNEXT_ISSUE_OUTCOMES", "complaint,issue,service,ticket,problem,damage,return,defect");

function classifyOutcome(outcome: string | null): "opportunity" | "issue" | null {
  const o = (outcome ?? "").toLowerCase();
  if (!o) return null;
  if (ISSUE_OUTCOMES.some((k) => o.includes(k))) return "issue";
  if (OPPORTUNITY_OUTCOMES.some((k) => o.includes(k))) return "opportunity";
  return null;
}

interface VisitErpRow { id: string; outcome: string | null; notes: string | null; outlet_id: string; outlet_name: string }
interface PaymentErpRow { id: string; outlet_id: string; outlet_name: string; amount_cents: number; method: string; order_id: string | null }
interface ExpenseErpRow {
  id: string;
  visit_id: string;
  outlet_id: string;
  outlet_name: string;
  rep_user_id: string;
  rep_name: string;
  rep_email: string;
  category: string;
  amount_cents: number;
  kms: number | null;
  note: string | null;
  created_at: string;
}

/**
 * Push a checked-out visit's outcome to ERP: a sales/demo outcome creates an
 * Opportunity, a service/complaint outcome creates an Issue. No-op when ERP is
 * disabled or the outcome doesn't map to either. Best-effort.
 */
export async function syncVisitOutcomeToErp(organisationId: string, visitId: string): Promise<void> {
  if (!erpEnabled()) return;
  const rows = await queryRows<VisitErpRow>(
    `SELECT v.id, v.outcome, v.notes, v.outlet_id, o.name AS outlet_name
     FROM visit v JOIN outlet o ON o.id = v.outlet_id AND o.organisation_id = v.organisation_id
     WHERE v.organisation_id = $1 AND v.id = $2`,
    [organisationId, visitId]
  );
  const v = rows[0];
  if (!v) return;
  const kind = classifyOutcome(v.outcome);
  if (!kind) return;

  // The Opportunity/Issue references the outlet's ERP Customer — push it first.
  const customerOk = await pushCustomer(organisationId, { id: v.outlet_id, name: v.outlet_name });
  if (!customerOk) return;

  try {
    if (kind === "opportunity") {
      await getErpProvider().pushOpportunity(
        { visitId: v.id, outletId: v.outlet_id, note: v.notes ?? undefined },
        { organisationId }
      );
    } else {
      await getErpProvider().pushIssue(
        { visitId: v.id, outletId: v.outlet_id, subject: v.outcome || "Field service visit", description: v.notes ?? undefined },
        { organisationId }
      );
    }
  } catch (err) {
    logErr(`syncVisitOutcome(${visitId}, ${kind})`, err);
  }
}

/** Push a field collection -> ERP Payment Entry (draft). Best-effort, no-op when disabled. */
export async function syncPaymentToErp(organisationId: string, paymentId: string): Promise<void> {
  if (!erpEnabled()) return;
  const rows = await queryRows<PaymentErpRow>(
    `SELECT p.id, p.outlet_id, p.amount_cents, p.method, p.order_id, o.name AS outlet_name
     FROM payment p JOIN outlet o ON o.id = p.outlet_id AND o.organisation_id = p.organisation_id
     WHERE p.organisation_id = $1 AND p.id = $2`,
    [organisationId, paymentId]
  );
  const p = rows[0];
  if (!p) return;

  const customerOk = await pushCustomer(organisationId, { id: p.outlet_id, name: p.outlet_name });
  if (!customerOk) return;

  try {
    await getErpProvider().pushPaymentEntry(
      { paymentId: p.id, outletId: p.outlet_id, amountCents: p.amount_cents, method: p.method, orderId: p.order_id },
      { organisationId }
    );
  } catch (err) {
    logErr(`syncPayment(${paymentId})`, err);
  }
}

interface FieldExpenseErpRow {
  id: string;
  rep_user_id: string;
  rep_name: string;
  rep_email: string;
  category: string;
  amount_cents: number;
  actual_distance_km: number;
  deviation_km: number;
  expense_date: string;
  reason: string | null;
  status: string;
}

/**
 * Push ONE daily field_expense row (fuel, computed on session stop) → ERPNext
 * Expense Claim. Mirrors syncVisitExpensesToErp but for the new field_expense
 * table. Uses entity_type 'expense_claim' with a 'field_expense:<id>' local_id
 * so it doesn't collide with visit_expense mappings.
 */
export async function syncFieldExpenseToErp(organisationId: string, expenseId: string): Promise<void> {
  if (!erpEnabled()) return;
  const rows = await queryRows<FieldExpenseErpRow>(
    `SELECT e.id, e.rep_user_id, u.name AS rep_name, u.email AS rep_email,
            e.category, e.amount_cents, e.actual_distance_km, e.deviation_km,
            e.expense_date::text AS expense_date, e.reason, e.status
     FROM field_expense e
     JOIN app_user u ON u.id = e.rep_user_id AND u.organisation_id = e.organisation_id
     WHERE e.organisation_id = $1 AND e.id = $2`,
    [organisationId, expenseId]
  );
  const e = rows[0];
  if (!e) return;
  const localId = `field_expense:${e.id}`;
  // Idempotency — let the provider's hash-skip do the heavy lifting, but bail
  // early if we've already pushed this exact row.
  const mapping = await getErpMapping(organisationId, "expense_claim", localId);
  if (mapping) {
    // Already synced; nothing to do until status changes (approval triggers
    // an explicit re-sync from the approval endpoint).
    return;
  }
  // Ensure the rep has an Employee mirror — Expense Claim requires it.
  await syncRepToErpAsEmployee(organisationId, e.rep_user_id);

  try {
    await getErpProvider().pushExpenseClaim(
      {
        expenseId: localId,
        // Field-level (non-visit) expense — pass empty strings rather than null
        // so the doctype's required cells aren't omitted. The visit_id/outlet
        // fields are informational only on the ERPNext side (free-text remark).
        visitId: "",
        outletId: "",
        outletName: `Field — ${e.expense_date}`,
        repUserId: e.rep_user_id,
        repName: e.rep_name,
        repEmail: e.rep_email,
        category: e.category === "fuel" ? "Fuel" : e.category,
        amountCents: e.amount_cents,
        kms: e.actual_distance_km,
        note: e.deviation_km > 0
          ? `Daily fuel (auto-computed). Off-plan deviation: ${e.deviation_km} km. ${e.reason ?? ""}`.trim()
          : `Daily fuel (auto-computed).`,
        expenseDate: e.expense_date
      },
      { organisationId, idempotencyKey: localId }
    );
  } catch (err) {
    logErr(`syncFieldExpense(${e.id})`, err);
  }
}

/** Push visit expenses -> ERPNext Expense Claims. Best-effort, no-op when disabled. */
export async function syncVisitExpensesToErp(organisationId: string, visitId: string): Promise<void> {
  if (!erpEnabled()) return;
  const rows = await queryRows<ExpenseErpRow>(
    `SELECT e.id, e.visit_id, v.outlet_id, o.name AS outlet_name,
            v.assigned_user_id AS rep_user_id, u.name AS rep_name, u.email AS rep_email,
            e.category, e.amount_cents, e.kms, e.note, e.created_at
     FROM visit_expense e
     JOIN visit v ON v.id = e.visit_id AND v.organisation_id = e.organisation_id
     JOIN outlet o ON o.id = v.outlet_id AND o.organisation_id = e.organisation_id
     JOIN app_user u ON u.id = v.assigned_user_id AND u.organisation_id = e.organisation_id
     WHERE e.organisation_id = $1 AND e.visit_id = $2
     ORDER BY e.created_at`,
    [organisationId, visitId]
  );

  for (const e of rows) {
    if (await getErpMapping(organisationId, "expense_claim", e.id)) continue;
    // Ensure the rep exists as an ERPNext Employee FIRST — Expense Claim requires
    // an Employee reference and pushExpenseClaim will auto-create one if absent,
    // but this makes the ordering explicit + lets a failed Employee push short-
    // circuit BEFORE we touch Customer.
    await syncRepToErpAsEmployee(organisationId, e.rep_user_id);
    const customerOk = await pushCustomer(organisationId, { id: e.outlet_id, name: e.outlet_name });
    if (!customerOk) continue;
    try {
      await getErpProvider().pushExpenseClaim(
        {
          expenseId: e.id,
          visitId: e.visit_id,
          outletId: e.outlet_id,
          outletName: e.outlet_name,
          repUserId: e.rep_user_id,
          repName: e.rep_name,
          repEmail: e.rep_email,
          category: e.category,
          amountCents: e.amount_cents,
          kms: e.kms,
          note: e.note,
          expenseDate: e.created_at.slice(0, 10)
        },
        { organisationId, idempotencyKey: `expense:${e.id}` }
      );
    } catch (err) {
      logErr(`syncExpense(${e.id})`, err);
    }
  }
}

export interface SyncFieldOrderInput {
  fieldOrderId: string;
  outletId: string;
  repUserId: string;
  orderedAt?: string;
  totalCents: number;
  lines: Array<{ productId: string; quantity: number }>;
}

/**
 * Push a field order -> ERP Sales Order. Ensures the Customer (outlet) and every
 * line's Item (product) exist in ERP first, then creates the order.
 * Returns the ERP Sales Order id when successful, or undefined if ERP is disabled
 * or the sync fails.
 */
export async function syncFieldOrderToErp(organisationId: string, input: SyncFieldOrderInput): Promise<string | undefined> {
  if (!erpEnabled()) return;
  const outlet = await loadOutlet(organisationId, input.outletId);
  if (!outlet) return;
  const products = await loadProducts(organisationId, input.lines.map((l) => l.productId));

  // 1) Customer  2) Items
  await pushCustomer(organisationId, outlet);
  for (const line of input.lines) {
    const p = products.get(line.productId);
    if (p) await pushProduct(organisationId, p);
  }

  // 2b) Selling rep -> Sales Person (so the order can be attributed to them).
  const rep = await loadRep(organisationId, input.repUserId);
  if (rep && isSalesRepRole(rep.role)) await pushSalesRep(organisationId, rep);

  // 3) Sales Order
  try {
    const currency = await orgCurrency(organisationId);
    const mapping = await getErpProvider().pushSalesOrder(
      {
        fieldOrderId: input.fieldOrderId,
        outletId: input.outletId,
        repUserId: input.repUserId,
        orderedAt: input.orderedAt ?? new Date().toISOString(),
        totalCents: input.totalCents,
        currencyCode: currency,
        lines: input.lines
          .map((l) => {
            const p = products.get(l.productId);
            return p ? { fieldProductId: p.id, quantity: l.quantity, unitPriceCents: p.unit_price_cents } : null;
          })
          .filter((x): x is NonNullable<typeof x> => x !== null)
      },
      { organisationId }
    );
    return mapping.erpId;
  } catch (err) {
    logErr(`pushSalesOrder(${input.fieldOrderId})`, err);
  }
}

/**
 * Pull all products from ERPNext and cache them in the local field_product table.
 * Creates/updates each product by SKU and persists the ERP mapping.
 * No-op when the ERP plugin is disabled.
 */
export async function pullProductsFromErp(organisationId: string): Promise<number> {
  if (!erpEnabled()) return 0;
  const provider = getErpProvider();
  if (!provider.capabilities.has("product")) return 0;

  const products = await provider.pullProducts({ organisationId });
  let count = 0;
  for (const p of products) {
    const localId = `prod_${randomUUID().slice(0, 12)}`;
    const actualId = await upsertProductBySku({
      id: localId,
      organisationId,
      sku: p.sku,
      name: p.name,
      inventoryAvailable: p.inventoryAvailable,
      unitPriceCents: p.unitPriceCents
    });
    await saveErpMapping({
      organisationId,
      entityType: "product",
      localId: actualId,
      erpId: p.erpId,
      direction: "pull"
    });
    count++;
  }
  return count;
}

/** Backfill: push every outlet + product + lead + sales rep for a tenant.
 * Returns counts. Returns zeros (no-op) when the ERP plugin is disabled. */
export async function backfillErp(organisationId: string): Promise<{ outlets: number; products: number; leads: number; reps: number }> {
  if (!erpEnabled()) return { outlets: 0, products: 0, leads: 0, reps: 0 };
  const outlets = await queryRows<OutletRow>(`SELECT id, name FROM outlet WHERE organisation_id = $1`, [organisationId]);
  for (const o of outlets) await pushCustomer(organisationId, o);

  const products = await queryRows<ProductRow>(
    `SELECT id, sku, name, unit_price_cents FROM field_product WHERE organisation_id = $1`,
    [organisationId]
  );
  for (const p of products) await pushProduct(organisationId, p);

  // Leads after outlets so each lead can reference its outlet name for context.
  const leads = await queryRows<LeadRow>(
    `${LEAD_SELECT} WHERE l.organisation_id = $1`,
    [organisationId]
  );
  for (const l of leads) await pushLead(organisationId, l);

  // Sales-facing users -> Sales Persons AND Employees (active reps + managers only).
  // Employee mirror is what makes Expense Claim sync work on the rep's very first
  // expense — otherwise the rep would have to be manually onboarded in ERPNext HR.
  const reps = await queryRows<RepRow>(
    `${REP_SELECT} WHERE organisation_id = $1 AND active = true AND role = ANY($2::text[])`,
    [organisationId, [...SALES_REP_ROLES]]
  );
  for (const r of reps) {
    await pushSalesRep(organisationId, r);
    await pushEmployee(organisationId, r);
  }

  return { outlets: outlets.length, products: products.length, leads: leads.length, reps: reps.length };
}

/** Connection + mapping status for the admin endpoint. */
export async function erpStatus(organisationId: string): Promise<{
  provider: string;
  connection: { ok: boolean; message?: string };
  mappings: Record<string, number>;
}> {
  const provider = getErpProvider();
  const connection = await provider.ping({ organisationId });
  const mappings = await countErpMappings(organisationId);
  return { provider: provider.name, connection, mappings };
}
