# Tali — product site

Bilingual (en-US at `/`, es-MX at `/es/`) static product site for Tali, a
premium IoT environmental monitor (e-paper display + Puk wireless sensors +
app) guarding wine, cigars and other climate-sensitive collections.

Built with the `content-site` skill. **Read `DECISIONS.md` first** — it is
the ledger of decided and still-open choices. Deferred defaults are marked
in code with `TODO(DEC-n)`; find them with `grep -rn "TODO(DEC-" src/ public/ *.mjs`.

## Commands

- `npm run dev` — dev server **with** Keystatic admin at `/keystatic` (sets `KEYSTATIC=true`)
- `npm run build` — pure-static public build to `dist/` (no CMS, no adapter)
- `npm run preview` — preview the built site

## Architecture

- **Astro 6** (pinned ≤6: Keystatic 5.1 doesn't support Astro 7 yet — DEC-9),
  static output. React exists **only** for the Keystatic admin UI; the public
  site ships no framework JS, just the small contact-form `<script>`.
- **Env-gated CMS**: `astro.config.mjs` adds `react() + keystatic()` and the
  node adapter only when `KEYSTATIC=true`. The public build must stay 100%
  static — never add SSR to it.
- **Content** in `src/content/`:
  - Collections: `features/`, `faq/`, `plans/` — one JSON file per entry,
    each with side-by-side `en`/`es` objects and an `order` number.
  - Singletons in `site/`: `settings.json` (name, contact email, form
    endpoint, socials), `home.json` (all section copy, per locale),
    `ui.json` (nav/form/meta strings, per locale).
- **Schema pair**: every collection/singleton is defined twice — Zod in
  `src/content.config.ts` (build-time validation) and mirrored in
  `keystatic.config.ts` (admin UI). **Keep them aligned** when adding fields.
  Zod strips unknown keys, so a Keystatic-added `slug` key in JSON is harmless.
- **Pages**: `src/pages/index.astro` (en) and `src/pages/es/index.astro` (es)
  both render `src/components/Landing.astro` with a `locale` prop; Landing
  loads content and composes Hero → System → ExplodedView → AppShowcase →
  Features → Film → Pricing (single Founder Limited Edition) → ShipSchedule →
  Faq → Contact inside `layouts/Base.astro` (meta, OG, hreflang alternates).
- **Design tokens**: all colors/fonts/layout in `:root` of
  `src/styles/global.css`. Components use scoped `<style>` consuming tokens
  only — never hard-code a color outside `:root`. A rebrand touches `:root`
  and nothing else.
- **Forms**: plain POST + honeypot + fetch enhancement in `Contact.astro`.
  While `settings.formEndpoint` is empty (DEC-11) the form falls back to
  `mailto:`.
- **Checkout** (DEC-21): embedded Stripe Checkout in a modal on the pricing
  section. Sessions come from a Cloudflare Worker in `workers/checkout/`
  (deployed separately with wrangler — the only server-side piece, holds the
  secret key; see its README). Activated by `settings.checkoutEndpoint` +
  `settings.stripePublishableKey`; while empty the CTA falls back to the
  Payment Link (`orderUrl`), then `#contact`. Post-payment return pages at
  `/thanks/` + `/es/thanks/` (noindex, sitemap-excluded) query the worker's
  `/session-status` to distinguish paid / OXXO-voucher-pending / incomplete.
- **Local delivery** (DEC-30): `/track/` + `/es/track/` (noindex,
  sitemap-excluded, public) explain that a same-day courier carries no tracking
  number. Staff paste the page's URL into the Notion row's `Tracking URL`, which
  already drives the "Track your shipment" button on `/thanks/` and in the
  shipped email. Works bare or with `?session_id=` for a personalized view.
- **Traffic figures** (DEC-29): the worker counts page loads (`/inventory`) and
  Buy-now presses (`/create-checkout-session`) in KV as a side effect of calls
  the site already makes — no analytics script anywhere. `src/pages/stats.astro`
  (`/stats/`, noindex, sitemap-excluded, English-only) reads them back through
  `/stats?key=…`, gated on the worker's `STATS_KEY` secret.

## Gotchas

- Brand assets live in `public/images/` (logo wordmark, hero prototype
  photo) + `public/favicon.png`; originals in `~/Desktop/Assets` (incl. 7
  unpublished .MOV product videos and the business pitch PDF).
- `DeviceMock.astro` is an unused CSS-drawn device mock, kept as a fallback
  visual (DEC-19).
- Copy exists in both languages everywhere — when editing copy, edit both
  `en` and `es`, never one.
- Deploy is GitHub Actions → GitHub Pages (`.github/workflows/deploy.yml`),
  inactive until a remote exists (DEC-14). `public/CNAME` pins `tali.my`.
