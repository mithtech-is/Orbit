import type { SyncMutationInput } from "@orbit/api-client";

export interface VisitCheckoutDraft {
  visitId: string;
  outcome: string;
  notes: string;
  proofPhotoIds: string[];
  extras?: Record<string, unknown>;
}

export function buildVisitCheckoutMutation(draft: VisitCheckoutDraft): SyncMutationInput {
  const proofPhotoIds = draft.proofPhotoIds.filter((id) => id.trim().length > 0);
  if (proofPhotoIds.length === 0) {
    throw new Error("At least one proof photo is required to complete the visit.");
  }

  return {
    idempotencyKey: `checkout_${draft.visitId}`,
    type: "visit.check_out",
    payload: {
      visitId: draft.visitId,
      outcome: draft.outcome,
      notes: draft.notes,
      extras: { ...(draft.extras ?? {}), proofPhotoIds }
    }
  };
}
