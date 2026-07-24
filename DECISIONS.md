# Decisions — Tali

The living ledger of choices behind this site. Created by the `content-site`
skill. **OPEN** rows are questions the author deferred — each one has a
default currently in effect and `TODO(DEC-n)` markers at the code sites
(`grep -rn "TODO(DEC-" src/ public/ *.mjs` to find them). To resolve or change
any row, ask Claude to run `/content-site` in this project.

Statuses: **OPEN** (deferred, default in effect) · **DECIDED** ·
**REVISED** (decided, later changed — history kept in Notes).

| ID | Question | Status | Current answer / default in effect | Where it lives | Notes |
| --- | --- | --- | --- | --- | --- |
| DEC-1 | Name & purpose? | DECIDED | Tali — premium IoT guardian (temp/humidity/vibration/light) for wine, cigars & delicate collections; e-paper display + Puk sensors + app | Copy throughout `src/content/` | 2026-07-01: interview |
| DEC-2 | Site type? | DECIDED | Product site — one long page per language | `src/pages/` | 2026-07-01: interview |
| DEC-3 | Copy language? | DECIDED | Bilingual en-US + es-MX, side-by-side fields in every content entry | `src/content/**` (`en`/`es` keys) | 2026-07-01: interview |
| DEC-4 | Which locale at the root URL? | OPEN | English at `/`, Spanish at `/es/` (brief was written in English) | `src/pages/index.astro`, `src/pages/es/index.astro` | Swap the two pages to flip |
| DEC-5 | Domain? | DECIDED | `https://tali.my` | `astro.config.mjs` `site`, `public/CNAME`, `public/robots.txt` | 2026-07-01: interview |
| DEC-6 | Sections? | REVISED | Landing-length: Hero · System · Features · Founder Edition · Contact | `src/components/Landing.astro` | 2026-07-01: was Hero·System·Features·Editions·FAQ·Contact; shortened per author. FAQ content kept unrendered in `src/content/faq/` + `src/components/Faq.astro` |
| DEC-7 | Who edits content? | DECIDED | Keystatic local mode (`npm run dev` → `/keystatic`) | `keystatic.config.ts`, `astro.config.mjs` | 2026-07-01: interview |
| DEC-8 | Brand assets (logo, colors, fonts)? | REVISED | Real logo wordmark + Ô-mark favicon integrated from `~/Desktop/Assets/logo.png`; canvas light & warm; copper accent and Fraunces/Inter/IBM Plex Mono remain my picks | `public/images/tali-logo.png`, `public/favicon.png`, `src/styles/global.css` `:root` | 2026-07-01: dark→light per author. 2026-07-02: logo + favicon from author's assets. 2026-07-02: accent copper→verdigris teal (#2e7573), matched to the app UI and darkened for contrast, per author; fonts still my picks — see TODO(DEC-8) in global.css |
| DEC-9 | Astro major version? | DECIDED | Astro 6.4.x (not 7) — Keystatic 5.1 peer-depends on astro ≤6 | `package.json` | 2026-07-01: revisit when Keystatic supports Astro 7 |
| DEC-10 | Contact form fields? | DECIDED | Name, email, message (+ honeypot) | `src/components/Contact.astro` | Default accepted |
| DEC-11 | Form provider endpoint & notification inbox? | OPEN | `formEndpoint` empty → form falls back to `mailto:hello@tali.my` (unverified placeholder inbox) | `src/content/site/settings.json`, `src/components/Contact.astro`, `src/content.config.ts` | Create a Formspree/Web3Forms form, paste the POST URL, set the real inbox |
| DEC-12 | Newsletter signup? | OPEN | None built | — | Add via `/content-site` if wanted |
| DEC-13 | Deploy target? | DECIDED | GitHub Pages via Actions | `.github/workflows/deploy.yml` | 2026-07-01: interview |
| DEC-14 | Git remote? | DECIDED | `git@github.com:XLabRD/XLB-TALI-WEBSITE.git` (X-Lab org) | `.github/workflows/deploy.yml` | 2026-07-23: initial push to main. Pending owner actions: Pages Source = GitHub Actions, custom domain tali.my + Enforce HTTPS, DNS A records (185.199.108–111.153), org domain verification |
| DEC-15 | Analytics? | OPEN | None (fastest, no consent banner) | — | If wanted: Plausible/Fathom/GoatCounter over GA4 |
| DEC-16 | Social links? | OPEN | Empty values → links hidden in footer | `src/content/site/settings.json`, `src/components/Footer.astro` | |
| DEC-17 | Pricing figures? | OPEN | Placeholder "—" on the Founder Limited Edition | `src/content/plans/founder.json` | Editable in Keystatic → Editions. 2026-07-01: three placeholder editions replaced by single Founder Limited Edition per author. 2026-07-02: pitch deck targets 2,000 MXN (sensor + hub) and 2,400 MXN/yr service — not published pending author confirmation |
| DEC-20 | Founder Edition bundle details (Puk count, numbering, perks)? | OPEN | Placeholder: 1 display + 2 Puks, individually numbered, lifetime priority support | `src/content/plans/founder.json` | Contents are my invention — confirm or edit in Keystatic |
| DEC-18 | App store links? | OPEN | App section with 3 real screenshots, no store badges/links yet | `src/components/AppShowcase.astro`, `public/images/app-*.jpg` | Add badges when the app ships publicly. 2026-07-02: screenshots (IMG_8292–8294) integrated; IMG_8295/8296 (settings, alerts) unused |
| DEC-19 | Product photography? | REVISED | Real prototype photo (rotated/cropped from `IMG_6381.jpeg`) in the hero | `public/images/tali-prototype.jpg`, `src/components/Hero.astro` | 2026-07-02: replaced CSS mock with author's photo. `DeviceMock.astro` kept unused as fallback. 7 product videos (.MOV) exist in `~/Desktop/Assets` — unpublished, would need transcoding for web |
| DEC-21 | Order/checkout service? | OPEN | `settings.orderUrl` empty → plan CTA scrolls to `#contact` | `src/content/site/settings.json`, `src/components/Pricing.astro`, `src/content.config.ts`, `keystatic.config.ts` | 2026-07-23: chose Stripe Payment Link (MXN/OXXO support, static-friendly, no monthly fee) over Shopify/Snipcart/Gumroad; Lemon Squeezy/Paddle ruled out (digital-only MoR). Create the link in Stripe, paste it in Keystatic → Site settings → Order URL |
| DEC-23 | Device-QR onboarding page | DECIDED | Standalone `/hello` page (unlinked, noindex, sitemap-excluded): Hello! + app download + Get help mailto | `src/pages/hello.astro`, `astro.config.mjs`, `settings.appStoreUrl` | 2026-07-24: QR on device screens points to https://tali.my/hello. iOS-only for now; App Store badge inert until `appStoreUrl` set (DEC-18). English-only — add locale detection if needed |
| DEC-22 | Scroll-driven 3D exploded view | DECIDED | Pre-rendered 80-frame WebP scrub (Blender/EEVEE from `~/Desktop/Assets/3D/Tali v13.fbx`) on a canvas; no runtime 3D | `src/components/ExplodedView.astro`, `public/images/explode/tali/`, scratchpad `explode_render.py` + `draw_ui.py` | 2026-07-23: image sequence chosen over Three.js (643k-tri model, zero JS deps, reliable). Reduced-motion/no-JS fall back to static exploded still. Puk model pending — rerun pipeline when its FBX arrives. Render scripts in `scripts/3d/`. 7 feature callouts (HTML overlay, labels in `home.explodeCallouts`, anchors in component) fade in at full explosion; anchor coords are tied to frame_079 — re-check after any re-render |

<!--
Row conventions:
- IDs are permanent and never reused.
- When resolving: apply the change, remove the TODO(DEC-n) markers, set
  Status to DECIDED, replace the default with the real answer, and add a
  dated note, e.g. "2026-07-01: chose Cloudflare Pages over GH Pages (perf)".
- When changing an earlier decision: Status → REVISED, keep the old answer
  in Notes.
- New questions discovered mid-build get appended here immediately, even if
  answered on the spot (Status DECIDED) — the ledger is also the rationale
  record.
-->

## Future plans (not built, structure may anticipate them)

- Companion app pages (features, store links) — nav and content model can take a second page per locale without restructuring.
- Real product photography replacing the CSS device mock (DEC-19).
