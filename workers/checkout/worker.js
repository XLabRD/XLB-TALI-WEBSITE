// Cloudflare Worker for Tali's embedded Stripe Checkout (DEC-21).
// The public site is pure-static (GitHub Pages), so this worker is the one
// server-side piece: it holds the Stripe secret key and exposes two routes
// consumed by Pricing.astro and ThankYou.astro:
//
//   POST /create-checkout-session  { locale: "en" | "es" } → { clientSecret }
//   GET  /session-status?session_id=cs_… → { status, payment_status, customer_email, receipt_url }
//   GET  /price → { unit_amount, currency }   (live price so the site never shows a stale figure)
//
// Deploy: see README.md in this directory. No npm dependencies — talks to the
// Stripe REST API directly with fetch.

// Order-ops routes (DEC-25):
//   POST /stripe-webhook  — Stripe events: paid checkout → Notion row + welcome
//                           email; refund/dispute → Notion status "Canceled"
//   POST /notion-webhook?key=… — Notion automation on Status change → customer
//                           email (shipped / canceled), deduped via KV
import {
  createOrderPage,
  findPageByPaymentIntent,
  findPageBySessionId,
  setStatus,
  getPage,
  readOrder,
} from './notion.js';
import { sendOrderEmail } from './emails.js';

const STRIPE_API = 'https://api.stripe.com/v1';

function corsHeaders(request, env) {
  const allowed = (env.ALLOWED_ORIGINS || 'https://tali.my')
    .split(',')
    .map((o) => o.trim());
  const origin = request.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

function json(body, status, cors) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}

async function stripeRequest(env, method, path, params) {
  const res = await fetch(`${STRIPE_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      ...(params ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: params ? params.toString() : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || `Stripe ${res.status}`);
  }
  return data;
}

async function createSession(request, env, cors) {
  const { locale } = await request.json().catch(() => ({}));
  const es = locale === 'es';
  const site = env.SITE || 'https://tali.my';
  const params = new URLSearchParams({
    mode: 'payment',
    ui_mode: 'embedded_page',
    // Stripe has no es-MX; es-419 is Latin-American Spanish.
    locale: es ? 'es-419' : 'en',
    'line_items[0][price]': env.STRIPE_PRICE_ID,
    'line_items[0][quantity]': '1',
    // Shipping address + phone, needed to fulfill the physical Founder
    // Edition; countries come from SHIP_COUNTRIES in wrangler.toml.
    'phone_number_collection[enabled]': 'true',
    // return_url (not redirect_on_completion:never) so voucher methods like
    // OXXO stay available; buyer lands on the localized thanks page.
    return_url: `${site}${es ? '/es' : ''}/thanks/?session_id={CHECKOUT_SESSION_ID}`,
  });
  (env.SHIP_COUNTRIES || 'MX,US')
    .split(',')
    .forEach((c) =>
      params.append('shipping_address_collection[allowed_countries][]', c.trim())
    );
  const session = await stripeRequest(env, 'POST', '/checkout/sessions', params);
  return json({ clientSecret: session.client_secret }, 200, cors);
}

async function sessionStatus(url, env, cors) {
  const id = url.searchParams.get('session_id') || '';
  if (!/^cs_[A-Za-z0-9_]+$/.test(id)) {
    return json({ error: 'invalid session_id' }, 400, cors);
  }
  const session = await stripeRequest(
    env,
    'GET',
    `/checkout/sessions/${id}?expand[]=payment_intent.latest_charge`
  );
  // Fulfillment status comes from the Notion orders row (DEC-25) — the one
  // place staff edit. Legacy Stripe metadata is the fallback for orders that
  // predate the Notion pipeline. Notion statuses are capitalized selects
  // (Received/Shipped/Canceled); the thanks page expects lowercase.
  let orderStatus = session.payment_intent?.metadata?.order_status ?? null;
  let trackingUrl = session.payment_intent?.metadata?.tracking_url ?? null;
  if (env.NOTION_TOKEN && env.NOTION_DATABASE_ID) {
    try {
      const page = await findPageBySessionId(env, session.id);
      if (page) {
        const order = readOrder(page);
        orderStatus = order.status.toLowerCase() || orderStatus;
        trackingUrl = order.tracking || trackingUrl;
      }
    } catch (err) {
      console.error('notion status lookup failed:', err.message);
    }
  }
  return json(
    {
      status: session.status,
      payment_status: session.payment_status,
      customer_email: session.customer_details?.email ?? null,
      // Stripe-hosted receipt page — the customer's permanent payment record.
      receipt_url: session.payment_intent?.latest_charge?.receipt_url ?? null,
      order_status: orderStatus,
      tracking_url: trackingUrl,
    },
    200,
    cors
  );
}

// --- Stripe webhook (signature scheme: HMAC-SHA256 over "t.payload") -------

async function verifyStripeSignature(payload, header, secret) {
  const t = header.match(/(?:^|,)t=(\d+)/)?.[1];
  const v1s = [...header.matchAll(/(?:^|,)v1=([0-9a-f]+)/g)].map((m) => m[1]);
  if (!t || !v1s.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${payload}`));
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return v1s.includes(hex);
}

function formatAddress(details) {
  const a = details?.address ?? {};
  return [a.line1, a.line2, a.city, a.state, a.postal_code, a.country]
    .filter(Boolean)
    .join(', ');
}

async function handleStripeWebhook(request, env, cors) {
  const payload = await request.text();
  const signature = request.headers.get('Stripe-Signature') || '';
  if (!(await verifyStripeSignature(payload, signature, env.STRIPE_WEBHOOK_SECRET))) {
    return json({ error: 'bad signature' }, 400, cors);
  }
  const event = JSON.parse(payload);

  if (
    event.type === 'checkout.session.completed' ||
    event.type === 'checkout.session.async_payment_succeeded'
  ) {
    const session = event.data.object;
    // Voucher methods (OXXO) complete later via async_payment_succeeded.
    if (session.payment_status !== 'paid') return json({ ignored: 'unpaid' }, 200, cors);
    // Stripe retries deliveries — creating twice would duplicate the row.
    if (await findPageByPaymentIntent(env, session.payment_intent)) {
      return json({ ignored: 'duplicate' }, 200, cors);
    }
    const pi = await stripeRequest(
      env,
      'GET',
      `/payment_intents/${session.payment_intent}?expand[]=latest_charge`
    );
    const shipping = session.collected_information?.shipping_details ?? session.shipping_details;
    const order = {
      name: session.customer_details?.name ?? '',
      email: session.customer_details?.email ?? '',
      phone: session.customer_details?.phone ?? '',
      address: formatAddress(shipping),
      amount: `$${(session.amount_total / 100).toFixed(2)} ${session.currency.toUpperCase()}`,
      locale: session.locale?.startsWith('es') ? 'es' : 'en',
      sessionId: session.id,
      paymentIntent: session.payment_intent,
      receiptUrl: pi.latest_charge?.receipt_url ?? null,
      paidAt: new Date(event.created * 1000).toISOString(),
      tracking: '',
    };
    await createOrderPage(env, order);
    // Email is best-effort: the row must survive even if Resend is down or
    // not configured yet, and Stripe's retry would dedupe on the row anyway.
    let emailError = null;
    if (order.email && env.RESEND_API_KEY) {
      try {
        await sendOrderEmail(env, 'welcome', order);
      } catch (err) {
        emailError = err.message;
        console.error('welcome email failed:', err.message);
      }
    }
    return json({ created: true, emailError }, 200, cors);
  }

  if (event.type === 'charge.refunded' || event.type === 'charge.dispute.created') {
    const paymentIntent = event.data.object.payment_intent;
    const page = paymentIntent && (await findPageByPaymentIntent(env, paymentIntent));
    // The status write triggers the Notion automation, which sends the
    // customer's cancellation email through /notion-webhook.
    if (page) await setStatus(env, page.id, 'Canceled');
    return json({ canceled: Boolean(page) }, 200, cors);
  }

  return json({ ignored: event.type }, 200, cors);
}

// --- Notion automation webhook --------------------------------------------

async function handleNotionWebhook(request, url, env, cors) {
  if (url.searchParams.get('key') !== env.NOTION_WEBHOOK_KEY) {
    return json({ error: 'unauthorized' }, 401, cors);
  }
  // The automation payload shape is undocumented — treat it purely as a
  // trigger and re-read the page from the API as the source of truth.
  const body = await request.json().catch(() => ({}));
  const pageId = body?.data?.id ?? body?.page?.id ?? body?.id;
  if (!pageId) return json({ error: 'no page id in payload' }, 400, cors);

  const order = readOrder(await getPage(env, pageId));
  const kind =
    order.status === 'Shipped' ? 'shipped' : order.status === 'Canceled' ? 'canceled' : null;
  if (!kind || !order.email) return json({ skipped: order.status }, 200, cors);

  // Dedupe: repeated saves / back-and-forth edits must not re-email.
  const kvKey = `emailed:${pageId}`;
  if ((await env.ORDERS.get(kvKey)) === order.status) {
    return json({ skipped: 'already emailed' }, 200, cors);
  }
  await sendOrderEmail(env, kind, order);
  await env.ORDERS.put(kvKey, order.status);
  return json({ sent: kind }, 200, cors);
}

async function price(env, cors) {
  const p = await stripeRequest(env, 'GET', `/prices/${env.STRIPE_PRICE_ID}`);
  return json({ unit_amount: p.unit_amount, currency: p.currency }, 200, {
    ...cors,
    // let browsers cache briefly — a price change propagates within minutes
    'Cache-Control': 'public, max-age=300',
  });
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }
    const url = new URL(request.url);
    try {
      if (request.method === 'POST' && url.pathname === '/create-checkout-session') {
        if (!env.STRIPE_SECRET_KEY || !env.STRIPE_PRICE_ID) {
          return json({ error: 'worker not configured' }, 500, cors);
        }
        return await createSession(request, env, cors);
      }
      if (request.method === 'GET' && url.pathname === '/session-status') {
        return await sessionStatus(url, env, cors);
      }
      if (request.method === 'GET' && url.pathname === '/price') {
        return await price(env, cors);
      }
      if (request.method === 'POST' && url.pathname === '/stripe-webhook') {
        if (!env.STRIPE_WEBHOOK_SECRET || !env.NOTION_TOKEN || !env.NOTION_DATABASE_ID) {
          return json({ error: 'order pipeline not configured' }, 503, cors);
        }
        return await handleStripeWebhook(request, env, cors);
      }
      if (request.method === 'POST' && url.pathname === '/notion-webhook') {
        if (!env.NOTION_WEBHOOK_KEY || !env.NOTION_TOKEN || !env.RESEND_API_KEY) {
          return json({ error: 'order pipeline not configured' }, 503, cors);
        }
        return await handleNotionWebhook(request, url, env, cors);
      }
      return json({ error: 'not found' }, 404, cors);
    } catch (err) {
      return json({ error: err.message }, 502, cors);
    }
  },
};
