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
  return json(
    {
      status: session.status,
      payment_status: session.payment_status,
      customer_email: session.customer_details?.email ?? null,
      // Stripe-hosted receipt page — the customer's permanent payment record.
      receipt_url: session.payment_intent?.latest_charge?.receipt_url ?? null,
      // Fulfillment status, maintained by hand in the Stripe dashboard:
      // open the payment → Metadata → set order_status ("shipped") and
      // optionally tracking_url. The thanks page shows both live.
      order_status: session.payment_intent?.metadata?.order_status ?? null,
      tracking_url: session.payment_intent?.metadata?.tracking_url ?? null,
    },
    200,
    cors
  );
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
      return json({ error: 'not found' }, 404, cors);
    } catch (err) {
      return json({ error: err.message }, 502, cors);
    }
  },
};
