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

export function createOrderPage(env, o) {
  return notionRequest(env, 'POST', '/pages', {
    parent: { database_id: env.NOTION_DATABASE_ID },
    properties: {
      Order: { title: [{ text: { content: o.name || o.email } }] },
      Email: { email: o.email || null },
      Phone: { phone_number: o.phone || null },
      Address: text(o.address),
      Amount: text(o.amount),
      Status: { select: { name: o.status || 'Received' } },
      Locale: { select: { name: o.locale } },
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

export function setStatus(env, pageId, status) {
  return notionRequest(env, 'PATCH', `/pages/${pageId}`, {
    properties: { Status: { select: { name: status } } },
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
    // Notion's auto-increment ID property — the human order number (PED-n).
    orderNumber: p['Order #']?.unique_id
      ? `${p['Order #'].unique_id.prefix ?? ''}-${p['Order #'].unique_id.number}`
      : '',
    status: p.Status?.select?.name ?? '',
    tracking: p['Tracking URL']?.url ?? '',
    locale: p.Locale?.select?.name === 'es' ? 'es' : 'en',
    sessionId: plain(p['Session ID']),
  };
}
