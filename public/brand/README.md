# Wayfind brand and editorial assets

This directory is the single source of truth for the approved Wayfind appearance
assets. Files in `public/brand` are served directly by Vercel at `/brand/<file>`.
Keep the names stable: the welcome experience selects these files at runtime.

## Brand marks

| File | Purpose | Use |
| --- | --- | --- |
| `wayfind-logo.png` | Owner-provided master wordmark + pin on dark background. | Source reference only. |
| `wayfind-logo-header.png` | Optimized app-header wordmark. | Homepage header. |
| `wayfind-logo-header-transparent.png` | Transparent wordmark crop. | Welcome overlay, on editorial imagery. |
| `wayfind-pin-transparent.png` | Transparent pin mark. | Welcome overlay accent only. |

### Vector marks

Prefer these over the PNGs wherever the surface can take an SVG: they stay sharp
at any size and the pin is rendered on the map at 30px, where a raster crop
visibly softens. All four were tracked but sitting in `_to_delete/`, unlisted
here, which is why nothing used them — a work order called the pin "already
produced" and it read as missing.

| File | Purpose | Use |
| --- | --- | --- |
| `wayfind-pin.svg` | The pin mark alone, 32x36, orange gradient, transparent centre, no glow halo. | The user's own location on the map. NOT for places -- see below. |
| `wayfind-pin-neon.svg` | The user-location pin on the map — neon outline remake of the brand pin (owner-supplied look, 2026-08-11). Transparent, glow baked into the SVG filter. OUTLINE PIN = YOU; never used for places. |
| `wayfind-logo.svg` | Full wordmark, white lettering with the gradient pin. | On dark backgrounds. |
| `wayfind-logo-ink.svg` | Same wordmark, near-black lettering (`#0E1116`). | On light backgrounds. |
| `wayfind-logo-bold.svg` | Heavier wordmark cut, white lettering, slightly wider. | Where the wordmark must hold at small sizes or over busy imagery. |

**The pin is the USER, never a place.** Outline pin = you are here; filled circle
with a rank number = somewhere we are recommending. Using the pin for a place
makes the user's own position read as a search result, which is the one thing the
map must never say. `app/components/MapView.js` keeps those two vocabularies
apart deliberately.

## Editorial discovery imagery

| File | Editorial description | Where it appears | SEO/accessibility treatment |
| --- | --- | --- | --- |
| `wayfind-neighborhood-context-v1.png` | Walkable waterfront neighborhood with restaurants, music, and places to explore. | Existing no-results discovery state only. | Meaningful image; it has descriptive alt text in `app/home.js`. |
| `wayfind-welcome-wynwood-v3.png` | Miami/Wynwood-style local discovery scene. | Evergreen welcome-overlay rotation. | Decorative background; accompanying visible copy supplies the user meaning. |
| `wayfind-welcome-local-plan-v2.png` | Florida local-plan editorial scene. | Evergreen welcome-overlay rotation. | Decorative background; accompanying visible copy supplies the user meaning. |
| `wayfind-welcome-labor-day-south-beach-v2.png` | Pulled-back South Beach/Art Deco blue-hour scene for Labor Day travel. | Seasonal welcome-overlay rotation, July 22–September 8, 2026. | Decorative background; accompanying visible copy supplies the user meaning. |

## Release 01 rules

- `app/components/sheets/Intro.js` owns `INTRO_VISUAL_LIBRARY`. Add future
  seasonal assets there with an explicit ISO date window; otherwise use the
  evergreen weekly rotation.
- The "Wayfind, made for right now" visual is **not** a second homepage module.
  It stays inside the existing no-results condition in `app/home.js`.
- Do not use a brand image as a link or button without a meaningful accessible
  name. Decorative/background images should keep an empty `alt` so screen
  readers do not repeat the visible pitch copy.
- Home metadata and social previews live in `app/layout.js`; the Open Graph
  image alt is intentionally specific to Wayfind discovery and travel planning.

See `docs/VISUAL_RELEASE_01.md` for the final appearance specification and
Vercel deployment handoff.
