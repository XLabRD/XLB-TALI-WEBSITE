import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import react from '@astrojs/react';
import keystatic from '@keystatic/astro';
import sitemap from '@astrojs/sitemap';

// The Keystatic admin needs SSR, so it only exists when KEYSTATIC=true
// (npm run dev / build:cms). The public build stays 100% static.
const CMS = process.env.KEYSTATIC === 'true';

export default defineConfig({
  site: 'https://tali.my',
  output: 'static',
  integrations: [
    sitemap({
      i18n: {
        defaultLocale: 'en',
        locales: { en: 'en-US', es: 'es-MX' },
      },
    }),
    ...(CMS ? [react(), keystatic()] : []),
  ],
  adapter: CMS ? node({ mode: 'standalone' }) : undefined,
  build: { inlineStylesheets: 'always' },
});
