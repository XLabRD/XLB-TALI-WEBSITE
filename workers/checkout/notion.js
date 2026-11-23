// Notion API helpers for the orders database (DEC-25).
// The database's property names/types are specified in README.md ("Notion
// orders database") — the strings here must match them exactly.

const NOTION_API = 'https://api.notion.com/v1';

async function notionRequest(env, method, path, body) {
  const res = await fetch(`${NOTION_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.NOTION_TOKEN}`,
      'Notion-Version': '2022-06-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `Notion ${res.status}`);
  return data;
}

const text = (s) => ({ rich_text: [{ text: { content: s || '' } }] });

/**
 * Count orders that occupy a unit (DEC-27). `Received` and `Shipped` are the
 * two statuses that mean a real buyer holds a slot; `Canceled` and
 * `Abandoned` release it. Paginated — Notion caps a query at 100 rows, which
 * is exactly the Founders cap, so the second page matters from unit 101.
 *
 * Counting rows rather than keeping a running KV counter is deliberate: a
 * counter drifts the first time a webhook is retried or an order is fixed by
 * hand, and Notion is already the sole source of truth for order state
 * (DEC-25). It costs one API call per cache miss.
 */
export async function countClaimedOrders(env) {
  const filter = {
    or: [
      { property: 'Status', select: { equals: 'Received' } },
      { property: 'Status', select: { equals: 'Shipped' } },
    ],
  };
  let count = 0;
  let cursor;
  do {
    const page = await notionRequest(env, 'POST', `/databases/${env.NOTION_DATABASE_ID}/query`, {
      filter,
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    });
    count += page.results.length;
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);
  return count;
}

export function createOrderPage(env, o) {
  return notionRequest(env, 'POST', '/pages', {
    parent: { database_id: env.NOTION_DATABASE_ID },
    properties: {
      Order: { title: [{ text: { content: o.name || o.email } }] },
      Email: { email: o.email || null },
      Phone: { phone_number: o.phone || null },
      Address: text(o.address),
      Amount: text(o.amount),
      // Stripe's receipt number (e.g. 1911-2504) — the human order number.
      'Order #': text(o.receiptNumber),
      // Multi-kit orders (DEC-36): ONE ROW PER KIT, so each kit carries its
      // own Serial No, Position and status, and the claimed count above keeps
      // counting rows. Rows of one order share Payment Intent, Session ID and
      // Order #. Quantity is the order's total kit count (same on every row);
      // Kit is this row's place in it, e.g. "2/3". Abandoned rows carry the
      // quantity they were about to buy and no Kit.
      ...(o.quantity ? { Quantity: { number: o.quantity } } : {}),
      ...(o.kit ? { Kit: text(o.kit) } : {}),
      Status: { select: { name: o.status || 'Received' } },
      // Sequence + wave, fixed at purchase and never recomputed (DEC-27) —
      // this is the ship date the buyer was promised. Omitted for abandoned
      // checkouts, which never claimed a unit.
      ...(o.position ? { Position: { number: o.position } } : {}),
      ...(o.wave ? { Wave: { select: { name: o.wave } } } : {}),
      Locale: { select: { name: o.locale } },
      // Pre-filled with the buyer's delivery page (DEC-30) so a row is never
      // missing a link. Only set at creation, so a carrier link pasted later
      // is never overwritten. Abandoned rows pass nothing and stay empty.
      //
      // Guarded because Notion rejects a malformed URL for the WHOLE page:
      // this value is assembled from env.SITE, and a misconfigured SITE must
      // cost an empty field, never the order row itself.
      'Tracking URL': { url: /^https?:\/\//.test(o.tracking || '') ? o.tracking : null },
      'Session ID': text(o.sessionId),
      'Payment Intent': text(o.paymentIntent),
      Receipt: { url: o.receiptUrl || null },
      Label: { url: o.labelUrl || null },
      // Abandoned checkouts never paid — omit the date instead of nulling it.
      ...(o.paidAt ? { 'Paid at': { date: { start: o.paidAt } } } : {}),
    },
  });
}

export async function findPageBySessionId(env, sessionId) {
  const r = await notionRequest(env, 'POST', `/databases/${env.NOTION_DATABASE_ID}/query`, {
    filter: { property: 'Session ID', rich_text: { equals: sessionId } },
    page_size: 1,
  });
  return r.results[0] ?? null;
}

export async function findPageByPaymentIntent(env, paymentIntent) {
  const r = await notionRequest(env, 'POST', `/databases/${env.NOTION_DATABASE_ID}/query`, {
    filter: { property: 'Payment Intent', rich_text: { equals: paymentIntent } },
    page_size: 1,
  });
  return r.results[0] ?? null;
}

/**
 * Every row of one order (DEC-36: one row per kit). A paid order's identity
 * is its Payment Intent; the max is 10 kits, so one page of results is
 * always enough. Sorted by kit number so callers can rely on the order.
 */
async function findPages(env, property, value) {
  const r = await notionRequest(env, 'POST', `/databases/${env.NOTION_DATABASE_ID}/query`, {
    filter: { property, rich_text: { equals: value } },
    page_size: 100,
  });
  return r.results.sort((a, b) => kitIndex(a) - kitIndex(b));
}

export const findPagesByPaymentIntent = (env, paymentIntent) =>
  findPages(env, 'Payment Intent', paymentIntent);

export const findPagesBySessionId = (env, sessionId) =>
  findPages(env, 'Session ID', sessionId);

/** "2/3" → 2. Rows from before DEC-36 have no Kit and are kit 1 of 1. */
export function kitIndex(page) {
  const kit = (page.properties?.Kit?.rich_text ?? []).map((t) => t.plain_text).join('');
  const n = parseInt(kit, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export function setStatus(env, pageId, status) {
  return notionRequest(env, 'PATCH', `/pages/${pageId}`, {
    properties: { Status: { select: { name: status } } },
  });
}

export function setOrderNumber(env, pageId, receiptNumber) {
  return notionRequest(env, 'PATCH', `/pages/${pageId}`, {
    properties: { 'Order #': text(receiptNumber) },
  });
}

export function getPage(env, pageId) {
  return notionRequest(env, 'GET', `/pages/${pageId}`);
}

/** Flatten a Notion page into the fields the email pipeline needs. */
export function readOrder(page) {
  const p = page.properties;
  const plain = (prop) => (prop?.rich_text ?? []).map((t) => t.plain_text).join('');
  return {
    name: (p.Order?.title ?? []).map((t) => t.plain_text).join(''),
    email: p.Email?.email ?? '',
    address: plain(p.Address),
    // Stripe identifiers: receipt number (human order number, printed on the
    // label) and PaymentIntent (canonical id, dashboard-searchable).
    orderNumber: plain(p['Order #']),
    paymentIntent: plain(p['Payment Intent']),
    status: p.Status?.select?.name ?? '',
    tracking: p['Tracking URL']?.url ?? '',
    locale: p.Locale?.select?.name === 'es' ? 'es' : 'en',
    sessionId: plain(p['Session ID']),
    // DEC-27 — null on rows created before waves existed.
    position: p.Position?.number ?? null,
    wave: p.Wave?.select?.name ?? null,
    // DEC-36 — empty on rows from before multi-kit, which were 1 of 1.
    pageId: page.id,
    quantity: p.Quantity?.number ?? 1,
    kit: plain(p.Kit),
  };
}
