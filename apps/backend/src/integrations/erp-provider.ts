/**
 * Pluggable ERP provider interface.
 *
 * Orbit does not currently implement any ERP sync — this file defines the
 * contract a future ERPNext (or SAP / Tally / Oracle) adapter will satisfy.
 * The implementation lives in this file as a no-op default so callers can
 * import the type and run a "null bus" until a real provider is registered.
 *
 * See docs/integrations/erpnext-integration-plan.md for the architectural plan,
 * sync directions, and ownership rules.
 */

export type ErpEntityType =
  | "customer"
  | "product"
  | "warehouse"
  | "stock_level"
  | "sales_order"
  | "lead"
  | "opportunity"
  | "issue"
  | "invoice"
  | "payment"
  | "expense_claim"
  | "sales_rep"
  | "employee"
  | "attendance";

export type ErpSyncDirection = "push" | "pull" | "bidirectional";

export interface ErpEntityMapping {
  /** Orbit's local id (e.g. `outlet_abc`). */
  localId: string;
  /** The ERP-side id (e.g. ERPNext `Customer.name = "CUST-0042"`). */
  erpId: string;
  /** Last successful sync timestamp (ISO). */
  lastSyncedAt: string;
  /** Direction this mapping was last synced in. */
  direction: ErpSyncDirection;
  /** Free-form fingerprint (md5 of payload) used to detect "no real change" updates. */
  hash?: string;
}

export interface ErpSyncOptions {
  organisationId: string;
  /** Idempotency key — same key + same payload should be a no-op. */
  idempotencyKey?: string;
}

export interface ErpCustomerPayload {
  outletId: string;
  name: string;
  email?: string;
  phone?: string;
  addressLine1?: string;
  city?: string;
  countryCode?: string;
}

export interface ErpProductPayload {
  fieldProductId: string;
  sku: string;
  name: string;
  uom?: string;
  unitPriceCents?: number;
}

export interface ErpSalesOrderLine {
  fieldProductId: string;
  quantity: number;
  unitPriceCents: number;
}

export interface ErpSalesOrderPayload {
  fieldOrderId: string;
  outletId: string;
  repUserId: string;
  orderedAt: string;
  totalCents: number;
  currencyCode: string;
  lines: ErpSalesOrderLine[];
}

export interface ErpLeadPayload {
  /** Orbit lead id — used for idempotent mapping + dedupe. */
  leadId: string;
  /** Contact / business name captured in the field. */
  name: string;
  /** Orbit lead status (e.g. "new"); mapped to a CRM Lead Status. */
  status?: string;
  email?: string;
  phone?: string;
  /** Company/outlet the lead belongs to → CRM Lead.organization. */
  organization?: string;
  /** Email of the assigned rep → CRM Lead.lead_owner + assignment (best-effort). */
  ownerEmail?: string;
  /** Display name of the assigned rep (used if a CRM user must be auto-created). */
  ownerName?: string;
}

/** A sales/demo visit → ERPNext Opportunity (against the outlet's Customer). */
export interface ErpOpportunityPayload {
  /** Orbit visit id — idempotency key for the mapping. */
  visitId: string;
  outletId: string;
  note?: string;
}

/** A service/complaint visit → ERPNext Issue (Support ticket). */
export interface ErpIssuePayload {
  visitId: string;
  outletId: string;
  subject: string;
  description?: string;
}

/** A field collection → ERPNext Payment Entry (draft, Receive). */
export interface ErpPaymentPayload {
  paymentId: string;
  outletId: string;
  amountCents: number;
  method: string;
  orderId?: string | null;
}

/** A field visit expense → ERPNext Expense Claim. */
export interface ErpExpenseClaimPayload {
  expenseId: string;
  visitId: string;
  outletId: string;
  outletName: string;
  repUserId: string;
  repName: string;
  repEmail: string;
  category: string;
  amountCents: number;
  expenseDate: string;
  kms?: number | null;
  note?: string | null;
}

/**
 * A Orbit user with a sales-facing role → ERPNext Employee (HR module).
 * Required by the Expense Claim doctype, which references an Employee by name.
 * Mirrors {@link ErpSalesRepPayload} but lands in HR/Employee instead of Selling/Sales Person.
 */
export interface ErpEmployeePayload {
  repUserId: string;
  name: string;
  email: string;
  /** Orbit role for audit context (mapped to Employee.designation). */
  role?: string;
}

/**
 * A Orbit user with a sales-facing role (field rep / sales manager) →
 * ERPNext Sales Person (Selling module). Lets the team see + attribute field
 * reps in ERPNext alongside the Customers and Leads they generate.
 */
export interface ErpSalesRepPayload {
  /** Orbit app_user id — idempotency key for the mapping. */
  repUserId: string;
  /** Display name → Sales Person name. */
  name: string;
  /** Login email (used to disambiguate same-named reps). */
  email: string;
  /** Orbit role (e.g. "field_sales_representative") — informational. */
  role?: string;
}

export interface ErpProductItem {
  fieldProductId: string;
  sku: string;
  name: string;
  uom: string;
  unitPriceCents: number;
  inventoryAvailable: number;
  erpId: string;
}

export interface ErpProvider {
  readonly name: string;
  readonly capabilities: ReadonlySet<ErpEntityType>;

  /** Test the connection (auth + ping). Should be cheap and idempotent. */
  ping(opts: ErpSyncOptions): Promise<{ ok: boolean; message?: string }>;

  pushCustomer(payload: ErpCustomerPayload, opts: ErpSyncOptions): Promise<ErpEntityMapping>;
  pushProduct(payload: ErpProductPayload, opts: ErpSyncOptions): Promise<ErpEntityMapping>;
  pushSalesOrder(payload: ErpSalesOrderPayload, opts: ErpSyncOptions): Promise<ErpEntityMapping>;
  /** Push a field-captured lead → CRM Lead (Frappe CRM). */
  pushLead(payload: ErpLeadPayload, opts: ErpSyncOptions): Promise<ErpEntityMapping>;
  /** Push a sales/demo visit → ERPNext Opportunity. */
  pushOpportunity(payload: ErpOpportunityPayload, opts: ErpSyncOptions): Promise<ErpEntityMapping>;
  /** Push a service/complaint visit → ERPNext Issue. */
  pushIssue(payload: ErpIssuePayload, opts: ErpSyncOptions): Promise<ErpEntityMapping>;
  /** Push a field collection → ERPNext Payment Entry (draft). */
  pushPaymentEntry(payload: ErpPaymentPayload, opts: ErpSyncOptions): Promise<ErpEntityMapping>;
  /** Push a field visit expense → ERPNext Expense Claim. */
  pushExpenseClaim(payload: ErpExpenseClaimPayload, opts: ErpSyncOptions): Promise<ErpEntityMapping>;
  /** Push a sales-facing user → ERPNext Sales Person (Selling module). */
  pushSalesRep(payload: ErpSalesRepPayload, opts: ErpSyncOptions): Promise<ErpEntityMapping>;
  /** Push a sales-facing user → ERPNext Employee (HR module). Required for Expense Claim. */
  pushEmployee(payload: ErpEmployeePayload, opts: ErpSyncOptions): Promise<ErpEntityMapping>;

  /**
   * Propagate a local delete to the mapped ERP record (e.g. a deleted lead →
   * delete the CRM Lead). Best-effort; optional because not every backend or
   * doctype supports deletion. Implementations should treat "already gone" as
   * success.
   */
  deleteEntity?(entityType: ErpEntityType, erpId: string, opts: ErpSyncOptions): Promise<void>;

  /** Inbound webhook payloads land here for routing to the appropriate handler. */
  handleWebhook?(payload: unknown, opts: ErpSyncOptions): Promise<void>;

  /** Pull all products from ERP and return them (for caching locally). */
  pullProducts(opts: ErpSyncOptions): Promise<ErpProductItem[]>;

  /** Search products in ERP by query string (name/SKU match). */
  searchProducts(query: string, opts: ErpSyncOptions): Promise<ErpProductItem[]>;

  /** Get stock level for a single product by its ERP item code. */
  pullProductStock(itemCode: string, opts: ErpSyncOptions): Promise<{ itemCode: string; actualQty: number; reservedQty?: number; pendingQty?: number }>;
}

/**
 * Default no-op provider used when no real ERP is configured. Calls return
 * mappings with `erpId = "noop:<localId>"` so callers can still write to the
 * mapping table without crashing.
 */
export function createNoopErpProvider(): ErpProvider {
  return {
    name: "noop",
    capabilities: new Set<ErpEntityType>(),

    async ping() {
      return { ok: true, message: "noop provider — no ERP configured" };
    },

    async pushCustomer(payload) {
      return {
        localId: payload.outletId,
        erpId: `noop:${payload.outletId}`,
        lastSyncedAt: new Date().toISOString(),
        direction: "push"
      };
    },

    async pushProduct(payload) {
      return {
        localId: payload.fieldProductId,
        erpId: `noop:${payload.fieldProductId}`,
        lastSyncedAt: new Date().toISOString(),
        direction: "push"
      };
    },

    async pushSalesOrder(payload) {
      return {
        localId: payload.fieldOrderId,
        erpId: `noop:${payload.fieldOrderId}`,
        lastSyncedAt: new Date().toISOString(),
        direction: "push"
      };
    },

    async pushLead(payload) {
      return {
        localId: payload.leadId,
        erpId: `noop:${payload.leadId}`,
        lastSyncedAt: new Date().toISOString(),
        direction: "push"
      };
    },

    async pushOpportunity(payload) {
      return { localId: payload.visitId, erpId: `noop:${payload.visitId}`, lastSyncedAt: new Date().toISOString(), direction: "push" };
    },

    async pushIssue(payload) {
      return { localId: payload.visitId, erpId: `noop:${payload.visitId}`, lastSyncedAt: new Date().toISOString(), direction: "push" };
    },

    async pushPaymentEntry(payload) {
      return { localId: payload.paymentId, erpId: `noop:${payload.paymentId}`, lastSyncedAt: new Date().toISOString(), direction: "push" };
    },

    async pushExpenseClaim(payload) {
      return { localId: payload.expenseId, erpId: `noop:${payload.expenseId}`, lastSyncedAt: new Date().toISOString(), direction: "push" };
    },

    async pushSalesRep(payload) {
      return { localId: payload.repUserId, erpId: `noop:${payload.repUserId}`, lastSyncedAt: new Date().toISOString(), direction: "push" };
    },

    async pushEmployee(payload) {
      return { localId: payload.repUserId, erpId: `noop:${payload.repUserId}`, lastSyncedAt: new Date().toISOString(), direction: "push" };
    },

    async pullProducts() { return []; },
    async searchProducts() { return []; },
    async pullProductStock() { return { itemCode: "", actualQty: 0 }; }
  };
}

let registeredProvider: ErpProvider = createNoopErpProvider();

export function registerErpProvider(provider: ErpProvider): void {
  registeredProvider = provider;
}

export function getErpProvider(): ErpProvider {
  return registeredProvider;
}
