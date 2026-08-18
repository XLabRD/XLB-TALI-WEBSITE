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

## Peso pricing + daily FX sync (DEC-26)

The Founder price is a **USD** Price object that also carries an **MXN**
`currency_options` entry. Both halves matter:

- Mexican-issued cards decline foreign-currency authorizations
  (`currency_not_supported`) — the error customers were hitting.
- OXXO only exists in MXN, so a USD-only price hides it entirely.

Checkout picks the right one from the buyer's location, which is why
`createSession` passes **no** `currency` — don't add one.

Stripe can't keep the peso figure current for us: Adaptive Pricing requires
the price currency to be one of your settlement currencies, and Mexico has no
multi-currency settlement, so MXN is the account's only one and a USD price is
ineligible. `fx.js` therefore recomputes it daily from a live rate.

**Seed the MXN option once** (the cron maintains it afterwards):

```bash
curl https://api.stripe.com/v1/prices/$STRIPE_PRICE_ID \
  -u "sk_live_...:" \
  -d "currency_options[mxn][unit_amount]=219900" \
  -d "currency_options[mxn][tax_behavior]=inclusive"
```

Match `tax_behavior` to the base price's (DEC-17: IVA included). Also enable
**OXXO** in the Dashboard's payment method settings — it can't have been
appearing while the price was USD-only.

Tune the margin with `FX_BUFFER_PCT` in `wrangler.toml` (default `3`). The
rounding step adds a little more, so the real buffer is 3–5%.

Test the cron without waiting a day:

```bash
npx wrangler dev --test-scheduled     # then, in another shell:
curl "http://localhost:8787/__scheduled"
npx wrangler tail                     # watch real runs: look for `fx sync:`
```

Guards, all failing closed — the price is left alone and staff get an email:
rate must be within 10–30 MXN/USD, a single day's move can't exceed 8%, the
result can't fall under $500 MXN, and an unchanged figure is never rewritten.
Last run is stashed in KV under `fx:last` for debugging. A normal daily
adjustment is a log line only; mail means something needs a human.

## Founders waves + cap (DEC-27)

Founders is 100 units in two waves of 50 (`FOUNDERS_CAP`, `WAVE_SIZE` in
`wrangler.toml`); unit 101 onward is the unlimited Signature Series.

`GET /inventory` → `{series, wave, remaining, soldOut}` describes the **next**
unit, for the pricing card. It never returns a total: `remaining` stays `null`
until a wave is within `WAVE_COUNTDOWN_AT` units, and that threshold is applied
server-side so the real count isn't sitting in a response anyone can poll.

A buyer's own wave is different — the webhook stamps `Position` and `Wave` onto
the Notion row at purchase and nothing recomputes them, so the date promised on
`/thanks/` can't drift when a refund lands. Two extra properties are required:

| Property | Type | Notes |
| --- | --- | --- |
| `Position` | Number | sequence in the run, set by the worker |
| `Wave` | Select | options exactly: `Wave 1`, `Wave 2`, `Signature` |

The count is Notion rows with Status `Received` or `Shipped` — `Canceled` and
`Abandoned` release the unit — cached 60s in KV and busted on each sale.

The cap is enforced in `createSession`, not just by disabling the button: a
stale tab or a direct call would otherwise sell unit 101. It **fails open** if
Notion is unreachable, on the grounds that a lost sale costs more than an
oversell you can refund. Two known gaps, both deliberate:

- Simultaneous buyers at unit 100 can both pass the check. At this volume,
  reconcile by hand rather than build locking.
- **The Payment Link fallback (`orderUrl`) bypasses this worker entirely** and
  will keep selling after the cap. Set a `restrictions` completed-sessions
  limit on the link in Stripe.

Wave wording lives in `src/content/site/home.json` (card) and `ui.json`
(thanks page), both locales — change a boundary here and that copy must follow.

## Going live

Switch `STRIPE_PRICE_ID` to the live price, re-run `npx wrangler deploy`,
re-run `wrangler secret put STRIPE_SECRET_KEY` with the live key, and paste
the live publishable key in Keystatic.
