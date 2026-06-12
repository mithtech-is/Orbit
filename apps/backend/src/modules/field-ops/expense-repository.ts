/**
 * field_expense (daily fuel) CRUD — used by the /api/v1/expenses surface for
 * the rep's "submit a reason" flow and the manager approval grid.
 */

import { queryRows } from "../../db/client.js";

export interface FieldExpenseRow {
  id: string;
  organisationId: string;
  repUserId: string;
  repName: string | null;
  workSessionId: string | null;
  expenseDate: string;
  category: string;
  actualDistanceKm: number;
  plannedDistanceKm: number;
  deviationKm: number;
  ratePerKmCents: number;
  amountCents: number;
  deviationAmountCents: number;
  overLimit: boolean;
  reason: string | null;
  status: string;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

interface DbRow {
  id: string;
  organisation_id: string;
  rep_user_id: string;
  rep_name: string | null;
  work_session_id: string | null;
  expense_date: string;
  category: string;
  actual_distance_km: number;
  planned_distance_km: number;
  deviation_km: number;
  rate_per_km_cents: number;
  amount_cents: number;
  deviation_amount_cents: number;
  over_limit: boolean;
  reason: string | null;
  status: string;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

function fromDb(r: DbRow): FieldExpenseRow {
  return {
    id: r.id,
    organisationId: r.organisation_id,
    repUserId: r.rep_user_id,
    repName: r.rep_name,
    workSessionId: r.work_session_id,
    expenseDate: typeof r.expense_date === "string" ? r.expense_date.slice(0, 10) : String(r.expense_date),
    category: r.category,
    actualDistanceKm: Number(r.actual_distance_km),
    plannedDistanceKm: Number(r.planned_distance_km),
    deviationKm: Number(r.deviation_km),
    ratePerKmCents: Number(r.rate_per_km_cents),
    amountCents: Number(r.amount_cents),
    deviationAmountCents: Number(r.deviation_amount_cents),
    overLimit: Boolean(r.over_limit),
    reason: r.reason,
    status: r.status,
    approvedBy: r.approved_by,
    approvedAt: r.approved_at,
    rejectionReason: r.rejection_reason,
    metadata: r.metadata ?? {},
    createdAt: r.created_at
  };
}

const BASE_SELECT = `
  SELECT e.id, e.organisation_id, e.rep_user_id, u.name AS rep_name,
         e.work_session_id, e.expense_date::text AS expense_date, e.category,
         e.actual_distance_km, e.planned_distance_km, e.deviation_km,
         e.rate_per_km_cents, e.amount_cents, e.deviation_amount_cents,
         e.over_limit, e.reason, e.status, e.approved_by, e.approved_at,
         e.rejection_reason, e.metadata, e.created_at
  FROM field_expense e
  LEFT JOIN app_user u ON u.id = e.rep_user_id AND u.organisation_id = e.organisation_id
`;

export interface ListFieldExpensesFilter {
  organisationId: string;
  /** Restrict to this rep only (rep-scoped list). */
  repUserId?: string;
  status?: "pending" | "approved" | "rejected";
}

export async function listFieldExpenses(filter: ListFieldExpensesFilter): Promise<FieldExpenseRow[]> {
  const where: string[] = [`e.organisation_id = $1`];
  const params: unknown[] = [filter.organisationId];
  if (filter.repUserId) {
    params.push(filter.repUserId);
    where.push(`e.rep_user_id = $${params.length}`);
  }
  if (filter.status) {
    params.push(filter.status);
    where.push(`e.status = $${params.length}`);
  }
  const rows = await queryRows<DbRow>(
    `${BASE_SELECT} WHERE ${where.join(" AND ")} ORDER BY e.expense_date DESC, e.created_at DESC`,
    params
  );
  return rows.map(fromDb);
}

export async function getFieldExpense(organisationId: string, expenseId: string): Promise<FieldExpenseRow | null> {
  const rows = await queryRows<DbRow>(
    `${BASE_SELECT} WHERE e.organisation_id = $1 AND e.id = $2`,
    [organisationId, expenseId]
  );
  return rows[0] ? fromDb(rows[0]) : null;
}

/**
 * Set the rep's "why I deviated / went over limit" reason. Only allowed by the
 * rep themselves (the route enforces). Doesn't change status — that's a separate
 * approval action by the manager.
 */
export async function submitExpenseReason(
  organisationId: string,
  expenseId: string,
  reason: string
): Promise<FieldExpenseRow | null> {
  await queryRows(
    `UPDATE field_expense
     SET reason = $1
     WHERE organisation_id = $2 AND id = $3 AND status = 'pending'`,
    [reason.trim(), organisationId, expenseId]
  );
  return getFieldExpense(organisationId, expenseId);
}

export async function approveFieldExpense(
  organisationId: string,
  expenseId: string,
  approverUserId: string
): Promise<FieldExpenseRow | null> {
  await queryRows(
    `UPDATE field_expense
     SET status = 'approved', approved_by = $1, approved_at = now(), rejection_reason = NULL
     WHERE organisation_id = $2 AND id = $3 AND status = 'pending'`,
    [approverUserId, organisationId, expenseId]
  );
  return getFieldExpense(organisationId, expenseId);
}

export async function rejectFieldExpense(
  organisationId: string,
  expenseId: string,
  approverUserId: string,
  rejectionReason: string
): Promise<FieldExpenseRow | null> {
  await queryRows(
    `UPDATE field_expense
     SET status = 'rejected', approved_by = $1, approved_at = now(), rejection_reason = $2
     WHERE organisation_id = $3 AND id = $4 AND status = 'pending'`,
    [approverUserId, rejectionReason.trim(), organisationId, expenseId]
  );
  return getFieldExpense(organisationId, expenseId);
}
