# Tali — tali.my

The product site for **Tali**, the quiet guardian for wine, cigars and other
delicate collections: an e-paper display, Puk wireless sensors, and an app,
monitoring temperature, humidity, vibration and light.

Bilingual: English at `/`, Spanish at `/es/`. Fully static — no servers.

## Working on the site

```bash
npm install
npm run dev        # http://localhost:4321  (+ CMS at /keystatic)
npm run build      # static production build → dist/
npm run preview    # serve the built site locally
```

Content is edited either in the **Keystatic admin** (`/keystatic` while the
dev server runs) or directly in the JSON files under `src/content/`. Every
entry carries both languages side by side.

## Pending decisions

Open choices (form endpoint, pricing, brand assets, …) live in
[`DECISIONS.md`](./DECISIONS.md) with the defaults currently in effect.
Run `/content-site` with Claude Code in this folder to resolve them.

## Deploy

Pushing to `main` on GitHub (once a remote is set up and Pages is enabled
with Source = GitHub Actions) builds and deploys automatically via
`.github/workflows/deploy.yml`. The custom domain `tali.my` is set in
`public/CNAME`.
