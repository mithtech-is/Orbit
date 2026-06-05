/**
 * Real ERPNext provider — implements the ErpProvider contract against a live
 * Frappe/ERPNext instance via its REST API (token auth).
 *
 * Mapping of Orbit -> ERPNext:
 *   outlet        -> Customer
 *   field_product -> Item        (item_code = SKU, so it's naturally idempotent)
 *   field_order   -> Sales Order (references the Customer + Items above; the
 *                                 selling rep is attached as a sales_team entry)
 *   app_user      -> Sales Person (field reps + sales managers, Selling module)
 *
 * Idempotency: we persist a row in `erp_entity_mapping` for every push. Items
 * additionally key on `item_code` so re-pushing the same SKU is a no-op. Sales
 * orders are guarded by the caller (coordinator) via the mapping table.
 *
 * Best-effort: callers (erp-event-bus) swallow errors so ERP downtime never
 * blocks the rep's primary write — same philosophy as the Medusa bridge.
 *
 * Config (env):
 *   ERPNEXT_ENABLED=true
 *   ERPNEXT_BASE_URL=http://localhost:8080
 *   ERPNEXT_API_KEY=...           ERPNEXT_API_SECRET=...
 *   ERPNEXT_COMPANY="Orbit Demo"
 *   ERPNEXT_CURRENCY=INR
 *   ERPNEXT_CUSTOMER_GROUP="All Customer Groups"   (optional)
 *   ERPNEXT_TERRITORY="All Territories"            (optional)
 *   ERPNEXT_ITEM_GROUP="All Item Groups"           (optional)
 *   ERPNEXT_STOCK_UOM=Nos                          (optional)
 *   ERPNEXT_SALES_PERSON_PARENT="Sales Team"       (optional; group node reps go under)
 *
 * Frappe CRM (lead capture) — the `crm` app's `CRM Lead` doctype:
 *   ERPNEXT_CRM_LEAD_SOURCE="Walk In"              (optional; a CRM Lead Source)
 *   ERPNEXT_CRM_DEFAULT_LEAD_STATUS=New            (optional; a CRM Lead Status)
 */
import type {
  ErpCustomerPayload,
  ErpEntityMapping,
  ErpLeadPayload,
  ErpOpportunityPayload,
  ErpIssuePayload,
  ErpPaymentPayload,
  ErpExpenseClaimPayload,
  ErpProductPayload,
  ErpProvider,
  ErpSalesOrderPayload,
  ErpSalesRepPayload,
  ErpSyncOptions,
  ErpEntityType
} from "./erp-provider.js";
import { getErpMapping, saveErpMapping } from "./erp-mapping-repository.js";

export interface ErpNextConfig {
  baseUrl: string;
  apiKey: string;
  apiSecret: string;
  company: string;
  currency: string;
  customerGroup: string;
  territory: string;
  itemGroup: string;
  stockUom: string;
  /** Default CRM Lead Source for field-captured leads. */
  crmLeadSource: string;
  /** Fallback CRM Lead Status when a lead's status doesn't map to a known one. */
  crmDefaultLeadStatus: string;
  /** Parent (group) node that field reps are created under in the Sales Person tree. */
  salesPersonParent: string;
}

export function readErpNextConfig(): ErpNextConfig | null {
  const baseUrl = process.env.ERPNEXT_BASE_URL ?? "http://localhost:8080";
  const apiKey = process.env.ERPNEXT_API_KEY ?? "";
  const apiSecret = process.env.ERPNEXT_API_SECRET ?? "";
  if (!apiKey || !apiSecret) return null;
  return {
    baseUrl: baseUrl.replace(/\/$/, ""),
    apiKey,
    apiSecret,
    company: process.env.ERPNEXT_COMPANY ?? "Orbit Demo",
    currency: process.env.ERPNEXT_CURRENCY ?? "INR",
    // NOTE: must be a NON-GROUP (leaf) Customer Group — ERPNext rejects assigning
    // a customer to a group node like the tree root "All Customer Groups".
    // "Commercial" is a standard leaf in a default ERPNext install. Override via
    // ERPNEXT_CUSTOMER_GROUP to match your instance.
    customerGroup: process.env.ERPNEXT_CUSTOMER_GROUP ?? "Commercial",
    territory: process.env.ERPNEXT_TERRITORY ?? "All Territories",
    itemGroup: process.env.ERPNEXT_ITEM_GROUP ?? "All Item Groups",
    stockUom: process.env.ERPNEXT_STOCK_UOM ?? "Nos",
    // Frappe CRM seeds "Walk In" as a default Lead Source — apt for field reps.
    crmLeadSource: process.env.ERPNEXT_CRM_LEAD_SOURCE ?? "Walk In",
    crmDefaultLeadStatus: process.env.ERPNEXT_CRM_DEFAULT_LEAD_STATUS ?? "New",
    // "Sales Team" is the root group node ERPNext seeds in the Sales Person tree.
    // Reps are created as leaf nodes beneath it. Override per instance.
    salesPersonParent: process.env.ERPNEXT_SALES_PERSON_PARENT ?? "Sales Team"
  };
}

export function isErpNextConfigured(): boolean {
  return process.env.ERPNEXT_ENABLED === "true" && readErpNextConfig() !== null;
}

const ERP_CAPABILITIES = new Set<ErpEntityType>(["customer", "product", "sales_order", "lead", "opportunity", "issue", "payment", "expense_claim", "sales_rep"]);

// Frappe CRM's default Lead Status set (seeded by crm.install.after_install).
const CRM_LEAD_STATUSES = ["New", "Contacted", "Nurture", "Qualified", "Unqualified", "Junk", "Converted"];
// Common Orbit lead-status aliases → CRM Lead Status.
const CRM_STATUS_ALIASES: Record<string, string> = {
  open: "New",
  in_progress: "Contacted",
  contacted: "Contacted",
  won: "Converted",
  converted: "Converted",
  lost: "Unqualified",
  rejected: "Junk"
};

/** Map a Orbit lead status onto a valid CRM Lead Status (best-effort). */
function mapLeadStatus(cfg: ErpNextConfig, raw?: string): string {
  if (!raw) return cfg.crmDefaultLeadStatus;
  const norm = raw.trim().toLowerCase();
  const direct = CRM_LEAD_STATUSES.find((s) => s.toLowerCase() === norm);
  if (direct) return direct;
  return CRM_STATUS_ALIASES[norm] ?? cfg.crmDefaultLeadStatus;
}

function authHeader(cfg: ErpNextConfig): Record<string, string> {
  return {
    Authorization: `token ${cfg.apiKey}:${cfg.apiSecret}`,
    "Content-Type": "application/json",
    Accept: "application/json"
  };
}

// Hard timeout so a wrong/unreachable ERPNEXT_BASE_URL fails fast (e.g. on the
// "Test connection" button) instead of hanging the request thread.
const ERPNEXT_TIMEOUT_MS = Number(process.env.ERPNEXT_TIMEOUT_MS) || 10_000;
async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ERPNEXT_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`ERPNext request timed out after ${ERPNEXT_TIMEOUT_MS}ms — check ERPNEXT_BASE_URL is reachable.`);
    }
    throw err instanceof Error ? new Error(`ERPNext request failed: ${err.message}`) : err;
  } finally {
    clearTimeout(timer);
  }
}

async function frappe<T>(
  cfg: ErpNextConfig,
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown
): Promise<T> {
  const res = await fetchWithTimeout(`${cfg.baseUrl}${path}`, {
    method,
    headers: authHeader(cfg),
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await res.text();
  if (!res.ok) {
    // Frappe returns HTML error pages sometimes; trim to keep logs sane.
    throw new Error(`ERPNext ${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

/** Cheap fingerprint so we skip ERPNext writes when nothing changed. */
function hashPayload(obj: Record<string, unknown>): string {
  const json = JSON.stringify(obj);
  let h = 5381;
  for (let i = 0; i < json.length; i++) h = ((h << 5) + h + json.charCodeAt(i)) | 0;
  return String(h >>> 0);
}

/** Does a doc exist by its primary name (docname)? */
async function docExists(cfg: ErpNextConfig, doctype: string, name: string): Promise<boolean> {
  const res = await fetchWithTimeout(`${cfg.baseUrl}/api/resource/${doctype}/${encodeURIComponent(name)}`, {
    method: "GET",
    headers: authHeader(cfg)
  });
  return res.status === 200;
}

/**
 * Ensure a CRM User exists for an assigned rep (by email) so a lead can be owned
 * by / assigned to them. Creates a minimal System User with the "Sales User" role
 * (CRM access) and no welcome email when missing. Idempotent.
 */
async function ensureCrmUser(cfg: ErpNextConfig, email: string, name?: string): Promise<void> {
  if (await docExists(cfg, "User", email)) return;
  const first = (name && name.trim()) || email.split("@")[0];
  await frappe(cfg, "POST", "/api/resource/User", {
    doctype: "User",
    email,
    first_name: first,
    send_welcome_email: 0,
    user_type: "System User",
    roles: [{ role: "Sales User" }]
  });
}

/** Assign a CRM Lead to a user (Frappe ToDo assignment → shows in their queue). */
async function assignLeadToUser(cfg: ErpNextConfig, leadName: string, email: string): Promise<void> {
  await frappe(cfg, "POST", "/api/method/frappe.desk.form.assign_to.add", {
    doctype: "CRM Lead",
    name: leadName,
    assign_to: [email]
  });
}

interface CompanyAccounts { receivable: string; cash: string; currency: string }
// Per-company default accounts (Debtors / Cash) needed to build a Payment Entry.
// Fetched once per company from ERPNext so we don't hardcode the company abbr.
const companyAccountsCache = new Map<string, CompanyAccounts>();
async function getCompanyAccounts(cfg: ErpNextConfig): Promise<CompanyAccounts> {
  const cached = companyAccountsCache.get(cfg.company);
  if (cached) return cached;
  const res = await frappe<{ data: { default_receivable_account?: string; default_cash_account?: string; default_currency?: string } }>(
    cfg, "GET", `/api/resource/Company/${encodeURIComponent(cfg.company)}`
  );
  const accounts: CompanyAccounts = {
    receivable: res.data.default_receivable_account ?? "",
    cash: res.data.default_cash_account ?? "",
    currency: res.data.default_currency ?? cfg.currency
  };
  companyAccountsCache.set(cfg.company, accounts);
  return accounts;
}

/** Resolve the ERPNext Customer id for an outlet — required to reference it. */
async function requireCustomerErpId(organisationId: string, outletId: string): Promise<string> {
  const map = await getErpMapping(organisationId, "customer", outletId);
  if (!map) throw new Error(`no ERPNext Customer mapping for outlet ${outletId}`);
  return map.erp_id;
}

export function createErpNextProvider(config?: ErpNextConfig): ErpProvider {
  const cfg = config ?? readErpNextConfig();
  if (!cfg) throw new Error("ERPNext not configured (ERPNEXT_API_KEY / ERPNEXT_API_SECRET required)");

  return {
    name: "erpnext",
    capabilities: ERP_CAPABILITIES,

    async ping() {
      // Probe with a real resource read (same auth path the writes use) — more
      // reliable across Frappe builds than whitelisted-method calls.
      try {
        await frappe(cfg, "GET", "/api/resource/Customer?limit_page_length=1");
        return { ok: true, message: `connected to ${cfg.baseUrl} (company ${cfg.company})` };
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : "ping failed" };
      }
    },

    async pushCustomer(payload: ErpCustomerPayload, opts: ErpSyncOptions): Promise<ErpEntityMapping> {
      const hash = hashPayload({ ...payload });
      const existing = await getErpMapping(opts.organisationId, "customer", payload.outletId);
      if (existing && existing.hash === hash) {
        return toMapping(existing.local_id, existing.erp_id, "push", existing.hash);
      }

      const doc = {
        doctype: "Customer",
        customer_name: payload.name,
        customer_type: "Company",
        customer_group: cfg.customerGroup,
        territory: cfg.territory,
        ...(payload.email ? { email_id: payload.email } : {}),
        ...(payload.phone ? { mobile_no: payload.phone } : {})
      };

      let erpId: string;
      if (existing) {
        await frappe(cfg, "PUT", `/api/resource/Customer/${encodeURIComponent(existing.erp_id)}`, doc);
        erpId = existing.erp_id;
      } else {
        const created = await frappe<{ data: { name: string } }>(cfg, "POST", "/api/resource/Customer", doc);
        erpId = created.data.name;
      }

      await saveErpMapping({ organisationId: opts.organisationId, entityType: "customer", localId: payload.outletId, erpId, hash });
      return toMapping(payload.outletId, erpId, "push", hash);
    },

    async pushProduct(payload: ErpProductPayload, opts: ErpSyncOptions): Promise<ErpEntityMapping> {
      const hash = hashPayload({ ...payload });
      const existing = await getErpMapping(opts.organisationId, "product", payload.fieldProductId);
      if (existing && existing.hash === hash) {
        return toMapping(existing.local_id, existing.erp_id, "push", existing.hash);
      }

      // item_code is the ERPNext PK; use the SKU so it's deterministic + idempotent.
      const itemCode = payload.sku;
      const doc = {
        doctype: "Item",
        item_code: itemCode,
        item_name: payload.name,
        item_group: cfg.itemGroup,
        stock_uom: payload.uom ?? cfg.stockUom,
        is_stock_item: 1,
        ...(payload.unitPriceCents !== undefined ? { standard_rate: payload.unitPriceCents / 100 } : {})
      };

      let erpId = itemCode;
      if (await docExists(cfg, "Item", itemCode)) {
        await frappe(cfg, "PUT", `/api/resource/Item/${encodeURIComponent(itemCode)}`, doc);
      } else {
        const created = await frappe<{ data: { name: string } }>(cfg, "POST", "/api/resource/Item", doc);
        erpId = created.data.name;
      }

      await saveErpMapping({ organisationId: opts.organisationId, entityType: "product", localId: payload.fieldProductId, erpId, hash });
      return toMapping(payload.fieldProductId, erpId, "push", hash);
    },

    async pushSalesOrder(payload: ErpSalesOrderPayload, opts: ErpSyncOptions): Promise<ErpEntityMapping> {
      // Idempotency: if we've already pushed this field order, return the mapping.
      const existing = await getErpMapping(opts.organisationId, "sales_order", payload.fieldOrderId);
      if (existing) {
        return toMapping(existing.local_id, existing.erp_id, "push", existing.hash);
      }

      // Resolve the customer + items that the coordinator pushed first.
      const customerMap = await getErpMapping(opts.organisationId, "customer", payload.outletId);
      if (!customerMap) throw new Error(`no ERPNext Customer mapping for outlet ${payload.outletId}`);

      const items = [];
      for (const line of payload.lines) {
        const itemMap = await getErpMapping(opts.organisationId, "product", line.fieldProductId);
        if (!itemMap) throw new Error(`no ERPNext Item mapping for product ${line.fieldProductId}`);
        items.push({
          item_code: itemMap.erp_id,
          qty: line.quantity,
          rate: line.unitPriceCents / 100
        });
      }

      const deliveryDate = (payload.orderedAt || new Date().toISOString()).slice(0, 10);
      const doc: Record<string, unknown> = {
        doctype: "Sales Order",
        customer: customerMap.erp_id,
        company: cfg.company,
        currency: payload.currencyCode || cfg.currency,
        delivery_date: deliveryDate,
        items,
        // Traceability back to Orbit.
        po_no: payload.fieldOrderId
      };
      if ((payload.currencyCode || cfg.currency) === cfg.currency) {
        doc.conversion_rate = 1;
      }

      // Attribute the order to the selling rep so it shows in ERPNext's Sales
      // Person reports. The coordinator pushes the rep's Sales Person first, so
      // we only attach when the mapping already exists (skipped otherwise).
      const repMap = await getErpMapping(opts.organisationId, "sales_rep", payload.repUserId);
      if (repMap) {
        doc.sales_team = [{ sales_person: repMap.erp_id, allocated_percentage: 100 }];
      }

      const created = await frappe<{ data: { name: string } }>(cfg, "POST", "/api/resource/Sales Order", doc);
      const erpId = created.data.name;
      const hash = hashPayload({ id: payload.fieldOrderId, total: payload.totalCents, lines: payload.lines.length });
      await saveErpMapping({ organisationId: opts.organisationId, entityType: "sales_order", localId: payload.fieldOrderId, erpId, hash });
      return toMapping(payload.fieldOrderId, erpId, "push", hash);
    },

    async pushLead(payload: ErpLeadPayload, opts: ErpSyncOptions): Promise<ErpEntityMapping> {
      const hash = hashPayload({ ...payload });
      const existing = await getErpMapping(opts.organisationId, "lead", payload.leadId);
      if (existing && existing.hash === hash) {
        return toMapping(existing.local_id, existing.erp_id, "push", existing.hash);
      }

      // Resolve the assigned rep to a CRM user (auto-create if needed) so the
      // lead can be owned by them. If we can't ensure the user, sync the lead
      // UNASSIGNED rather than failing the whole create (a bad lead_owner Link
      // would otherwise reject the doc).
      let ownerEmail: string | undefined;
      if (payload.ownerEmail) {
        try {
          await ensureCrmUser(cfg, payload.ownerEmail, payload.ownerName);
          ownerEmail = payload.ownerEmail;
        } catch {
          ownerEmail = undefined;
        }
      }

      // CRM Lead requires first_name + status. Field-sales leads are typically a
      // business/outlet name, so we keep the captured name intact in first_name
      // rather than splitting it.
      const doc: Record<string, unknown> = {
        doctype: "CRM Lead",
        first_name: payload.name.trim() || "Unknown",
        status: mapLeadStatus(cfg, payload.status),
        source: cfg.crmLeadSource,
        ...(ownerEmail ? { lead_owner: ownerEmail } : {}),
        ...(payload.email ? { email: payload.email } : {}),
        ...(payload.phone ? { mobile_no: payload.phone } : {}),
        ...(payload.organization ? { organization: payload.organization } : {})
      };

      // CRM Lead names are auto-generated (naming_series), so we always create a
      // new doc on first push and PUT to the mapped name on subsequent updates.
      let erpId: string;
      if (existing) {
        await frappe(cfg, "PUT", `/api/resource/${encodeURIComponent("CRM Lead")}/${encodeURIComponent(existing.erp_id)}`, doc);
        erpId = existing.erp_id;
      } else {
        const created = await frappe<{ data: { name: string } }>(cfg, "POST", `/api/resource/${encodeURIComponent("CRM Lead")}`, doc);
        erpId = created.data.name;
      }

      await saveErpMapping({ organisationId: opts.organisationId, entityType: "lead", localId: payload.leadId, erpId, hash });

      // Best-effort ToDo assignment so the lead appears in the rep's CRM queue.
      // Already-assigned (or any) failure must not undo the successful sync.
      if (ownerEmail) {
        try {
          await assignLeadToUser(cfg, erpId, ownerEmail);
        } catch {
          /* best-effort: lead is synced + owned even if the ToDo assign fails */
        }
      }

      return toMapping(payload.leadId, erpId, "push", hash);
    },

    async pushOpportunity(payload: ErpOpportunityPayload, opts: ErpSyncOptions): Promise<ErpEntityMapping> {
      const existing = await getErpMapping(opts.organisationId, "opportunity", payload.visitId);
      if (existing) return toMapping(existing.local_id, existing.erp_id, "push", existing.hash);

      const customer = await requireCustomerErpId(opts.organisationId, payload.outletId);
      const doc: Record<string, unknown> = {
        doctype: "Opportunity",
        opportunity_from: "Customer",
        party_name: customer,
        status: "Open",
        company: cfg.company,
        transaction_date: new Date().toISOString().slice(0, 10),
        ...(payload.note ? { custom_remarks: payload.note } : {})
      };
      const created = await frappe<{ data: { name: string } }>(cfg, "POST", "/api/resource/Opportunity", doc);
      const erpId = created.data.name;
      await saveErpMapping({ organisationId: opts.organisationId, entityType: "opportunity", localId: payload.visitId, erpId, hash: null });
      return toMapping(payload.visitId, erpId, "push", null);
    },

    async pushIssue(payload: ErpIssuePayload, opts: ErpSyncOptions): Promise<ErpEntityMapping> {
      const existing = await getErpMapping(opts.organisationId, "issue", payload.visitId);
      if (existing) return toMapping(existing.local_id, existing.erp_id, "push", existing.hash);

      const customer = await requireCustomerErpId(opts.organisationId, payload.outletId);
      const doc: Record<string, unknown> = {
        doctype: "Issue",
        subject: payload.subject,
        customer,
        status: "Open",
        ...(payload.description ? { description: payload.description } : {})
      };
      const created = await frappe<{ data: { name: string } }>(cfg, "POST", "/api/resource/Issue", doc);
      const erpId = created.data.name;
      await saveErpMapping({ organisationId: opts.organisationId, entityType: "issue", localId: payload.visitId, erpId, hash: null });
      return toMapping(payload.visitId, erpId, "push", null);
    },

    async pushPaymentEntry(payload: ErpPaymentPayload, opts: ErpSyncOptions): Promise<ErpEntityMapping> {
      const existing = await getErpMapping(opts.organisationId, "payment", payload.paymentId);
      if (existing) return toMapping(existing.local_id, existing.erp_id, "push", existing.hash);

      const customer = await requireCustomerErpId(opts.organisationId, payload.outletId);
      const accounts = await getCompanyAccounts(cfg);
      if (!accounts.receivable || !accounts.cash) {
        throw new Error(`company ${cfg.company} is missing default receivable/cash accounts — run the ERPNext setup wizard`);
      }
      const amount = payload.amountCents / 100;
      // Draft Payment Entry (docstatus 0) — finance reviews + submits in ERPNext,
      // so we don't trigger submit-time GL validations from the field app.
      const doc: Record<string, unknown> = {
        doctype: "Payment Entry",
        payment_type: "Receive",
        posting_date: new Date().toISOString().slice(0, 10),
        company: cfg.company,
        party_type: "Customer",
        party: customer,
        paid_from: accounts.receivable,
        paid_to: accounts.cash,
        paid_from_account_currency: accounts.currency,
        paid_to_account_currency: accounts.currency,
        paid_amount: amount,
        received_amount: amount,
        source_exchange_rate: 1,
        target_exchange_rate: 1,
        base_paid_amount: amount,
        base_received_amount: amount,
        reference_no: payload.paymentId,
        reference_date: new Date().toISOString().slice(0, 10)
      };
      const created = await frappe<{ data: { name: string } }>(cfg, "POST", `/api/resource/${encodeURIComponent("Payment Entry")}`, doc);
      const erpId = created.data.name;
      await saveErpMapping({ organisationId: opts.organisationId, entityType: "payment", localId: payload.paymentId, erpId, hash: null });
      return toMapping(payload.paymentId, erpId, "push", null);
    },

    async pushExpenseClaim(payload: ErpExpenseClaimPayload, opts: ErpSyncOptions): Promise<ErpEntityMapping> {
      const existing = await getErpMapping(opts.organisationId, "expense_claim", payload.expenseId);
      const hash = hashPayload({ ...payload });
      if (existing && existing.hash === hash) return toMapping(existing.local_id, existing.erp_id, "push", existing.hash);

      const employeeMap = await getErpMapping(opts.organisationId, "employee", payload.repUserId);
      if (!employeeMap) {
        throw new Error(`no ERPNext Employee mapping for rep ${payload.repUserId}; create/link the Employee before syncing expenses`);
      }

      const doc: Record<string, unknown> = {
        doctype: "Expense Claim",
        employee: employeeMap.erp_id,
        company: cfg.company,
        posting_date: payload.expenseDate,
        approval_status: "Draft",
        remark: [
          `Orbit visit ${payload.visitId}`,
          `Outlet: ${payload.outletName}`,
          payload.kms != null ? `KM: ${payload.kms}` : "",
          payload.note ?? ""
        ].filter(Boolean).join(" | "),
        expenses: [{
          expense_date: payload.expenseDate,
          expense_type: payload.category,
          amount: payload.amountCents / 100,
          sanctioned_amount: payload.amountCents / 100,
          description: payload.note || `Field visit expense at ${payload.outletName}`
        }]
      };

      let erpId: string;
      if (existing) {
        await frappe(cfg, "PUT", `/api/resource/${encodeURIComponent("Expense Claim")}/${encodeURIComponent(existing.erp_id)}`, doc);
        erpId = existing.erp_id;
      } else {
        const created = await frappe<{ data: { name: string } }>(cfg, "POST", `/api/resource/${encodeURIComponent("Expense Claim")}`, doc);
        erpId = created.data.name;
      }
      await saveErpMapping({ organisationId: opts.organisationId, entityType: "expense_claim", localId: payload.expenseId, erpId, hash });
      return toMapping(payload.expenseId, erpId, "push", hash);
    },

    async pushSalesRep(payload: ErpSalesRepPayload, opts: ErpSyncOptions): Promise<ErpEntityMapping> {
      const hash = hashPayload({ ...payload });
      const existing = await getErpMapping(opts.organisationId, "sales_rep", payload.repUserId);
      if (existing && existing.hash === hash) {
        return toMapping(existing.local_id, existing.erp_id, "push", existing.hash);
      }

      // Sales Person autonames from sales_person_name (it IS the docname), so two
      // reps sharing a display name would collide. On a first push, disambiguate
      // by appending the email when the bare name is already taken by someone else.
      let salesPersonName = payload.name.trim() || payload.email;
      if (!existing && (await docExists(cfg, "Sales Person", salesPersonName))) {
        salesPersonName = `${salesPersonName} (${payload.email})`;
      }

      const doc: Record<string, unknown> = {
        doctype: "Sales Person",
        sales_person_name: salesPersonName,
        parent_sales_person: cfg.salesPersonParent,
        is_group: 0,
        enabled: 1
      };

      let erpId: string;
      if (existing) {
        // sales_person_name is the docname — don't rename on update, just keep it enabled.
        await frappe(cfg, "PUT", `/api/resource/${encodeURIComponent("Sales Person")}/${encodeURIComponent(existing.erp_id)}`, { enabled: 1 });
        erpId = existing.erp_id;
      } else {
        const created = await frappe<{ data: { name: string } }>(cfg, "POST", `/api/resource/${encodeURIComponent("Sales Person")}`, doc);
        erpId = created.data.name;
      }

      await saveErpMapping({ organisationId: opts.organisationId, entityType: "sales_rep", localId: payload.repUserId, erpId, hash });
      return toMapping(payload.repUserId, erpId, "push", hash);
    },

    async deleteEntity(entityType: ErpEntityType, erpId: string, _opts: ErpSyncOptions): Promise<void> {
      const DOCTYPE: Partial<Record<ErpEntityType, string>> = {
        lead: "CRM Lead",
        customer: "Customer",
        product: "Item",
        opportunity: "Opportunity",
        issue: "Issue",
        payment: "Payment Entry",
        sales_order: "Sales Order",
        sales_rep: "Sales Person"
      };
      const doctype = DOCTYPE[entityType];
      if (!doctype || !erpId || erpId.startsWith("noop:")) return;

      // Frappe blocks hard-deleting a doc that has linked records. For a CRM Lead
      // the assignment flow auto-creates CRM Notifications + ToDos that reference
      // it — clear those first so the lead can actually be removed from the CRM.
      if (doctype === "CRM Lead") {
        for (const link of [
          { dt: "CRM Notification", docField: "reference_doctype", nameField: "reference_name" },
          { dt: "ToDo", docField: "reference_type", nameField: "reference_name" }
        ]) {
          try {
            const filters = encodeURIComponent(JSON.stringify([[link.docField, "=", "CRM Lead"], [link.nameField, "=", erpId]]));
            const list = await frappe<{ data: Array<{ name: string }> }>(
              cfg, "GET", `/api/resource/${encodeURIComponent(link.dt)}?filters=${filters}&limit_page_length=0&fields=["name"]`
            );
            for (const row of list.data ?? []) {
              await frappe(cfg, "DELETE", `/api/resource/${encodeURIComponent(link.dt)}/${encodeURIComponent(row.name)}`).catch(() => undefined);
            }
          } catch {
            // link cleanup is best-effort; the lead delete below still tries.
          }
        }
      }

      try {
        await frappe(cfg, "DELETE", `/api/resource/${doctype}/${encodeURIComponent(erpId)}`);
      } catch (err) {
        // 404 → already gone (success). Other errors (e.g. ERPNext refuses to
        // delete a doc with linked transactions) bubble to the best-effort caller.
        const msg = err instanceof Error ? err.message : "";
        if (/404|not found|does not exist/i.test(msg)) return;
        throw err;
      }
    }
  };
}

function toMapping(localId: string, erpId: string, direction: "push" | "pull" | "bidirectional", hash: string | null): ErpEntityMapping {
  return { localId, erpId, lastSyncedAt: new Date().toISOString(), direction, hash: hash ?? undefined };
}
