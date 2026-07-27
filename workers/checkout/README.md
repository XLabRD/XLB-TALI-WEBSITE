# Tali checkout worker

The one server-side piece of the otherwise static site: a Cloudflare Worker
that mints embedded Stripe Checkout sessions (DEC-21). The site's pricing
modal (`src/components/Pricing.astro`) and thanks page
(`src/components/ThankYou.astro`) call it.

## First-time deploy

1. `cd workers/checkout`
2. `npx wrangler login` (opens the browser, needs a free Cloudflare account)
3. In `wrangler.toml`, set `STRIPE_PRICE_ID` to the Founder Edition price
   (`price_…` from Stripe dashboard → Product catalog). Test-mode ID first.
4. `npx wrangler deploy` — note the printed URL, e.g.
   `https://tali-checkout.<account>.workers.dev`
5. `npx wrangler secret put STRIPE_SECRET_KEY` — paste the `sk_test_…` key
   (dashboard → Developers → API keys). Swap to `sk_live_…` at launch.
6. In the site CMS (`npm run dev` → `/keystatic` → Site settings) paste:
   - **Checkout endpoint** = the workers.dev URL from step 4
   - **Stripe publishable key** = the matching `pk_test_…` / `pk_live_…`

While either Keystatic field is empty the site keeps its old behavior
(Payment Link redirect, or contact dialog if that's empty too), so deploying
this worker is safe to do at any time.

## Test

Cards in the embedded form (test mode): `4242 4242 4242 4242`, any future
expiry/CVC. OXXO appears when the session currency is MXN and the payment
method is enabled in the dashboard.

## Order status for customers

The buyer's `/thanks/?session_id=…` page doubles as a live order-status
page. It reads the **Notion orders row** (Status + Tracking URL), so the
Notion workflow below is the only place staff touch an order. Stripe
payment metadata is consulted only as a legacy fallback for orders that
predate the Notion pipeline.

## Order pipeline: Notion + Resend (DEC-25)

Paid checkout → Notion row + welcome email; a human flips **Status** in
Notion → customer gets the shipped/canceled email; Stripe refunds/disputes
→ Status flips to Canceled automatically (which emails the customer too).

### Notion orders database — exact property spec

| Property | Type | Notes |
| --- | --- | --- |
| `Order` | Title | customer name (set by the worker) |
| `Email` | Email | |
| `Phone` | Phone | |
| `Address` | Text | shipping address, one line |
| `Amount` | Text | e.g. `$148.00 USD` |
| `Status` | Select | options exactly: `Received`, `Shipped`, `Canceled`, `Abandoned` |
| `Tracking URL` | URL | paste carrier link before/when marking Shipped |
| `Locale` | Select | options: `en`, `es` (set by the worker) |
| `Session ID` | Text | set by the worker |
| `Payment Intent` | Text | set by the worker (refund matching) |
| `Receipt` | URL | set by the worker |
| `Paid at` | Date | set by the worker |
| `Label` | URL | set by the worker — print-ready shipping label (`/label` route, key-gated) |
| `Order #` | Text | Stripe's receipt number (e.g. `1911-2504`) — the human order number, captured at creation or backfilled when the label is first opened |

Order identity comes from Stripe (author's call, 2026-07-27): `Order #` holds
the human receipt number shown on Stripe receipts and printed on the label;
`Payment Intent` is the canonical machine ID searchable in the dashboard.

Property names/types must match exactly — `notion.js` addresses them by name.

### One-time setup

1. **Notion**: Settings → Connections → Develop or manage integrations →
   New internal integration (read + insert + update content). Copy the
   `ntn_…` token. Share the orders database with the integration (⋯ →
   Connections). Copy the database ID (32-hex segment of its URL) into
   `NOTION_DATABASE_ID` in `wrangler.toml`, then `npx wrangler deploy`.
2. **Resend**: create account → verify domain `tali.my` (add the DNS
   records it shows at Porkbun) → create API key.
3. **Stripe**: Developers → Webhooks → Add endpoint →
   `https://tali-checkout.tali-my.workers.dev/stripe-webhook`, events:
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `checkout.session.expired`, `charge.refunded`, `charge.dispute.created`.
   Copy the signing secret.

Abandoned checkouts: when a session expires (~24 h) with an email typed in,
a row is created with Status `Abandoned` — a follow-up lead, never emailed
automatically. Terminal by design: an expired session can't later complete,
so these never collide with a paid order (a retry is a new session).
4. **Secrets**: `npx wrangler secret put` for `STRIPE_WEBHOOK_SECRET`,
   `NOTION_TOKEN`, `RESEND_API_KEY` (NOTION_WEBHOOK_KEY is already set).
5. **Notion automation** on the orders database: When **Status** is edited →
   Send webhook → URL
   `https://tali-checkout.tali-my.workers.dev/notion-webhook?key=<NOTION_WEBHOOK_KEY>`.

Duplicate-email protection: the worker remembers the last emailed status per
order in KV — repeat saves or status flip-flops never re-send. Editing only
`Tracking URL` never emails; set it before flipping Status to Shipped.

## Going live

Switch `STRIPE_PRICE_ID` to the live price, re-run `npx wrangler deploy`,
re-run `wrangler secret put STRIPE_SECRET_KEY` with the live key, and paste
the live publishable key in Keystatic.
