import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Every localized field pair lives side by side (en/es) so editors always
// see both languages of one entry together. Keep keystatic.config.ts aligned
// with these schemas — they describe the same files.

const localizedText = z.object({
  title: z.string(),
  body: z.string(),
});

const features = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/features' }),
  schema: z.object({
    order: z.number().default(99),
    // Feature advertised but not yet enabled in firmware — shows a
    // "Coming soon / Próximamente" badge (ui.featureSoon).
    comingSoon: z.boolean().default(false),
    icon: z.enum([
      'temperature',
      'humidity',
      'vibration',
      'light',
      'epaper',
      'alerts',
      'battery',
      'wifi',
    ]),
    en: localizedText,
    es: localizedText,
  }),
});

const faqLocale = z.object({
  question: z.string(),
  answer: z.string(),
  // Optional link rendered after the answer (href in the entry's linkHref).
  linkText: z.string().default(''),
  // Optional tier-comparison block (Basic vs Pro) rendered as side-by-side
  // cards on desktop, stacked on mobile.
  tiers: z
    .array(
      z.object({
        name: z.string(),
        tagline: z.string(),
        items: z.array(z.string()).default([]),
      })
    )
    .default([]),
});

const faq = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/faq' }),
  schema: z.object({
    order: z.number().default(99),
    // Renders a pre-order button (opens the checkout modal) after the answer.
    preorder: z.boolean().default(false),
    // Target for the per-locale linkText, e.g. "#shipping".
    linkHref: z.string().default(''),
    en: faqLocale,
    es: faqLocale,
  }),
});

const plans = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/plans' }),
  schema: z.object({
    order: z.number().default(99),
    featured: z.boolean().default(false),
    // TODO(DEC-17): placeholder pricing — set real figures when decided.
    price: z.string().default('—'),
    priceNote: z.string().optional(),
    en: z.object({
      name: z.string(),
      tagline: z.string(),
      includes: z.array(z.string()).default([]),
      cta: z.string(),
    }),
    es: z.object({
      name: z.string(),
      tagline: z.string(),
      includes: z.array(z.string()).default([]),
      cta: z.string(),
    }),
  }),
});

const localeHome = z.object({
  heroKicker: z.string(),
  heroTitle: z.string(),
  heroSubtitle: z.string(),
  heroCtaPrimary: z.string(),
  heroCtaSecondary: z.string(),
  heroCtaFilm: z.string().default(''),
  // Social-proof line under the hero CTAs; empty = hidden.
  heroTrust: z.string().default(''),
  heroImageAlt: z.string(),
  systemKicker: z.string(),
  systemTitle: z.string(),
  systemIntro: z.string(),
  systemParts: z.array(
    z.object({
      name: z.string(),
      role: z.string(),
      body: z.string(),
      image: z.string().default(''),
      imageAlt: z.string().default(''),
    })
  ),
  explodeKicker: z.string().default(''),
  explodeTitle: z.string().default(''),
  explodeCaption: z.string().default(''),
  // Labels for the exploded-view callouts; anchor geometry lives in
  // ExplodedView.astro keyed by these names.
  explodeCallouts: z
    .object({
      lightSensor: z.string(),
      ambientSensor: z.string(),
      epaperScreen: z.string(),
      battery: z.string(),
      accelerometer: z.string(),
      usbC: z.string(),
      accessoriesPort: z.string(),
    })
    .optional(),
  appKicker: z.string(),
  appTitle: z.string(),
  appIntro: z.string(),
  appScreens: z.array(z.object({ src: z.string(), alt: z.string(), caption: z.string() })),
  featuresKicker: z.string(),
  featuresTitle: z.string(),
  filmKicker: z.string().default(''),
  filmTitle: z.string().default(''),
  filmCaption: z.string().default(''),
  pricingKicker: z.string(),
  pricingTitle: z.string(),
  pricingNote: z.string(),
  shipKicker: z.string().default(''),
  shipTitle: z.string().default(''),
  // Production batches: window ("August – September 2026") per edition.
  // Empty array = section hidden.
  // Footnote under the batch table, linking (e.g.) to the availability FAQ.
  shipNote: z.string().default(''),
  shipNoteHref: z.string().default(''),
  // Plain fine-print line under the table (e.g. the IVA-inclusive notice).
  shipFinePrint: z.string().default(''),
  shipBatches: z
    .array(
      z.object({
        // Semantics per the 2026-07-28 editions update: batch = edition name,
        // window = availability + relative ship order (no dates — none are
        // committed), edition = included Cloud Pro period.
        batch: z.string(),
        window: z.string(),
        edition: z.string(),
        // Deliberate literal figure (2026-07-28: derived/multiplier pricing
        // removed per author — every edition price is hardcoded).
        price: z.string().default(''),
        // Optional link under the availability cell (e.g. Signature waitlist).
        linkText: z.string().default(''),
        linkHref: z.string().default(''),
      })
    )
    .default([]),
  // Wave labels on the Founders card (DEC-27). Which one shows is decided at
  // runtime by the worker's /inventory route; the boundaries themselves live
  // in workers/checkout/wrangler.toml (FOUNDERS_CAP, WAVE_SIZE) — change one
  // and this copy must follow. `remaining` uses {n} as the count placeholder
  // and only appears once a wave is nearly gone.
  waves: z
    .object({
      wave1: z.string().default(''),
      wave2: z.string().default(''),
      signature: z.string().default(''),
      remaining: z.string().default(''),
    })
    .default({}),
  faqKicker: z.string(),
  faqTitle: z.string(),
  contactKicker: z.string(),
  contactTitle: z.string(),
  contactIntro: z.string(),
});

const localeUi = z.object({
  navSystem: z.string(),
  navApp: z.string(),
  navFeatures: z.string(),
  navEdition: z.string(),
  navPricing: z.string(),
  navFaq: z.string(),
  navContact: z.string(),
  formName: z.string(),
  formEmail: z.string(),
  formMessage: z.string(),
  formSend: z.string(),
  formSending: z.string(),
  formSuccess: z.string(),
  formError: z.string(),
  formMailto: z.string(),
  featureSoon: z.string().default(''),
  checkoutLoading: z.string().default(''),
  checkoutError: z.string().default(''),
  checkoutFallback: z.string().default(''),
  thanksTitle: z.string().default(''),
  thanksPaid: z.string().default(''),
  thanksPending: z.string().default(''),
  thanksIncomplete: z.string().default(''),
  thanksRetry: z.string().default(''),
  thanksReceipt: z.string().default(''),
  thanksStatusLabel: z.string().default(''),
  thanksStatusReceived: z.string().default(''),
  thanksStatusShipped: z.string().default(''),
  thanksStatusCanceled: z.string().default(''),
  thanksTrack: z.string().default(''),
  thanksBookmark: z.string().default(''),
  // Founders number + wave on the thanks page (DEC-27). {n} = position.
  thanksWave1: z.string().default(''),
  thanksWave2: z.string().default(''),
  thanksWaveSignature: z.string().default(''),
  footerTagline: z.string(),
  langSwitch: z.string(),
  navPreorder: z.string().default('Pre-order'),
  metaTitle: z.string(),
  metaDescription: z.string(),
});

const site = defineCollection({
  loader: glob({ pattern: 'settings.json', base: './src/content/site' }),
  schema: z.object({
    siteName: z.string(),
    // TODO(DEC-11): notification inbox + form endpoint pending.
    contactEmail: z.string(),
    formEndpoint: z.string(),
    // TODO(DEC-21): Stripe Payment Link fallback; empty = plan CTA scrolls to contact.
    orderUrl: z.string().default(''),
    // TODO(DEC-21): embedded checkout goes live when both are set (worker URL
    // from workers/checkout + pk_… key); empty = fall back to orderUrl.
    checkoutEndpoint: z.string().default(''),
    stripePublishableKey: z.string().default(''),
    // TODO(DEC-18): App Store link pending; empty = onboarding badge inert.
    appStoreUrl: z.string().default(''),
    // TODO(DEC-16): real social URLs pending; empty = link hidden.
    instagram: z.string().default(''),
    x: z.string().default(''),
  }),
});

const home = defineCollection({
  loader: glob({ pattern: 'home.json', base: './src/content/site' }),
  schema: z.object({ en: localeHome, es: localeHome }),
});

const ui = defineCollection({
  loader: glob({ pattern: 'ui.json', base: './src/content/site' }),
  schema: z.object({ en: localeUi, es: localeUi }),
});

export const collections = { features, faq, plans, site, home, ui };
