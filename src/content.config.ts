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
    // Renders a buy button (opens the checkout modal) after the answer.
    preorder: z.boolean().default(false),
    // Target for the per-locale linkText, e.g. "#shipping".
    linkHref: z.string().default(''),
    en: faqLocale,
    es: faqLocale,
  }),
});

// Support articles (DEC-34) — one page per article at /support/<slug>/.
// Unlike every other collection here, the two languages live in separate
// *files* rather than side by side in one: the body is markdown, and a
// markdown file has exactly one body. The slug is what pairs them —
// `en/pair-a-puk.md` and `es/pair-a-puk.md` are the same article, which is
// how the language switcher lands on the matching page instead of the index.
// An article with no counterpart simply doesn't exist in that language.
const support = defineCollection({
  loader: glob({ pattern: '*/*.md', base: './src/content/support' }),
  schema: z.object({
    title: z.string(),
    // One or two sentences, shown on the index card. This is what a reader
    // decides on, so it should answer the question in outline, not tease it.
    summary: z.string(),
    // Which tab of /support/ the article belongs to.
    section: z.enum(['start', 'fix']),
    // Grouping within the troubleshooting tab; 'setup' is the getting-started
    // walkthrough, which is ordered rather than grouped.
    category: z.enum(['setup', 'device', 'puk', 'app', 'order']),
    order: z.number().default(99),
    // Optional media above the body. A video wins if both are set; the still
    // becomes its poster frame, so filling in both is the good case.
    image: z.string().default(''),
    imageAlt: z.string().default(''),
    video: z.string().default(''),
    // Optional link under the body, into the landing FAQ ('#faq-…', which the
    // locale prefix is added to) or anywhere else.
    linkHref: z.string().default(''),
    linkText: z.string().default(''),
  }),
});

const plans = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/plans' }),
  schema: z.object({
    order: z.number().default(99),
    featured: z.boolean().default(false),
    // TODO(DEC-17): placeholder pricing — set real figures when decided.
    price: z.string().default('—'),
    en: z.object({
      name: z.string(),
      tagline: z.string(),
      includes: z.array(z.string()).default([]),
      cta: z.string(),
      // Fine print under the buy button. Per-locale: it used to be one
      // shared field holding Spanish, which the bilingual rule forbids.
      priceNote: z.string().default(''),
    }),
    es: z.object({
      name: z.string(),
      tagline: z.string(),
      includes: z.array(z.string()).default([]),
      cta: z.string(),
      priceNote: z.string().default(''),
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
  systemLinkAlt: z.string().default(''),
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
  navSupport: z.string().default('Support'),
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
  navPreorder: z.string().default('Buy now'),
  // Local same-day delivery page (DEC-30) — /track/ + /es/track/.
  trackTitle: z.string().default('GREAT NEWS!'),
  trackSubtitle: z.string().default('Your order is out for delivery'),
  trackDelivery: z
    .string()
    .default(
      'We will be hand delivering this order specially to you today (or tomorrow) before 6pm.'
    ),
  trackTitlePreparing: z.string().default('Preparing your order'),
  trackTitleCanceled: z.string().default('Order canceled'),
  // Renders below the order details, at the foot of the page.
  trackNoNumber: z
    .string()
    .default(
      'Since this is a local delivery there is no tracking number — this is a same-day, special, ultra VIP hand delivery for you.'
    ),
  trackPreparing: z
    .string()
    .default("We're preparing your order. You'll get an email the moment it's on its way."),
  trackCanceled: z
    .string()
    .default('This order was canceled. Write to us at {email} if that\'s unexpected.'),
  trackOrderLabel: z.string().default('Order'),
  trackAddressLabel: z.string().default('Delivering to'),
  trackUnit: z.string().default('{series} #{n}'),
  trackHelp: z
    .string()
    .default(
      "Not there by the end of the day, or have any questions? Write to us at {email} and we'll chase it."
    ),
  metaTitle: z.string(),
  metaDescription: z.string(),
});

const localeSupport = z.object({
  metaTitle: z.string(),
  metaDescription: z.string(),
  kicker: z.string(),
  title: z.string(),
  intro: z.string(),
  tabStart: z.string(),
  tabFix: z.string(),
  tabContact: z.string(),
  startTitle: z.string(),
  startIntro: z.string(),
  startNote: z.string().default(''),
  // Closes the walkthrough with a route to a person; renders with a button
  // to the contact tab. Empty hides the whole block.
  startHelp: z.string().default(''),
  stepLabel: z.string().default('Step'),
  fixTitle: z.string(),
  fixIntro: z.string(),
  // Group headings in the troubleshooting index, keyed by the article
  // `category`. Keep these in step with the enum above.
  catDevice: z.string(),
  catPuk: z.string(),
  catApp: z.string(),
  catOrder: z.string(),
  readMore: z.string().default(''),
  contactTitle: z.string(),
  contactIntro: z.string(),
  contactNote: z.string().default(''),
  // Announced on the support page only, and per locale — the site-wide
  // contactEmail in settings.json stays hello@tali.my, which is also where
  // the form posts. Empty falls back to that address.
  supportEmail: z.string().default(''),
  whatsappLabel: z.string().default(''),
  whatsappNote: z.string().default(''),
  backToSupport: z.string(),
  onThisPage: z.string().default(''),
  relatedTitle: z.string().default(''),
  articleHelpTitle: z.string().default(''),
  articleHelpText: z.string().default(''),
  articleHelpCta: z.string().default(''),
  updatedLabel: z.string().default(''),
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
    // TODO(DEC-18): store links for /hello; empty = that platform's badge inert.
    appStoreUrl: z.string().default(''),
    playStoreUrl: z.string().default(''),
    // Support WhatsApp (DEC-34). Stored as written for display; the wa.me
    // link strips everything but the digits. Rendered on the support page
    // only — empty hides the button.
    whatsapp: z.string().default(''),
    // TODO(DEC-16): real social URLs pending; empty = link hidden.
    instagram: z.string().default(''),
    x: z.string().default(''),
  }),
});

const home = defineCollection({
  loader: glob({ pattern: 'home.json', base: './src/content/site' }),
  schema: z.object({ en: localeHome, es: localeHome }),
});

const supportPage = defineCollection({
  loader: glob({ pattern: 'support.json', base: './src/content/site' }),
  schema: z.object({ en: localeSupport, es: localeSupport }),
});

const ui = defineCollection({
  loader: glob({ pattern: 'ui.json', base: './src/content/site' }),
  schema: z.object({ en: localeUi, es: localeUi }),
});

export const collections = { features, faq, plans, support, site, home, supportPage, ui };
