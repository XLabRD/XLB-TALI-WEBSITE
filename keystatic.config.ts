// Keystatic admin config — mirrors the Zod schemas in src/content.config.ts.
// If you change a field here, change it there too (and vice versa).
import { config, collection, singleton, fields } from '@keystatic/core';

const localized = (label: string) =>
  fields.object(
    {
      title: fields.text({ label: 'Title' }),
      body: fields.text({ label: 'Body', multiline: true }),
    },
    { label }
  );

const qa = (label: string) =>
  fields.object(
    {
      question: fields.text({ label: 'Question' }),
      answer: fields.text({ label: 'Answer', multiline: true }),
      linkText: fields.text({
        label: 'Link text (optional)',
        description: 'Shown after the answer; target set in "Link target".',
        defaultValue: '',
      }),
      tiers: fields.array(
        fields.object({
          name: fields.text({ label: 'Tier name' }),
          tagline: fields.text({ label: 'Tagline' }),
          items: fields.array(fields.text({ label: 'Item' }), {
            label: 'Items',
            itemLabel: (props) => props.value ?? 'Item',
          }),
        }),
        {
          label: 'Tier comparison (optional)',
          itemLabel: (props) => props.fields.name.value ?? 'Tier',
        }
      ),
    },
    { label }
  );

const planLocale = (label: string) =>
  fields.object(
    {
      name: fields.text({ label: 'Name' }),
      tagline: fields.text({ label: 'Tagline' }),
      includes: fields.array(fields.text({ label: 'Item' }), {
        label: 'Includes',
        itemLabel: (props) => props.value ?? 'Item',
      }),
      cta: fields.text({ label: 'Button label' }),
      priceNote: fields.text({ label: 'Fine print under the button' }),
    },
    { label }
  );

const homeLocale = (label: string) =>
  fields.object(
    {
      heroKicker: fields.text({ label: 'Hero kicker' }),
      heroTitle: fields.text({ label: 'Hero title' }),
      heroSubtitle: fields.text({ label: 'Hero subtitle', multiline: true }),
      heroCtaPrimary: fields.text({ label: 'Hero primary button' }),
      heroCtaSecondary: fields.text({ label: 'Hero secondary button' }),
      heroCtaFilm: fields.text({
        label: 'Hero film link',
        description: 'Label of the "Watch the film" link. Empty = link hidden.',
        defaultValue: '',
      }),
      heroTrust: fields.text({
        label: 'Hero trust line',
        description: 'Social-proof sentence under the hero buttons. Empty = hidden.',
        defaultValue: '',
      }),
      heroImageAlt: fields.text({ label: 'Hero image alt text' }),
      systemKicker: fields.text({ label: 'System kicker' }),
      systemTitle: fields.text({ label: 'System title' }),
      systemIntro: fields.text({ label: 'System intro', multiline: true }),
      systemParts: fields.array(
        fields.object({
          name: fields.text({ label: 'Name' }),
          role: fields.text({ label: 'Role' }),
          body: fields.text({ label: 'Body', multiline: true }),
          image: fields.text({ label: 'Image path (in public/)', defaultValue: '' }),
          imageAlt: fields.text({ label: 'Image alt text', defaultValue: '' }),
        }),
        { label: 'System parts', itemLabel: (props) => props.fields.name.value ?? 'Part' }
      ),
      explodeKicker: fields.text({ label: 'Exploded view kicker' }),
      explodeTitle: fields.text({ label: 'Exploded view title' }),
      explodeCaption: fields.text({ label: 'Exploded view caption', multiline: true }),
      explodeCallouts: fields.object(
        {
          lightSensor: fields.text({ label: 'Light sensor' }),
          ambientSensor: fields.text({ label: 'Ambient sensor' }),
          epaperScreen: fields.text({ label: 'e-Paper screen' }),
          battery: fields.text({ label: 'Battery' }),
          accelerometer: fields.text({ label: 'Accelerometer' }),
          usbC: fields.text({ label: 'USB-C' }),
          accessoriesPort: fields.text({ label: 'Accessories port' }),
        },
        { label: 'Exploded view callout labels' }
      ),
      appKicker: fields.text({ label: 'App kicker' }),
      appTitle: fields.text({ label: 'App title' }),
      appIntro: fields.text({ label: 'App intro', multiline: true }),
      appScreens: fields.array(
        fields.object({
          src: fields.text({ label: 'Image path (in public/)' }),
          alt: fields.text({ label: 'Alt text' }),
          caption: fields.text({ label: 'Caption' }),
        }),
        { label: 'App screenshots', itemLabel: (props) => props.fields.caption.value ?? 'Screen' }
      ),
      featuresKicker: fields.text({ label: 'Features kicker' }),
      featuresTitle: fields.text({ label: 'Features title' }),
      filmKicker: fields.text({ label: 'Film kicker', defaultValue: '' }),
      filmTitle: fields.text({ label: 'Film title', defaultValue: '' }),
      filmCaption: fields.text({ label: 'Film caption', multiline: true, defaultValue: '' }),
      pricingKicker: fields.text({ label: 'Pricing kicker' }),
      pricingTitle: fields.text({ label: 'Pricing title' }),
      pricingNote: fields.text({ label: 'Pricing note', multiline: true }),
      shipKicker: fields.text({ label: 'Shipping kicker', defaultValue: '' }),
      shipTitle: fields.text({ label: 'Shipping title', defaultValue: '' }),
      shipNote: fields.text({
        label: 'Shipping footnote text',
        description: 'Shown under the batch table as a link (target below). Empty = hidden.',
        defaultValue: '',
      }),
      shipNoteHref: fields.text({
        label: 'Shipping footnote target',
        description: 'e.g. #faq-where-available',
        defaultValue: '',
      }),
      shipFinePrint: fields.text({
        label: 'Shipping fine print',
        description: 'Plain line under the table, e.g. the IVA-inclusive notice.',
        defaultValue: '',
      }),
      shipBatches: fields.array(
        fields.object({
          batch: fields.text({ label: 'Batch name' }),
          window: fields.text({ label: 'Ship window' }),
          edition: fields.text({ label: 'Edition' }),
          price: fields.text({ label: 'Price', defaultValue: '' }),
          linkText: fields.text({ label: 'Link text (optional)', defaultValue: '' }),
          linkHref: fields.text({ label: 'Link target', defaultValue: '' }),
        }),
        { label: 'Editions (rows)', itemLabel: (props) => props.fields.batch.value ?? 'Edition' }
      ),
      // Founders wave labels on the pricing card (DEC-27). Which one shows is
      // decided live by the checkout worker; boundaries live in
      // workers/checkout/wrangler.toml, so edit these together.
      waves: fields.object(
        {
          wave1: fields.text({ label: 'Wave 1 label', defaultValue: '' }),
          wave2: fields.text({ label: 'Wave 2 label', defaultValue: '' }),
          signature: fields.text({ label: 'Signature label', defaultValue: '' }),
          remaining: fields.text({
            label: 'Low-stock countdown ({n} = units left)',
            defaultValue: '',
          }),
        },
        { label: 'Wave labels' }
      ),
      faqKicker: fields.text({ label: 'FAQ kicker' }),
      faqTitle: fields.text({ label: 'FAQ title' }),
      contactKicker: fields.text({ label: 'Contact kicker' }),
      contactTitle: fields.text({ label: 'Contact title' }),
      contactIntro: fields.text({ label: 'Contact intro', multiline: true }),
    },
    { label }
  );

const uiLocale = (label: string) =>
  fields.object(
    {
      navSystem: fields.text({ label: 'Nav: system' }),
      navApp: fields.text({ label: 'Nav: app' }),
      navFeatures: fields.text({ label: 'Nav: features' }),
      navEdition: fields.text({ label: 'Nav: Founders Edition card' }),
      navPricing: fields.text({ label: 'Nav: editions + pricing table' }),
      navFaq: fields.text({ label: 'Nav: FAQ' }),
      navContact: fields.text({ label: 'Nav: contact' }),
      formName: fields.text({ label: 'Form: name label' }),
      formEmail: fields.text({ label: 'Form: email label' }),
      formMessage: fields.text({ label: 'Form: message label' }),
      formSend: fields.text({ label: 'Form: send button' }),
      formSending: fields.text({ label: 'Form: sending state' }),
      formSuccess: fields.text({ label: 'Form: success message' }),
      formError: fields.text({ label: 'Form: error message' }),
      formMailto: fields.text({ label: 'Form: mailto link label' }),
      featureSoon: fields.text({ label: 'Features: coming-soon badge', defaultValue: '' }),
      checkoutLoading: fields.text({ label: 'Checkout: loading state', defaultValue: '' }),
      checkoutError: fields.text({ label: 'Checkout: error message', defaultValue: '' }),
      checkoutFallback: fields.text({ label: 'Checkout: fallback link label', defaultValue: '' }),
      thanksTitle: fields.text({ label: 'Thanks page: title', defaultValue: '' }),
      thanksPaid: fields.text({ label: 'Thanks page: paid message', defaultValue: '' }),
      thanksPending: fields.text({ label: 'Thanks page: voucher-pending message', defaultValue: '' }),
      thanksIncomplete: fields.text({ label: 'Thanks page: incomplete message', defaultValue: '' }),
      thanksRetry: fields.text({ label: 'Thanks page: retry link label', defaultValue: '' }),
      thanksReceipt: fields.text({ label: 'Thanks page: receipt link label', defaultValue: '' }),
      thanksStatusLabel: fields.text({ label: 'Thanks page: order status label', defaultValue: '' }),
      thanksStatusReceived: fields.text({ label: 'Thanks page: status "received"', defaultValue: '' }),
      thanksStatusShipped: fields.text({ label: 'Thanks page: status "shipped"', defaultValue: '' }),
      thanksStatusCanceled: fields.text({ label: 'Thanks page: status "canceled"', defaultValue: '' }),
      thanksTrack: fields.text({ label: 'Thanks page: tracking link label', defaultValue: '' }),
      thanksBookmark: fields.text({ label: 'Thanks page: bookmark hint', defaultValue: '' }),
      // {n} is replaced with the buyer's Founders number (DEC-27).
      thanksWave1: fields.text({ label: 'Thanks page: Wave 1 line ({n} = number)', defaultValue: '' }),
      thanksWave2: fields.text({ label: 'Thanks page: Wave 2 line ({n} = number)', defaultValue: '' }),
      thanksWaveSignature: fields.text({
        label: 'Thanks page: Signature line ({n} = number)',
        defaultValue: '',
      }),
      footerTagline: fields.text({ label: 'Footer tagline' }),
      langSwitch: fields.text({ label: 'Language switch label' }),
      navPreorder: fields.text({ label: 'Nav: buy button' }),
      trackTitle: fields.text({ label: 'Track: headline (out for delivery)' }),
      trackSubtitle: fields.text({ label: 'Track: sub-headline' }),
      trackDelivery: fields.text({
        label: 'Track: delivery promise',
        description: 'Sits under the sub-headline. The 6pm window lives here.',
        multiline: true,
      }),
      trackTitlePreparing: fields.text({ label: 'Track: title (not dispatched yet)' }),
      trackTitleCanceled: fields.text({ label: 'Track: title (canceled)' }),
      trackNoNumber: fields.text({
        label: 'Track: why there is no tracking number',
        multiline: true,
      }),
      trackPreparing: fields.text({ label: 'Track: order not dispatched yet' }),
      trackCanceled: fields.text({
        label: 'Track: canceled order',
        description: '{email} is replaced with the contact email.',
      }),
      trackOrderLabel: fields.text({ label: 'Track: order-number label' }),
      trackAddressLabel: fields.text({ label: 'Track: address label' }),
      trackUnit: fields.text({
        label: 'Track: unit line',
        description: '{series} is Founders or Signature, {n} the unit number.',
      }),
      trackHelp: fields.text({
        label: 'Track: what to do if it never arrives',
        description: '{email} is replaced with the contact email.',
      }),
      metaTitle: fields.text({ label: 'Meta title' }),
      metaDescription: fields.text({ label: 'Meta description', multiline: true }),
    },
    { label }
  );

export default config({
  storage: { kind: 'local' },
  ui: { brand: { name: 'Tali' } },
  singletons: {
    settings: singleton({
      label: 'Site settings',
      path: 'src/content/site/settings',
      format: { data: 'json' },
      schema: {
        siteName: fields.text({ label: 'Site name' }),
        contactEmail: fields.text({ label: 'Contact email (TODO DEC-11)' }),
        formEndpoint: fields.text({
          label: 'Form endpoint (TODO DEC-11)',
          description: 'Web3Forms access key (recommended — enables hCaptcha) or a Formspree-style POST URL. Empty = form falls back to mailto.',
        }),
        orderUrl: fields.text({
          label: 'Order URL (TODO DEC-21)',
          description:
            'Stripe Payment Link for the Founder edition — the fallback when embedded checkout is not configured. Empty = "Buy now" scrolls to the contact form.',
        }),
        checkoutEndpoint: fields.text({
          label: 'Checkout endpoint (TODO DEC-21)',
          description:
            'URL of the deployed checkout worker (workers/checkout), e.g. https://tali-checkout.<account>.workers.dev. Empty = fall back to the Order URL.',
        }),
        stripePublishableKey: fields.text({
          label: 'Stripe publishable key (TODO DEC-21)',
          description:
            'pk_test_… or pk_live_… key matching the worker’s secret key. Required together with the checkout endpoint.',
        }),
        appStoreUrl: fields.text({
          label: 'App Store URL (TODO DEC-18)',
          description: 'iOS app link for the /hello onboarding page — App Store or TestFlight. When set, iOS visitors are redirected to it automatically.',
        }),
        instagram: fields.text({ label: 'Instagram URL (TODO DEC-16)' }),
        x: fields.text({ label: 'X URL (TODO DEC-16)' }),
      },
    }),
    home: singleton({
      label: 'Home page copy',
      path: 'src/content/site/home',
      format: { data: 'json' },
      schema: {
        en: homeLocale('English'),
        es: homeLocale('Español'),
      },
    }),
    ui: singleton({
      label: 'UI strings',
      path: 'src/content/site/ui',
      format: { data: 'json' },
      schema: {
        en: uiLocale('English'),
        es: uiLocale('Español'),
      },
    }),
  },
  collections: {
    features: collection({
      label: 'Features',
      path: 'src/content/features/*',
      format: { data: 'json' },
      slugField: 'slug',
      schema: {
        slug: fields.slug({ name: { label: 'Slug' } }),
        order: fields.number({ label: 'Order', defaultValue: 99 }),
        comingSoon: fields.checkbox({
          label: 'Coming soon',
          description: 'Shows a "Coming soon / Próximamente" badge on the card.',
          defaultValue: false,
        }),
        icon: fields.select({
          label: 'Icon',
          options: [
            { label: 'Temperature', value: 'temperature' },
            { label: 'Humidity', value: 'humidity' },
            { label: 'Vibration', value: 'vibration' },
            { label: 'Light', value: 'light' },
            { label: 'E-paper', value: 'epaper' },
            { label: 'Alerts', value: 'alerts' },
            { label: 'Battery', value: 'battery' },
            { label: 'Wi-Fi', value: 'wifi' },
          ],
          defaultValue: 'temperature',
        }),
        en: localized('English'),
        es: localized('Español'),
      },
    }),
    faq: collection({
      label: 'FAQ',
      path: 'src/content/faq/*',
      format: { data: 'json' },
      slugField: 'slug',
      schema: {
        slug: fields.slug({ name: { label: 'Slug' } }),
        order: fields.number({ label: 'Order', defaultValue: 99 }),
        preorder: fields.checkbox({
          label: 'Buy button',
          description: 'Show a buy button (opens checkout) after the answer.',
          defaultValue: false,
        }),
        linkHref: fields.text({
          label: 'Link target',
          description: 'e.g. #shipping — used with the per-language link text.',
          defaultValue: '',
        }),
        en: qa('English'),
        es: qa('Español'),
      },
    }),
    plans: collection({
      label: 'Editions (pricing)',
      path: 'src/content/plans/*',
      format: { data: 'json' },
      slugField: 'slug',
      schema: {
        slug: fields.slug({ name: { label: 'Slug' } }),
        order: fields.number({ label: 'Order', defaultValue: 99 }),
        featured: fields.checkbox({ label: 'Featured', defaultValue: false }),
        price: fields.text({ label: 'Price (TODO DEC-17)', defaultValue: '—' }),
        en: planLocale('English'),
        es: planLocale('Español'),
      },
    }),
  },
});
