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

const faq = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/faq' }),
  schema: z.object({
    order: z.number().default(99),
    en: z.object({ question: z.string(), answer: z.string() }),
    es: z.object({ question: z.string(), answer: z.string() }),
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
