import { createFieldOrder, type CreateFieldOrderResult } from "../../modules/commerce/repository.js";

/**
 * Medusa-style workflow seam for field order creation. Today this delegates to
 * the PG-based `createFieldOrder` repository function. The contract (input +
 * output shapes) is the public surface — once the Medusa native cart/order
 * modules are wired into the runtime, only the implementation behind
 * `runCreateFieldOrderWorkflow` needs to change. Callers and tests don't.
 *
 * Migration plan to Medusa-native (Phase 14 v2):
 *   1. Add Medusa product/inventory/cart/order modules to `medusa-config.ts`.
 *   2. Replace the `createFieldOrder(...)` call below with a Medusa workflow
 *      that creates a `cart`, adds line items via `cartModuleService`, runs
 *      `completeCart` → `order`, then writes outlet/rep metadata.
 *   3. Drop `field_order` table (or keep as a denormalised reporting view).
 *
 * Until then, this function gives us:
 *   - one place to swap impls
 *   - typed input/output (no leaking PG row shapes to callers)
 *   - workflow-style emit hook for audit/event publishing
 */

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
  provider: "field_order_pg" | "medusa_cart_order" | "field_order_pg_with_medusa_bridge";
  medusaOrderId: string | null;
  bridgeError: string | null;
}

export interface WorkflowEmitter {
  emit?: (event: { name: string; data: Record<string, unknown> }) => void | Promise<void>;
}

export async function runCreateFieldOrderWorkflow(
  input: CreateFieldOrderWorkflowInput,
  hooks: WorkflowEmitter = {}
): Promise<CreateFieldOrderWorkflowOutput> {
  const result: CreateFieldOrderResult = await createFieldOrder(input);

  const provider: CreateFieldOrderWorkflowOutput["provider"] =
    result.medusaOrderId ? "field_order_pg_with_medusa_bridge" : "field_order_pg";

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
        provider,
        medusaOrderId: result.medusaOrderId,
        bridgeError: result.bridgeError
      }
    });
  }

  return {
    id: result.id,
    status: result.status,
    totalCents: result.totalCents,
    provider,
    medusaOrderId: result.medusaOrderId,
    bridgeError: result.bridgeError
  };
}
