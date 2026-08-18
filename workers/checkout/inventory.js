// Founders waves + cap (DEC-27).
//
// Founders is a hard-capped run of 100 units sold in two waves of 50, each
// with its own ship window; unit 101 onward is the Signature Series, which is
// unlimited. A buyer's wave is fixed at purchase (webhook → Notion) and never
// recomputed — what this module resolves is only what the NEXT unit would be,
// for the pricing card and the cap check.
//
// Deliberately exposes no totals. `remaining` stays null until a wave is
// nearly gone, and the threshold is applied HERE rather than in the browser:
// a client-side check would still ship the real number in the response, where
// anyone could poll it and graph your sales.

import { countClaimedOrders } from './notion.js';

const CACHE_KEY = 'inv:count';
const CACHE_TTL = 60;

const num = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/**
 * Claimed-unit count, cached briefly in KV. The cache exists because
 * /inventory is hit on every page load while Notion is rate-limited and slow;
 * 60s of staleness is harmless for a display value, and the cap check calls
 * with `fresh` to bypass it.
 */
export async function claimedCount(env, { fresh = false } = {}) {
  if (!fresh && env.ORDERS) {
    const hit = await env.ORDERS.get(CACHE_KEY);
    if (hit !== null) return Number(hit);
  }
  const count = await countClaimedOrders(env);
  if (env.ORDERS) {
    await env.ORDERS.put(CACHE_KEY, String(count), { expirationTtl: CACHE_TTL });
  }
  return count;
}

/** Drop the cached count so the next read reflects a just-placed order. */
export async function invalidateCount(env) {
  if (env.ORDERS) await env.ORDERS.delete(CACHE_KEY);
}

/**
 * Resolve what the next unit sold would be. `sold` is the claimed count.
 *
 * Returns the shape served at /inventory:
 *   series    'founders' | 'signature'
 *   wave      1 | 2 | null        (null once Founders is gone)
 *   remaining number | null       (null until the wave is nearly out)
 *   soldOut   boolean             (Founders specifically — Signature never is)
 */
export function resolveInventory(env, sold) {
  const cap = num(env.FOUNDERS_CAP, 100);
  const waveSize = num(env.WAVE_SIZE, 50);
  const countdownAt = num(env.WAVE_COUNTDOWN_AT, 15);

  if (sold >= cap) {
    return { series: 'signature', wave: null, remaining: null, soldOut: true };
  }
  const wave = Math.floor(sold / waveSize) + 1;
  const remaining = wave * waveSize - sold;
  return {
    series: 'founders',
    wave,
    // Withheld while the wave is comfortably stocked — early on, "50 left"
    // reads as "nobody has bought one", which is worse than saying nothing.
    remaining: remaining <= countdownAt ? remaining : null,
    soldOut: false,
  };
}

/**
 * The wave label stored on the order at purchase. Kept as plain English
 * option names because it's a Notion select the ops team reads — the
 * customer-facing wording lives in site content, in both locales.
 */
export function waveLabel(env, position) {
  const cap = num(env.FOUNDERS_CAP, 100);
  const waveSize = num(env.WAVE_SIZE, 50);
  if (position > cap) return 'Signature';
  return `Wave ${Math.floor((position - 1) / waveSize) + 1}`;
}
