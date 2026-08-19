#!/usr/bin/env node
// Change the Founder price everywhere, in one command (DEC-28).
//
//   npm run set-price -- 149          # dry run: shows every change, touches nothing
//   npm run set-price -- 149 --apply  # actually does it
//
// Why a script and not a checklist: a price change has eleven steps and two
// silent failure modes.
//
//   1. Stripe Prices are IMMUTABLE on unit_amount — the update endpoint takes
//      active / currency_options / lookup_key / metadata / nickname /
//      tax_behavior and nothing else. Changing the amount means creating a new
//      Price and archiving the old one.
//   2. Stripe refuses to archive a Price that is its product's default_price,
//      so the default has to be handed to the new price first. Miss this and
//      you are left holding a created-but-unused price and a store still
//      selling at the old one.
//   3. A brand-new Price has no MXN currency_option, and the DEC-26 cron only
//      fills it at 16:30 UTC. In that window every Mexican card is back to
//      declining with currency_not_supported and OXXO disappears — the exact
//      bug DEC-17 exists to fix, silently reintroduced by routine work. So the
//      peso amount is set in the SAME call that creates the price.
//
// The peso figure comes from fx.js, so the script and the cron round
// identically and the next cron run is a no-op rather than a correction.

import { readFileSync, writeFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchRate, pesoAmount } from '../workers/checkout/fx.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WRANGLER = join(ROOT, 'workers/checkout/wrangler.toml');
const CONTENT = join(ROOT, 'src/content');
const STRIPE = 'https://api.stripe.com/v1';

// A price outside this band is a typo — dollars mistaken for cents, or a
// decimal slip. Refuse rather than publish it to a live store.
const MIN_USD = 10;
const MAX_USD = 2000;

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const amountArg = args.find((a) => !a.startsWith('-'));

const die = (msg) => {
  console.error(`\n  ✗ ${msg}\n`);
  process.exit(1);
};

// A rejected top-level await in an ESM module surfaces as uncaughtException,
// not unhandledRejection — so without this an ordinary Stripe error ("Invalid
// API Key") prints a Node stack trace instead of the message. A failure after
// the new price is created still leaves the old one active, which is the safe
// half to fail on.
process.on('uncaughtException', (err) => die(err?.message ?? String(err)));

if (!amountArg) die('Usage: npm run set-price -- <new USD amount> [--apply]');

const usd = Number(amountArg);
if (!Number.isFinite(usd) || usd < MIN_USD || usd > MAX_USD) {
  die(`"${amountArg}" is not a plausible price (expected ${MIN_USD}–${MAX_USD} USD).`);
}
const usdCents = Math.round(usd * 100);

const key = process.env.STRIPE_SECRET_KEY;
if (!key) die('STRIPE_SECRET_KEY is not set.\n    export STRIPE_SECRET_KEY=sk_live_<your key>');
// Catch the placeholder being pasted through verbatim, which otherwise costs a
// round trip to Stripe to be told "Invalid API Key provided: sk_live_...".
if (!/^(sk|rk)_(live|test)_[A-Za-z0-9]{16,}$/.test(key)) {
  die(
    'STRIPE_SECRET_KEY does not look like a Stripe key.\n' +
      '    Expected sk_live_… / sk_test_… (or rk_… for a restricted key).\n' +
      '    If you copied the example literally, replace the "…" with the real key\n' +
      '    from Stripe → Developers → API keys.'
  );
}

async function stripe(method, path, params) {
  const res = await fetch(`${STRIPE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(params ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: params ? new URLSearchParams(params).toString() : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `Stripe ${res.status}`);
  return data;
}

const toml = readFileSync(WRANGLER, 'utf8');
const currentId = toml.match(/^STRIPE_PRICE_ID\s*=\s*"([^"]+)"/m)?.[1];
if (!currentId) die(`Could not find STRIPE_PRICE_ID in ${relative(ROOT, WRANGLER)}`);
const bufferPct = Number(toml.match(/^FX_BUFFER_PCT\s*=\s*"([^"]+)"/m)?.[1] ?? 3);

// --- Gather ---------------------------------------------------------------

const old = await stripe('GET', `/prices/${currentId}`);
if (old.unit_amount === usdCents) {
  die(`The live price is already $${usd.toFixed(2)} ${old.currency.toUpperCase()}.`);
}
const { rate, source } = await fetchRate();
const mxnCents = pesoAmount(usdCents, rate, bufferPct);

const money = (c) => (c / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const oldUsd = old.unit_amount / 100;

// --- Content literals -----------------------------------------------------
// Matches $125, $125.00, $125 USD and $125.00 USD, keeping whichever suffixes
// were there. The (?![\d.]) AFTER the optional cents is what makes it safe: it
// rejects both $1250 and $125.50, either of which would otherwise have its
// leading digits rewritten and its decimals left behind.
const literal = new RegExp(
  `\\$${String(oldUsd).replace('.', '\\.')}(\\.00)?(?![\\d.])(\\s*USD)?`,
  'g'
);
const replaceIn = (s) =>
  s.replace(literal, (_m, cents, usdSuffix) => `$${usd}${cents ?? ''}${usdSuffix ?? ''}`);

async function jsonFiles(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await jsonFiles(p)));
    else if (e.name.endsWith('.json')) out.push(p);
  }
  return out;
}

const edits = [];
for (const file of await jsonFiles(CONTENT)) {
  const before = readFileSync(file, 'utf8');
  const after = replaceIn(before);
  if (after !== before) {
    edits.push({ file, after, hits: before.match(literal)?.length ?? 0 });
  }
}

// --- Report ---------------------------------------------------------------

console.log(`
  Founder price  $${oldUsd.toFixed(2)} → $${usd.toFixed(2)} ${old.currency.toUpperCase()}
  Peso option    $${money(mxnCents)} MXN   (rate ${rate} via ${source}, +${bufferPct}% buffer)
  Tax behavior   ${old.tax_behavior}
  Product        ${old.product}

  Stripe:  create new price with the peso option, archive ${currentId}
  Config:  STRIPE_PRICE_ID in ${relative(ROOT, WRANGLER)}
  Content: ${edits.length} file(s), ${edits.reduce((n, e) => n + e.hits, 0)} literal(s)`);
for (const e of edits) console.log(`           ${relative(ROOT, e.file)} (${e.hits})`);

if (!apply) {
  console.log(`
  Dry run — nothing changed. Re-run with --apply to do it.
`);
  process.exit(0);
}

// --- Apply ----------------------------------------------------------------
// New price first, archive second: if creation fails the store keeps selling
// at the old price rather than having nothing to sell.

const priceBody = {
  'currency_options[mxn][unit_amount]': String(mxnCents),
  ...(old.tax_behavior && old.tax_behavior !== 'unspecified'
    ? { 'currency_options[mxn][tax_behavior]': old.tax_behavior }
    : {}),
  // Marks the price as one the DEC-26 cron should keep in step with USD/MXN.
  'metadata[fx_sync]': 'true',
};

// An earlier run can have created the price and then failed before archiving
// — the default_price rule below did exactly that. Reuse it instead of
// littering the product with a duplicate on every retry.
const active = await stripe(
  'GET',
  `/prices?product=${old.product}&active=true&limit=100&expand%5B%5D=data.currency_options`
);
let created = active.data.find(
  (p) => p.id !== currentId && p.currency === old.currency && p.unit_amount === usdCents
);
if (created) {
  console.log(`\n  ↻ reusing ${created.id} from an earlier run`);
  if (
    created.currency_options?.mxn?.unit_amount !== mxnCents ||
    created.metadata?.fx_sync !== 'true'
  ) {
    created = await stripe('POST', `/prices/${created.id}`, priceBody);
    console.log('  ✓ refreshed its peso option and fx_sync flag');
  }
} else {
  created = await stripe('POST', '/prices', {
    product: old.product,
    currency: old.currency,
    unit_amount: String(usdCents),
    ...(old.tax_behavior && old.tax_behavior !== 'unspecified'
      ? { tax_behavior: old.tax_behavior }
      : {}),
    ...priceBody,
  });
  console.log(`\n  ✓ created ${created.id}`);
}

// Stripe refuses to archive a product's default_price, so hand the default
// over first. Doing it in this order also means the product never points at
// an archived price, even if the archive call below fails.
await stripe('POST', `/products/${old.product}`, { default_price: created.id });
console.log(`  ✓ product default → ${created.id}`);

await stripe('POST', `/prices/${currentId}`, { active: 'false' });
console.log(`  ✓ archived ${currentId}`);

writeFileSync(
  WRANGLER,
  toml.replace(/^(STRIPE_PRICE_ID\s*=\s*)"[^"]+"/m, `$1"${created.id}"`)
);
console.log(`  ✓ ${relative(ROOT, WRANGLER)}`);

for (const e of edits) {
  writeFileSync(e.file, e.after);
  console.log(`  ✓ ${relative(ROOT, e.file)}`);
}

console.log(`
  Left to do — these can't be done from here:

    1. cd workers/checkout && npx wrangler deploy
    2. review the content diff, then commit + push (Pages deploys on push)
    3. REBUILD THE PAYMENT LINK — settings.json orderUrl still points at a
       link built on the archived price. It is the no-JS / error fallback, so
       it fails quietly. Build a new link on ${created.id}, paste it into
       src/content/site/settings.json, and deactivate the old one:

       curl https://api.stripe.com/v1/payment_links/<old_plink_id> \\
         -u "$STRIPE_SECRET_KEY:" -d active=false
`);
