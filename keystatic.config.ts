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
      pricingKicker: fields.text({ label: 'Pricing kicker' }),
      pricingTitle: fields.text({ label: 'Pricing title' }),
      pricingNote: fields.text({ label: 'Pricing note', multiline: true }),
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
      navPricing: fields.text({ label: 'Nav: editions' }),
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
      footerTagline: fields.text({ label: 'Footer tagline' }),
      langSwitch: fields.text({ label: 'Language switch label' }),
      navPreorder: fields.text({ label: 'Nav: pre-order button' }),
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
            'Stripe Payment Link for the Founder edition. Empty = "Pre-order now" scrolls to the contact form.',
        }),
        appStoreUrl: fields.text({
          label: 'App Store URL (TODO DEC-18)',
          description: 'iOS App Store link for the /hello onboarding page. When set, iOS visitors are redirected to it automatically.',
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
        priceNote: fields.text({ label: 'Price note' }),
        en: planLocale('English'),
        es: planLocale('Español'),
      },
    }),
  },
});
