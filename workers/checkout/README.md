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

## Going live

Switch `STRIPE_PRICE_ID` to the live price, re-run `npx wrangler deploy`,
re-run `wrangler secret put STRIPE_SECRET_KEY` with the live key, and paste
the live publishable key in Keystatic.
