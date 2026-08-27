// Cloudflare Worker for Tali's embedded Stripe Checkout (DEC-21).
// The public site is pure-static (GitHub Pages), so this worker is the one
// server-side piece: it holds the Stripe secret key and exposes two routes
// consumed by Pricing.astro and ThankYou.astro:
//
//   POST /create-checkout-session  { locale: "en" | "es" } → { clientSecret }
//   GET  /session-status?session_id=cs_… → { status, payment_status, customer_email,
//                           receipt_url, order_status, tracking_url, position, wave,
//                           order_number, address }
//   GET  /price → { unit_amount, currency }   (live price so the site never shows a stale figure)
//
// Deploy: see README.md in this directory. No npm dependencies — talks to the
// Stripe REST API directly with fetch.

// Order-ops routes (DEC-25):
//   POST /stripe-webhook  — Stripe events: paid checkout → Notion row + welcome
//                           email; refund/dispute → Notion status "Canceled"
//   POST /notion-webhook?key=… — Notion automation on Status change → customer
//                           email (shipped / canceled), deduped via KV
//
// Private traffic counters (DEC-29):
//   GET  /stats?key=…&days=N → { days[], total, since, orders } for /stats on
//                           the site. The counting itself is a side effect of
//                           /inventory and /create-checkout-session — see
//                           stats.js for what each number does and does not
//                           mean.
//
// Cron (DEC-26): a daily scheduled() run keeps the price's MXN
// currency_option in step with USD/MXN — see fx.js for why that can't be
// Stripe's job. Schedule in wrangler.toml.
import {
  createOrderPage,
  findPageByPaymentIntent,
  findPageBySessionId,
  setStatus,
  setOrderNumber,
  getPage,
  readOrder,
} from './notion.js';
import { sendOrderEmail, sendStaffEmail, sendAlertEmail } from './emails.js';
import { syncMxnPrice } from './fx.js';
import { fromSite, readStats, record, rollup } from './stats.js';
import {
  claimedCount,
  invalidateCount,
  resolveInventory,
  waveLabel,
} from './inventory.js';

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

  // The real cap (DEC-27). Hiding the button stops nobody holding a stale tab
  // or calling this route directly, so the refusal has to live here. Read
  // fresh — a 60s-stale count is fine for a label, not for the last unit.
  // Never blocks on a Notion outage: an unreachable count fails OPEN, because
  // losing a sale is worse than overselling one unit we can refund.
  if (env.NOTION_TOKEN && env.NOTION_DATABASE_ID) {
    try {
      const sold = await claimedCount(env, { fresh: true });
      const inv = resolveInventory(env, sold);
      if (inv.soldOut && !env.SIGNATURE_PRICE_ID) {
        return json({ error: 'sold_out' }, 409, cors);
      }
    } catch (err) {
      console.error('cap check failed, allowing checkout:', err.message);
    }
  }
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
  // The wave stored at purchase (DEC-27) — authoritative, unlike the pricing
  // card's forecast, which can shift under a buyer mid-checkout.
  let position = null;
  let wave = null;
  // For /track/ (DEC-30): the human order number and where the courier is
  // headed. Same trust boundary as customer_email below — an unguessable
  // session_id that only reached the buyer's own inbox.
  let orderNumber = null;
  let address = null;
  if (env.NOTION_TOKEN && env.NOTION_DATABASE_ID) {
    try {
      const page = await findPageBySessionId(env, session.id);
      if (page) {
        const order = readOrder(page);
        orderStatus = order.status.toLowerCase() || orderStatus;
        trackingUrl = order.tracking || trackingUrl;
        position = order.position;
        wave = order.wave;
        orderNumber = order.orderNumber || null;
        address = order.address || null;
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
      position,
      wave,
      order_number: orderNumber,
      address,
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

// Stripe mints the receipt number only when the receipt is first sent or
// viewed — usually moments AFTER checkout.session.completed. This runs after
// the webhook response (ctx.waitUntil): "view" the receipt to force minting,
// then poll briefly and write the number to the Notion row.
async function backfillOrderNumber(env, pageId, paymentIntent, receiptUrl) {
  try {
    if (receiptUrl) await fetch(receiptUrl);
    for (const delay of [2000, 5000, 10000]) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      const pi = await stripeRequest(
        env,
        'GET',
        `/payment_intents/${paymentIntent}?expand[]=latest_charge`
      );
      const n = pi.latest_charge?.receipt_number;
      if (n) {
        await setOrderNumber(env, pageId, n);
        return;
      }
    }
    console.error('order number backfill: not minted after retries', paymentIntent);
  } catch (err) {
    console.error('order number backfill failed:', err.message);
  }
}

/**
 * The welcome email, at most once per payment. Deliberately decoupled from
 * the Notion row: the buyer has already been charged, so a bookkeeping
 * failure must never cost them their confirmation. Because a failed row now
 * returns 5xx, Stripe replays the whole delivery until it lands — hence the
 * KV guard, so one payment still produces exactly one confirmation.
 * Returns an error message on failure, null on success or skip.
 */
async function sendWelcomeOnce(env, order) {
  if (!order.email || !env.RESEND_API_KEY) return null;
  const key = `welcomed:${order.paymentIntent || order.sessionId}`;
  if (env.ORDERS && (await env.ORDERS.get(key))) return null;
  try {
    await sendOrderEmail(env, 'welcome', order);
    if (env.ORDERS) await env.ORDERS.put(key, new Date().toISOString());
    return null;
  } catch (err) {
    console.error('welcome email failed:', err.message);
    return err.message;
  }
}

async function handleStripeWebhook(request, env, cors, ctx) {
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
      receiptNumber: pi.latest_charge?.receipt_number ?? '',
      paidAt: new Date(event.created * 1000).toISOString(),
      tracking: '',
      labelUrl: `${new URL(request.url).origin}/label?session_id=${session.id}&key=${env.NOTION_WEBHOOK_KEY}`,
    };
    order.orderNumber = order.receiptNumber;
    // Sequence + wave, fixed now and never recomputed (DEC-27). Counted
    // BEFORE this row exists, so this order is the next unit. Best-effort:
    // a Notion hiccup here must not cost us the order row itself.
    try {
      order.position = (await claimedCount(env, { fresh: true })) + 1;
      order.wave = waveLabel(env, order.position);
    } catch (err) {
      console.error('wave assignment failed:', err.message);
    }
    // Row and confirmation are independent duties. A schema mismatch or a
    // Notion outage used to throw straight past both emails, leaving a
    // charged buyer with nothing — order #1 was lost exactly that way.
    let page = null;
    let notionError = null;
    try {
      page = await createOrderPage(env, order);
      // The count moved — drop the cache so the pricing card updates now
      // rather than up to a minute from now.
      await invalidateCount(env);
    } catch (err) {
      notionError = err.message;
      console.error('notion order row failed:', err.message, order.paymentIntent);
    }
    if (page && !order.receiptNumber) {
      ctx.waitUntil(
        backfillOrderNumber(env, page.id, session.payment_intent, pi.latest_charge?.receipt_url)
      );
    }
    // Goes out whether or not the row landed; KV keeps it to exactly once.
    const emailError = await sendWelcomeOnce(env, order);
    if (env.STAFF_EMAIL && env.RESEND_API_KEY) {
      try {
        if (page) {
          await sendStaffEmail(env, 'new-order', order, page.url);
        } else {
          // Louder than a log line nobody reads: a paid order with no row is
          // the one case that needs a human the same day.
          await sendAlertEmail(env, `Tali — pedido pagado SIN fila en Notion (${order.email})`, [
            `Se cobró un pedido pero <b>no</b> se pudo crear su fila en Notion.`,
            `Error de Notion: ${notionError}`,
            `Cliente: ${order.name || order.email} — ${order.amount}`,
            `Payment Intent: ${order.paymentIntent}`,
            `El cliente <b>sí</b> recibió su correo de confirmación.`,
            `Stripe reintentará solo; corrige la base y la fila entra sin tocar nada.`,
          ]);
        }
      } catch (err) {
        console.error('staff email failed:', err.message);
      }
    }
    if (notionError) {
      // 5xx so Stripe keeps retrying until the row exists. Safe to replay:
      // the row is deduped by Payment Intent, the email by KV.
      return json({ error: 'notion row failed', notionError, emailError }, 500, cors);
    }
    return json({ created: true, emailError }, 200, cors);
  }

  if (event.type === 'checkout.session.expired') {
    // Abandoned checkout (DEC-25): the session died without payment — a
    // terminal state, so this row can never become a duplicate of a paid
    // order. Only worth recording if the buyer left an email to contact.
    // Deliberately no customer email: they may simply buy again.
    const session = event.data.object;
    const email = session.customer_details?.email;
    if (!email) return json({ ignored: 'no email' }, 200, cors);
    if (await findPageBySessionId(env, session.id)) {
      return json({ ignored: 'duplicate' }, 200, cors);
    }
    const shipping = session.collected_information?.shipping_details ?? session.shipping_details;
    const abandonedOrder = {
      status: 'Abandoned',
      name: session.customer_details?.name ?? '',
      email,
      phone: session.customer_details?.phone ?? '',
      address: formatAddress(shipping),
      amount: session.amount_total
        ? `$${(session.amount_total / 100).toFixed(2)} ${session.currency.toUpperCase()}`
        : '',
      locale: session.locale?.startsWith('es') ? 'es' : 'en',
      sessionId: session.id,
      paymentIntent: session.payment_intent ?? '',
      receiptUrl: null,
      paidAt: null,
      labelUrl: `${new URL(request.url).origin}/label?session_id=${session.id}&key=${env.NOTION_WEBHOOK_KEY}`,
    };
    const page = await createOrderPage(env, abandonedOrder);
    // Staff heads-up only — the customer is never emailed about abandonment.
    if (env.STAFF_EMAIL && env.RESEND_API_KEY) {
      try {
        await sendStaffEmail(env, 'abandoned', abandonedOrder, page.url);
      } catch (err) {
        console.error('staff email failed:', err.message);
      }
    }
    return json({ abandoned: true }, 200, cors);
  }

  if (event.type === 'charge.refunded' || event.type === 'charge.dispute.created') {
    const paymentIntent = event.data.object.payment_intent;
    const page = paymentIntent && (await findPageByPaymentIntent(env, paymentIntent));
    // The status write triggers the Notion automation, which sends the
    // customer's cancellation email through /notion-webhook.
    if (page) {
      await setStatus(env, page.id, 'Canceled');
      // The unit is released — drop the cached count so the pricing card
      // reflects it now rather than up to a minute from now.
      await invalidateCount(env);
    }
    return json({ canceled: Boolean(page) }, 200, cors);
  }

  return json({ ignored: event.type }, 200, cors);
}

// --- Shipping label (DEC-25 level 1) ---------------------------------------
// Print-ready page: Tali logo + recipient name/address, sized to be cut from
// a letter sheet and glued on the box. Staff-only via the shared key; the
// link is auto-filled in each Notion row's Label column.

function labelPage(order) {
  // Stored address is one comma-joined line; break it into label lines and
  // keep city/state/zip/country grouped at the end.
  const parts = order.address.split(',').map((s) => s.trim()).filter(Boolean);
  const tail = parts.length > 2 ? parts.splice(-3).join(', ') : '';
  const lines = [...parts, tail].filter(Boolean);
  const ref = order.orderNumber || order.paymentIntent || order.sessionId.slice(-6).toUpperCase();
  return `<!doctype html><html><head><meta charset="utf-8"><title>Label — ${order.name}</title>
<style>
@font-face{font-family:'Fraunces';font-weight:100 900;src:url('https://tali.my/fonts/fraunces.woff2') format('woff2');}
@font-face{font-family:'Inter';font-weight:100 900;src:url('https://tali.my/fonts/inter.woff2') format('woff2');}
@font-face{font-family:'IBM Plex Mono';font-weight:400;src:url('https://tali.my/fonts/ibm-plex-mono.woff2') format('woff2');}
@page{size:letter;margin:0.75in;}
body{margin:0;padding:2rem;display:grid;justify-content:center;background:#fff;font-family:'Inter',system-ui,sans-serif;color:#262019;}
.label{width:4in;padding:0.3in 0.35in;background:#fff;border:1.5px solid #262019;border-radius:2px;}
.label img{height:0.32in;display:block;margin-bottom:0.22in;}
.name{font-family:'Fraunces',Georgia,serif;font-size:17pt;font-weight:600;margin:0 0 0.12in;}
.addr{font-size:11.5pt;line-height:1.5;margin:0;}
.ref{font-family:'IBM Plex Mono',monospace;font-size:7.5pt;letter-spacing:0.12em;color:#7a6f5d;margin-top:0.2in;}
.hint{font-size:9pt;color:#7a6f5d;margin-top:1rem;text-align:center;}
@media print{body{background:#fff;padding:0;}.hint{display:none;}}
</style></head><body>
<div>
<div class="label">
  <img src="https://tali.my/images/tali-logo.png" alt="Tali">
  <p class="name">${order.name}</p>
  <p class="addr">${lines.join('<br>')}</p>
  <p class="ref">PEDIDO ${ref}</p>
</div>
<p class="hint">⌘P to print — cut along the border.</p>
</div>
</body></html>`;
}

async function handleLabel(url, env, cors) {
  if (url.searchParams.get('key') !== env.NOTION_WEBHOOK_KEY) {
    return json({ error: 'unauthorized' }, 401, cors);
  }
  const sessionId = url.searchParams.get('session_id') || '';
  const page = sessionId && (await findPageBySessionId(env, sessionId));
  if (!page) return json({ error: 'order not found' }, 404, cors);
  const order = readOrder(page);
  // Stripe assigns the receipt number moments after payment; if the webhook
  // caught the row before it existed, backfill it at print time.
  if (!order.orderNumber && order.paymentIntent && env.STRIPE_SECRET_KEY) {
    try {
      let pi = await stripeRequest(
        env,
        'GET',
        `/payment_intents/${order.paymentIntent}?expand[]=latest_charge`
      );
      if (!pi.latest_charge?.receipt_number && pi.latest_charge?.receipt_url) {
        // Viewing the receipt mints the number; refetch after a beat.
        await fetch(pi.latest_charge.receipt_url);
        await new Promise((resolve) => setTimeout(resolve, 1500));
        pi = await stripeRequest(
          env,
          'GET',
          `/payment_intents/${order.paymentIntent}?expand[]=latest_charge`
        );
      }
      if (pi.latest_charge?.receipt_number) {
        order.orderNumber = pi.latest_charge.receipt_number;
        await setOrderNumber(env, page.id, order.orderNumber);
      }
    } catch (err) {
      console.error('receipt number backfill failed:', err.message);
    }
  }
  return new Response(labelPage(order), {
    headers: { 'Content-Type': 'text/html; charset=utf-8', ...cors },
  });
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
  // Any status edit can move the claimed count — Received/Shipped hold a
  // unit, Canceled/Abandoned release it — so bust the cache before deciding
  // whether this particular edit is also one that emails.
  await invalidateCount(env);
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

// What the next unit sold would be (DEC-27) — series, wave, and a remaining
// count only once the wave is nearly gone. Never returns a total: see
// inventory.js for why the threshold is applied server-side.
async function inventory(env, cors) {
  const sold = await claimedCount(env);
  return json(resolveInventory(env, sold), 200, {
    ...cors,
    // Short, and the webhook busts the KV cache on every sale anyway.
    'Cache-Control': 'public, max-age=30',
  });
}

/**
 * The numbers behind the site's /stats page. Views and clicks come from the
 * KV counters; the funnel's last stage is Notion's claimed count, the same
 * one the cap check trusts — so orders never disagree with inventory.
 */
async function handleStats(url, env, cors) {
  const data = await readStats(env, url.searchParams.get('days'));
  let orders = null;
  if (env.NOTION_TOKEN && env.NOTION_DATABASE_ID) {
    try {
      orders = await claimedCount(env);
    } catch (err) {
      // A Notion outage costs the funnel's last stage, not the whole page.
      console.error('stats: order count unavailable:', err.message);
    }
  }
  return json({ ...data, orders }, 200, { ...cors, 'Cache-Control': 'no-store' });
}

async function price(env, cors) {
  // The Founder price is multi-currency: a USD base plus an MXN
  // currency_option, so Mexican cards aren't asked to authorize a foreign
  // currency (they decline with currency_not_supported) and OXXO — MXN-only —
  // can appear. Checkout picks the option by buyer location on its own, which
  // is why createSession passes no `currency`. The site quotes USD in both
  // locales, so this route deliberately reports only the base amount;
  // currency_options is expandable and would need expand[] to come back.
  const p = await stripeRequest(env, 'GET', `/prices/${env.STRIPE_PRICE_ID}`);
  return json({ unit_amount: p.unit_amount, currency: p.currency }, 200, {
    ...cors,
    // let browsers cache briefly — a price change propagates within minutes
    'Cache-Control': 'public, max-age=300',
  });
}

// --- Daily FX sync (DEC-26) ------------------------------------------------

const money = (cents) =>
  (cents / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

// Staff hear about this only when it matters: a failure, or a move too large
// to publish unattended. A normal daily adjustment is just a log line —
// emailing one every morning would train everyone to ignore the channel.
async function runFxSync(env) {
  const alert = async (subject, lines) => {
    if (!env.STAFF_EMAIL || !env.RESEND_API_KEY) return;
    try {
      await sendAlertEmail(env, subject, lines);
    } catch (err) {
      console.error('fx alert email failed:', err.message);
    }
  };
  try {
    const result = await syncMxnPrice(env, stripeRequest);
    console.log('fx sync:', JSON.stringify(result));
    if (env.ORDERS) {
      await env.ORDERS.put('fx:last', JSON.stringify({ ...result, at: new Date().toISOString() }));
    }
    if (result.blocked) {
      await alert('Tali — precio MXN NO actualizado (movimiento grande)', [
        `El sync diario propuso un cambio fuera del límite y <b>no</b> tocó el precio.`,
        `Motivo: ${result.blocked}`,
        `Actual: $${money(result.current)} MXN → propuesto: $${money(result.proposed)} MXN`,
        `Tipo de cambio: ${result.rate} (${result.source})`,
        `Si es real, actualiza el precio a mano en Stripe.`,
      ]);
    }
    return result;
  } catch (err) {
    console.error('fx sync failed:', err.message);
    await alert('Tali — falló el sync de precio MXN', [
      `El precio en pesos <b>no</b> se actualizó hoy y sigue con el valor anterior.`,
      `Error: ${err.message}`,
      `Sin arreglo, el precio en MXN se va desfasando del precio en USD.`,
    ]);
    throw err;
  }
}

export default {
  // Cron trigger — schedule lives in wrangler.toml. Awaited rather than
  // waitUntil'd on purpose: a throw here marks the invocation failed in the
  // Cloudflare cron dashboard, which is the second place (after the staff
  // alert) anyone would look to notice the price has stopped tracking.
  async scheduled(event, env) {
    await runFxSync(env);
    // Fold yesterday's traffic events into their month map (DEC-29). Separate
    // try: a rollup failure must not look like an FX failure, and neither
    // should take the other down.
    try {
      const { rolled } = await rollup(env);
      console.log(`stats: rolled up ${rolled} day-metrics`);
    } catch (err) {
      console.error('stats: rollup failed:', err.message);
    }
  },

  async fetch(request, env, ctx) {
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }
    const url = new URL(request.url);
    try {
      if (request.method === 'POST' && url.pathname === '/create-checkout-session') {
        // Counted here rather than inside createSession so a press still
        // registers when the cap refuses it or Stripe errors — the visitor
        // pressed Buy either way (DEC-29).
        if (fromSite(request, env)) record(env, ctx, 'c');
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
      if (request.method === 'GET' && url.pathname === '/inventory') {
        // Every page load fetches the wave line, so this route doubles as the
        // impression counter — no beacon script on a static site (DEC-29).
        if (fromSite(request, env)) record(env, ctx, 'v');
        if (!env.NOTION_TOKEN || !env.NOTION_DATABASE_ID) {
          return json({ error: 'order pipeline not configured' }, 503, cors);
        }
        return await inventory(env, cors);
      }
      if (request.method === 'POST' && url.pathname === '/stripe-webhook') {
        if (!env.STRIPE_WEBHOOK_SECRET || !env.NOTION_TOKEN || !env.NOTION_DATABASE_ID) {
          return json({ error: 'order pipeline not configured' }, 503, cors);
        }
        return await handleStripeWebhook(request, env, cors, ctx);
      }
      if (request.method === 'GET' && url.pathname === '/label') {
        if (!env.NOTION_WEBHOOK_KEY || !env.NOTION_TOKEN || !env.NOTION_DATABASE_ID) {
          return json({ error: 'order pipeline not configured' }, 503, cors);
        }
        return await handleLabel(url, env, cors);
      }
      if (request.method === 'GET' && url.pathname === '/stats') {
        if (!env.STATS_KEY) {
          return json({ error: 'stats not configured' }, 503, cors);
        }
        if (url.searchParams.get('key') !== env.STATS_KEY) {
          return json({ error: 'unauthorized' }, 401, cors);
        }
        return await handleStats(url, env, cors);
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
