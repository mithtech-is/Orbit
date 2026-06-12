import { Redis } from "ioredis";

/**
 * Shared Redis connections for the horizontal-scale features:
 *   - WebSocket pub/sub fan-out (so events broadcast on one instance reach
 *     clients connected to every other instance)
 *   - distributed rate limiting
 *   - leader lock for the retention sweep
 *
 * Everything degrades gracefully: if REDIS_URL is unset or the connection
 * fails, getRedis()/getRedisSubscriber() return `null` and callers fall back to
 * single-instance behaviour. This keeps local dev (one process) working with no
 * Redis required, while a multi-instance deployment with REDIS_URL set becomes
 * correctly clustered.
 */

let pub: Redis | null | undefined;
let sub: Redis | null | undefined;
let disabled = false;

function makeClient(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url || disabled) return null;
  try {
    const client = new Redis(url, {
      lazyConnect: false,
      maxRetriesPerRequest: 2,
      // Don't crash the process on Redis hiccups — log once and degrade.
      retryStrategy: (times) => (times > 10 ? null : Math.min(times * 200, 2000))
    });
    client.on("error", (err) => {
      process.stderr.write(`[redis] ${err.message}\n`);
    });
    return client;
  } catch (err) {
    process.stderr.write(`[redis] init failed: ${err instanceof Error ? err.message : String(err)}\n`);
    return null;
  }
}

/** Command/publish connection (shared). null if Redis is not configured. */
export function getRedis(): Redis | null {
  if (pub === undefined) pub = makeClient();
  return pub;
}

/** Dedicated subscriber connection (a Redis conn in subscribe mode can't issue
 * normal commands, so pub/sub needs its own). null if not configured. */
export function getRedisSubscriber(): Redis | null {
  if (sub === undefined) sub = makeClient();
  return sub;
}

export function isRedisEnabled(): boolean {
  return Boolean(process.env.REDIS_URL) && !disabled;
}

/** For tests / shutdown. */
export async function closeRedis(): Promise<void> {
  disabled = true;
  await Promise.allSettled([pub?.quit?.(), sub?.quit?.()]);
  pub = undefined;
  sub = undefined;
  disabled = false;
}
