// Daily USD→MXN price sync (DEC-26).
//
// Why this exists: the Founder price is a USD Price object carrying an MXN
// `currency_options` entry, because Mexican-issued cards decline foreign-
// currency authorizations (`currency_not_supported`) and OXXO is MXN-only.
// Stripe will not convert that entry for us — Adaptive Pricing requires the
// price currency to be a settlement currency, and Mexico has no multi-currency
// settlement (MXN is the account's only one). So the peso figure is a second,
// manually-set price, and without this cron it silently drifts from the dollar
// price as the exchange rate moves.
//
// Runs once a day from the scheduled() handler in worker.js. Everything here
// is deliberately paranoid: it writes to a LIVE price, so a bad rate must fail
// closed rather than mispublish. See syncMxnPrice() for the guard chain.

// Plausible USD/MXN band. Anything outside it is a broken feed, not a market
// move — the peso has not been near either edge in decades. A feed returning
// 0, 1, or null therefore can never reach Stripe.
const RATE_MIN = 10;
const RATE_MAX = 30;

// Largest single-day move we will publish unattended. Real USD/MXN daily moves
// are well under 2%; 8% means the feed is wrong or something historic happened,
// and either way a human should look before the price changes.
const MAX_DAILY_MOVE_PCT = 8;

// Absolute floor on the published peso amount, in centavos. Belt-and-braces
// against a arithmetic slip publishing a near-free product.
const MIN_MXN_CENTAVOS = 50_000; // $500.00 MXN

/**
 * Free, keyless FX sources, tried in order. Frankfurter serves ECB reference
 * rates (published ~16:00 CET on business days; weekends return Friday's rate,
 * which is fine for a daily sync). open.er-api.com is the fallback so one
 * hobby-scale endpoint going dark doesn't freeze the price.
 */
const SOURCES = [
  {
    name: 'frankfurter',
    url: 'https://api.frankfurter.app/latest?from=USD&to=MXN',
    pick: (d) => d?.rates?.MXN,
  },
  {
    name: 'er-api',
    url: 'https://open.er-api.com/v6/latest/USD',
    pick: (d) => d?.rates?.MXN,
  },
];

// Exported so scripts/set-price.mjs prices a NEW peso amount from the same
// sources and the same plausibility guards the cron uses — one rounding rule,
// not two that drift apart.
export async function fetchRate() {
  const errors = [];
  for (const src of SOURCES) {
    try {
      const res = await fetch(src.url, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rate = Number(src.pick(await res.json()));
      if (!Number.isFinite(rate) || rate < RATE_MIN || rate > RATE_MAX) {
        throw new Error(`implausible rate ${rate}`);
      }
      return { rate, source: src.name };
    } catch (err) {
      errors.push(`${src.name}: ${err.message}`);
    }
  }
  throw new Error(`no usable FX rate — ${errors.join('; ')}`);
}

/**
 * Convert a USD amount (in cents) to a clean peso figure (in centavos).
 *
 * The buffer absorbs the drift between daily syncs plus the spread a card
 * network applies, so a peso order never settles below its dollar equivalent
 * between runs. Rounding then goes UP to the next 50 pesos and shaves 1 peso,
 * landing on premium-looking x49 / x99 endings that never round below the
 * buffered figure.
 */
export function pesoAmount(usdCents, rate, bufferPct) {
  const raw = (usdCents / 100) * rate * (1 + bufferPct / 100);
  const rounded = Math.ceil(raw / 50) * 50 - 1;
  return Math.round(rounded * 100);
}

/**
 * Read the live price, compute today's peso figure, and write it back only if
 * every guard passes. Returns a result object for logging; throws only when
 * the operator genuinely needs to know (no rate, Stripe rejected the write).
 */
export async function syncMxnPrice(env, stripeRequest) {
  const bufferPct = Number(env.FX_BUFFER_PCT ?? 3);
  const { rate, source } = await fetchRate();

  // currency_options is expandable — without expand[] the current MXN figure
  // comes back undefined and every run would look like a first-time write.
  const price = await stripeRequest(
    env,
    'GET',
    `/prices/${env.STRIPE_PRICE_ID}?expand[]=currency_options`
  );
  if (price.currency !== 'usd') {
    // The base currency is the thing being converted FROM. If someone repoints
    // STRIPE_PRICE_ID at a peso price, converting USD→MXN is meaningless.
    return { skipped: `base currency is ${price.currency}, not usd`, rate, source };
  }

  const current = price.currency_options?.mxn?.unit_amount ?? null;
  const next = pesoAmount(price.unit_amount, rate, bufferPct);

  if (next < MIN_MXN_CENTAVOS) {
    throw new Error(`computed ${next} centavos is below the ${MIN_MXN_CENTAVOS} floor`);
  }
  if (current === next) {
    return { unchanged: true, rate, source, amount: next };
  }
  if (current) {
    const movePct = Math.abs((next - current) / current) * 100;
    if (movePct > MAX_DAILY_MOVE_PCT) {
      // Fail closed: leave the price alone and let the alert wake someone.
      return {
        blocked: `move of ${movePct.toFixed(1)}% exceeds the ${MAX_DAILY_MOVE_PCT}% daily cap`,
        rate,
        source,
        current,
        proposed: next,
      };
    }
  }

  const params = new URLSearchParams({
    'currency_options[mxn][unit_amount]': String(next),
  });
  // tax_behavior must match the base price's, or Checkout can't localize a
  // Session that uses tax-inclusive pricing (DEC-17: IVA included).
  if (price.tax_behavior && price.tax_behavior !== 'unspecified') {
    params.set('currency_options[mxn][tax_behavior]', price.tax_behavior);
  }
  await stripeRequest(env, 'POST', `/prices/${env.STRIPE_PRICE_ID}`, params);

  return { updated: true, rate, source, from: current, to: next, bufferPct };
}
