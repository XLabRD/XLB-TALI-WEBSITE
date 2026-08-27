// Private traffic counters (DEC-29).
//
// The public site is static and carries no third-party analytics, so this
// worker is the only vantage point on traffic — and the site already calls it
// on every page load (/inventory, for the wave line) and on every Buy-now
// press (/create-checkout-session, to mint the session). Counting inside those
// two routes therefore costs no extra request and no beacon script.
//
// What the numbers mean, precisely — the /stats page repeats this, because a
// count nobody can define is a count nobody should act on:
//   views  — page loads that ran JS and reached /inventory. Crawlers that
//            don't execute scripts never register, which is free bot
//            filtering; the route's 30s browser cache folds a reload burst
//            into one. So this is "engaged loads", a floor on real traffic.
//   clicks — Buy-now presses. Hero, nav pill and plan card all open the same
//            modal, which mints a session; a press the cap refuses still
//            counts, because the intent was real.
// Orders are NOT counted here. They come from Notion, so the funnel's last
// stage is the same claimed count the cap check already trusts.
//
// Coupling worth knowing: both calls live inside Pricing.astro's checkout
// block, which only runs when settings.checkoutEndpoint AND
// settings.stripePublishableKey are set. Unset either and the site keeps
// working while counting silently stops.
//
// ---------------------------------------------------------------------------
// Why events are appended rather than incremented
//
// The obvious design — read a counter, add one, write it back — is broken on
// KV, and not subtly. KV has no compare-and-swap, so concurrent requests all
// read the same value and all write back the same value+1. Measured against
// the deployed worker: ten simultaneous hits recorded TWO. Sequential traffic
// counted fine, which is exactly what makes it a trap — the numbers look right
// in testing and collapse during the traffic spike you actually care about.
//
// So nothing is ever incremented. Each event appends its own uniquely-named
// key, which cannot collide with anything, and counting is `list()` over the
// day's prefix. Exact by construction, at the cost of a rollup: the daily cron
// folds each closed day into a compact month map so a 90-day read stays a
// handful of KV gets instead of a walk over every event ever written.
//
// Storage shape:
//   stats:e:<metric>:<date>:<uuid>  one per event, TTL 8 days (the raw log)
//   stats:<metric>:<YYYY-MM>        rolled-up { date: count }, TTL 400 days
//   stats:t:<metric>                { n, since, last } lifetime, rolled daily
//
// One write per event. On the Workers free plan that means the KV daily write
// quota (1,000) is also the daily counting ceiling — noted in the README,
// because the failure mode is silently stopping, not visibly breaking.
// ---------------------------------------------------------------------------

const TZ = 'America/Mexico_City';
const EVENT_TTL = 8 * 86400;
const MONTH_TTL = 400 * 86400;
const MAX_DAYS = 90;
const DEFAULT_DAYS = 14;
// How many closed days the cron re-folds each run. Re-counting is idempotent,
// so this is pure slack: the counts survive two consecutive failed crons.
const ROLLUP_DAYS = 3;
// Ceiling on list() pages per day per metric. 10k events in one day is far
// past anything this site will see; if it ever happens the count is reported
// as capped rather than quietly truncated.
const LIST_PAGES = 10;

const METRICS = { v: 'views', c: 'clicks' };

const eventPrefix = (metric, day) => `stats:e:${metric}:${day}:`;
const monthKey = (metric, month) => `stats:${metric}:${month}`;
const totalKey = (metric) => `stats:t:${metric}`;

/** Today where the shop is, as YYYY-MM-DD — en-CA formats exactly that way. */
export function today(at = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(at);
}

/** The n dates ending on `end`, oldest first. */
function lastDays(end, n) {
  const [y, m, d] = end.split('-').map(Number);
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    // Noon UTC keeps the day arithmetic clear of DST edges.
    const t = new Date(Date.UTC(y, m - 1, d, 12) - i * 86400000);
    out.push(t.toISOString().slice(0, 10));
  }
  return out;
}

const read = async (env, key) => JSON.parse((await env.ORDERS.get(key)) || '{}');

/** Exact count of one day's events for one metric, straight from the log. */
async function countEvents(env, metric, day) {
  const prefix = eventPrefix(metric, day);
  let cursor;
  let n = 0;
  for (let page = 0; page < LIST_PAGES; page++) {
    const res = await env.ORDERS.list({ prefix, cursor, limit: 1000 });
    n += res.keys.length;
    if (res.list_complete) return { n, capped: false };
    cursor = res.cursor;
  }
  return { n, capped: true };
}

/**
 * Count one event: append a key nothing else can be named. No read, no
 * increment, nothing to race. Never delays the response it rides along with,
 * and never fails it either — a counter is not worth losing a checkout over.
 */
export function record(env, ctx, metric) {
  if (!env.ORDERS || !METRICS[metric]) return;
  const key = `${eventPrefix(metric, today())}${crypto.randomUUID()}`;
  const done = env.ORDERS
    .put(key, '', { expirationTtl: EVENT_TTL })
    .catch((err) => console.error(`stats: counting ${metric} failed:`, err.message));
  if (ctx?.waitUntil) ctx.waitUntil(done);
}

/**
 * Only count what the site itself asked for. A stray curl or an uptime probe
 * against /inventory shouldn't move the numbers — browsers send Origin on
 * these cross-origin calls, so the allowlist doubles as the filter.
 * (Same list corsHeaders() reads; if the worker ever moves to the site's own
 * origin, Origin goes away on same-origin GETs and counting stops silently.)
 */
export function fromSite(request, env) {
  const allowed = (env.ALLOWED_ORIGINS || 'https://tali.my')
    .split(',')
    .map((o) => o.trim());
  return allowed.includes(request.headers.get('Origin') || '');
}

/**
 * Fold closed days into their month map and advance the lifetime totals.
 * Runs on the daily cron — a single writer, so the increment that is unsafe
 * in the request path is safe here. Idempotent: day counts are assigned, not
 * added, and the lifetime key remembers the last day it consumed.
 */
export async function rollup(env) {
  if (!env.ORDERS) return { rolled: 0 };
  const end = today();
  // Every day in the window except today, which is still accumulating.
  const closed = lastDays(end, ROLLUP_DAYS + 1).slice(0, -1);
  let rolled = 0;

  for (const code of Object.keys(METRICS)) {
    const months = new Map();
    for (const day of closed) {
      const { n } = await countEvents(env, code, day);
      const month = day.slice(0, 7);
      if (!months.has(month)) months.set(month, await read(env, monthKey(code, month)));
      // Assigned, never added — re-running the cron must not double a day.
      // A day with no events is recorded as 0 so it reads as measured.
      months.get(month)[day] = n;
      rolled++;
    }
    for (const [month, map] of months) {
      await env.ORDERS.put(monthKey(code, month), JSON.stringify(map), {
        expirationTtl: MONTH_TTL,
      });
    }

    const key = totalKey(code);
    const total = await read(env, key);
    let changed = false;
    for (const day of closed) {
      if (total.last && day <= total.last) continue;
      const n = Number(months.get(day.slice(0, 7))?.[day]) || 0;
      total.n = (Number(total.n) || 0) + n;
      // Advances even on a zero day, so it is never consumed twice.
      total.last = day;
      if (n && !total.since) total.since = day;
      changed = true;
    }
    if (changed) await env.ORDERS.put(key, JSON.stringify(total));
  }
  return { rolled };
}

/** Daily rows for the last `days` (capped), plus lifetime totals. */
export async function readStats(env, days) {
  const n = Math.min(Math.max(Math.trunc(Number(days)) || DEFAULT_DAYS, 1), MAX_DAYS);
  const end = today();
  const dates = lastDays(end, n);
  const months = [...new Set(dates.map((d) => d.slice(0, 7)))];
  // Oldest day the cron would still be folding; anything before this is
  // settled, so a gap there means the cron was down and reads as zero.
  const rollupFloor = lastDays(end, ROLLUP_DAYS + 1)[0];
  const codes = Object.keys(METRICS);

  const perMetric = await Promise.all(
    codes.map(async (code) => {
      const [parts, total] = await Promise.all([
        Promise.all(months.map((m) => read(env, monthKey(code, m)))),
        read(env, totalKey(code)),
      ]);
      const map = Object.assign({}, ...parts);

      // Today is always counted live; so is any recent day the cron hasn't
      // folded yet. Bounded to the rollup window, so this stays a few lists.
      const live = dates.filter(
        (d) => d === end || (d >= rollupFloor && map[d] === undefined)
      );
      let capped = false;
      let pending = 0;
      await Promise.all(
        live.map(async (day) => {
          const res = await countEvents(env, code, day);
          map[day] = res.n;
          capped = capped || res.capped;
          // Days the lifetime key hasn't consumed yet, so the headline figure
          // includes today instead of lagging a day behind.
          if (!total.last || day > total.last) pending += res.n;
        })
      );
      return { code, map, capped, lifetime: (Number(total.n) || 0) + pending, total };
    })
  );

  const out = { days: [], total: {}, since: null, capped: false };
  out.days = dates.map((date) => {
    const row = { date };
    perMetric.forEach(({ code, map }) => {
      row[METRICS[code]] = Number(map[date]) || 0;
    });
    return row;
  });
  perMetric.forEach(({ code, lifetime, capped, total }) => {
    out.total[METRICS[code]] = lifetime;
    out.capped = out.capped || capped;
    // The earliest stamp across metrics; before the first rollup there is no
    // stamp yet, so fall back to the oldest day in view that saw anything.
    const seen =
      total.since || out.days.find((r) => r[METRICS[code]] > 0)?.date || null;
    if (seen && (!out.since || seen < out.since)) out.since = seen;
  });
  return out;
}
