# Wayfind Visual Release 01

**Status:** final approved appearance specification  
**Scope:** visual presentation, accessibility labels, and social/SEO image metadata for [gowayfind.com](https://www.gowayfind.com).  
**Non-goal:** this release does not change Wayfind ranking, editorial, affiliate, recommendation, or data rules.

## Final visual direction

- Dark navy/near-black surfaces, restrained orange highlights, high-contrast
  ivory typography, and one consistent Wayfind line-icon language.
- A larger Wayfind wordmark in the app header and a premium, compact search
  control. The desktop experience remains intentionally single-column rather
  than adding a second visual rail.
- A richer bottom navigation that remains one unified dock instead of wrapping
  every item in its own pill.
- The first-visit welcome overlay is the product pitch: it tells people that
  Wayfind does the research and returns places worth their time, then asks for
  the feeling they want. It uses a seasonal/evergreen editorial background and
  the transparent Wayfind wordmark + pin.
- The existing "Wayfind, made for right now" visual remains **only** in the
  normal no-results state. Do not add or duplicate it on the populated homepage.
- Map presentation uses the approved Google-key-free MapLibre/OpenFreeMap path.

## Asset system

All Release 01 assets are versioned in `public/brand/` and are served on Vercel
under `/brand/`. The inventory, dimensions, purpose, and accessibility policy
are maintained in [`public/brand/README.md`](../public/brand/README.md).

`INTRO_VISUAL_LIBRARY` in `app/components/sheets/Intro.js` is the only welcome
background selector:

- `evergreen` scenes rotate weekly.
- a `seasonal` scene wins only inside its explicit `startsOn`/`endsOn` window.
- the active 2026 Labor Day scene is `wayfind-welcome-labor-day-south-beach-v2.png`
  (July 22–September 8). It then returns to the evergreen rotation automatically.

## SEO and accessibility safeguards

- Page title, description, canonical URL, JSON-LD, Open Graph title,
  description, and descriptive Open Graph image alt live in `app/layout.js`.
- The no-results neighborhood image has a descriptive alt because it conveys
  place context. Welcome artwork is intentionally decorative and uses empty alt
  text; visible copy supplies the complete pitch without screen-reader noise.
- Every visual control must retain a descriptive `aria-label`/visible text.
  Do not use image filenames as substitute button labels.
- Image filenames are human-readable, location/theme-aware, versioned, and
  stable so Vercel URLs and code references remain durable.

## Vercel handoff / terminal checklist

Vercel deploys this through the Git branch; no image upload or dashboard asset
step is required. Before a future visual update:

1. Place only approved, production-ready assets in `public/brand/` with a clear
   `wayfind-<purpose>-vN.png` name.
2. Update `public/brand/README.md` and this document when an asset is added,
   retired, or its seasonal window changes.
3. If changing the welcome visual rotation, update `INTRO_VISUAL_LIBRARY` only;
   preserve the no-results condition around the discovery module in `app/home.js`.
4. Verify `npm run check:jsx`, `node scripts/test-first-screen.mjs`,
   `node scripts/check-imports.mjs`, and `git diff --check` before merging.
5. After the Vercel deployment, inspect the homepage social metadata and the
   first-visit overlay at a narrow mobile viewport and desktop viewport.

## Change boundaries for future work

Keep this a visual system. Do not alter recommendation ordering, score logic,
affiliate disclosures, search behavior, or data fetch contracts while editing
the Release 01 appearance. Separate functional work into its own PR.
