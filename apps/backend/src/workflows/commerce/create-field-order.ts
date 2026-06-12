import { createFieldOrder, type CreateFieldOrderResult } from "../../modules/commerce/repository.js";

export interface CreateFieldOrderWorkflowInput {
  id: string;
  organisationId: string;
  outletId: string;
  repUserId: string;
  source: "online" | "offline" | "sync";
  lines: Array<{ productId: string; quantity: number }>;
}

export interface CreateFieldOrderWorkflowOutput {
  id: string;
  status: string;
  totalCents: number;
}

export interface WorkflowEmitter {
  emit?: (event: { name: string; data: Record<string, unknown> }) => void | Promise<void>;
}

export async function runCreateFieldOrderWorkflow(
  input: CreateFieldOrderWorkflowInput,
  hooks: WorkflowEmitter = {}
): Promise<CreateFieldOrderWorkflowOutput> {
  const result: CreateFieldOrderResult = await createFieldOrder(input);

  if (hooks.emit) {
    await hooks.emit({
      name: "field_order.created",
      data: {
        organisationId: input.organisationId,
        orderId: result.id,
        outletId: input.outletId,
        repUserId: input.repUserId,
        totalCents: result.totalCents,
        source: input.source,
      }
    });
  }

  return {
    id: result.id,
    status: result.status,
    totalCents: result.totalCents,
  };
}
