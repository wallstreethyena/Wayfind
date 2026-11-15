# Wayfind brand assets

The official Wayfind logos live in **`public/brand/wayfind/`**. The source of truth
is **`public/brand/wayfind/manifest.json`**: one row per file with its size,
transparency, background, checksum, source and notes. Read it before making
anything Wayfind-branded (site, social graphics, carousels, Reels, ads, partner
materials, emails, PDFs, decks, app and App Store assets, video).

Every file here was supplied by Gabriel on 2026-11-12 and is stored exactly as
received. Use them as they are: do not redraw, approximate, recolor, stretch or
regenerate the logo when one of these fits. On the web, reference the file by
its public path (`/brand/wayfind/...`) instead of copying it.

## The logos

| Use | File | Notes |
| --- | --- | --- |
| Logo on dark backgrounds, gradient pin | `public/brand/wayfind/logo/wayfind-logo-gradient-on-black.jpg` | 842x270, black background is part of the file. |
| Logo with tagline on dark backgrounds, orange pin | `public/brand/wayfind/logo/wayfind-logo-tagline-on-black.jpg` | 1320x382, black background is part of the file. |
| Logo on dark backgrounds, transparent | `public/brand/wayfind/logo/wayfind-logo-white-orange-transparent-a.png` | 2172x724, white lettering, orange pin. |
| Logo with tagline on dark backgrounds, transparent | `public/brand/wayfind/logo/wayfind-logo-tagline-white-orange-transparent.png` | 2170x725. Soft, uneven transparency: check it on the actual background. |
| Logo with tagline on light backgrounds, transparent | `public/brand/wayfind/logo/wayfind-logo-tagline-black-transparent.png` | 2170x725, black lettering. The dot and pin are near-white and vanish on white. |

## The mark (avatar and icon)

| Use | File | Notes |
| --- | --- | --- |
| Pin mark alone, square | `public/brand/wayfind/marks/wayfind-mark-gradient-on-black.png` | 1254x1254 on black. Suits avatars and app-style icons. |

## Reference only

| File | Notes |
| --- | --- |
| `public/brand/wayfind/social/wayfind-reel-endcard-reference.png` | A Reel end card layout. Its headline and button are campaign-specific, so it is a reference, not a reusable asset (`approved_for_production: false`). |

## Light or dark

- **Dark backgrounds:** the two `on-black` JPEGs, `wayfind-logo-white-orange-transparent-a.png`, `wayfind-logo-tagline-white-orange-transparent.png`, and the gradient mark.
- **Light backgrounds:** `wayfind-logo-tagline-black-transparent.png`, keeping in mind its near-white pin.

## Adding a new official asset

1. Put the file in `public/brand/wayfind/<logo|marks|social>/` exactly as supplied.
2. Add its row to `manifest.json` (run `node scripts/check-brand-vault.mjs` to confirm the size and sha256).
3. A resized or optimized copy is a derivative: store it separately with
   `"original": false` and `"derivative_of": "<id>"`. Never overwrite a master.

Older marks (the SVG wordmarks, the app icon, the header crops) are listed in
`public/brand/README.md`. This guide records files, not brand standards; nothing
here sets colors, spacing or rules Gabriel has not approved.

`scripts/check-brand-vault.mjs` fails the build if a core master goes missing,
empty, re-saved, or gets copied elsewhere under `public/`; optional assets only warn.
