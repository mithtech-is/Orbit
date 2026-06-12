import { queryRows } from "../../db/client.js";
import { getRedis, isRedisEnabled } from "../../redis/client.js";
import { pullProductsFromErp } from "../../integrations/erp-sync.js";
import { getErpProvider } from "../../integrations/erp-provider.js";

const SYNC_INTERVAL_MS = Number(process.env.PRODUCT_CATALOG_SYNC_INTERVAL_MS) || 15 * 60 * 1000;
const LOCK_TTL_MS = Math.max(SYNC_INTERVAL_MS, 20 * 60 * 1000);

let timer: NodeJS.Timeout | undefined;

async function acquireSyncLock(organisationId: string): Promise<boolean> {
  if (!isRedisEnabled()) return true;
  const redis = getRedis();
  if (!redis) return true;
  try {
    const key = `orbit:product-sync:${organisationId}`;
    const res = await redis.set(key, String(process.pid), "PX", LOCK_TTL_MS, "NX");
    return res === "OK";
  } catch {
    return true;
  }
}

async function runProductCatalogSync(): Promise<number> {
  if (getErpProvider().name === "noop") return 0;

  const orgs = await queryRows<{ id: string }>(`SELECT id FROM organisation`);
  let totalPulled = 0;

  for (const { id: organisationId } of orgs) {
    if (!(await acquireSyncLock(organisationId))) continue;
    try {
      const count = await pullProductsFromErp(organisationId);
      totalPulled += count;
      if (count > 0) {
        process.stdout.write(`[product-sync] pulled ${count} products for org ${organisationId}\n`);
      }
    } catch (error) {
      process.stderr.write(`[product-sync] failed for org ${organisationId}: ${error instanceof Error ? error.message : String(error)}\n`);
    }
  }

  return totalPulled;
}

export function startProductCatalogSync(): void {
  if (timer) return;
  if (process.env.PRODUCT_CATALOG_SYNC_ENABLED === "false") return;

  const tick = async () => {
    try {
      await runProductCatalogSync();
    } catch (error) {
      process.stderr.write(`[product-sync] tick failed: ${error instanceof Error ? error.message : String(error)}\n`);
    }
  };

  void tick();
  timer = setInterval(() => void tick(), SYNC_INTERVAL_MS);
  process.stdout.write(`[product-sync] scheduled every ${SYNC_INTERVAL_MS / 1000}s\n`);
}

export function stopProductCatalogSync(): void {
  if (timer) {
    clearInterval(timer);
    timer = undefined;
  }
}
