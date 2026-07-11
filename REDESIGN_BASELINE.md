# Premium redesign — Phase 0 baseline (measure before redesigning)

Branch `design/premium-redesign-2026-07`. Screenshots in `design-baseline/`
(production build, placeholder API keys — the Google-Maps error box in the
desktop shots is that env's honest failure state, which itself is a finding:
the map slot has no designed fallback). The app is dark-only by design;
there is no light theme to capture. Zoom variants are captured as
viewport-width equivalents (200% ≈ 640px, 400% ≈ 320px) because headless
Chromium has no real browser-zoom API.

## Shared-layer inventory

- **Tokens that exist** (`app/components/kit.js`): `C` (11 colors), `CAT_COLOR`/`CAT_LABEL_COLOR` (per-category accents), `SHEET_EASE` (one motion curve), `sheetBg`/`sheet` (sheet layout). **Missing**: type scale, spacing scale, radii scale, shadows, focus tokens, aspect ratios, motion durations, reduced-motion handling.
- **Icons**: `NavIcon` in home.js — a real line-icon set (single stroke style) already used by the bottom nav AND the founder-approved category menu (v"FINAL MENU Jul 3"). The emoji problem is everywhere else.
- **Emoji-as-chrome census** (all glyphs, chrome + content): home.js 232 · kit.js 42 · Detail.js 38 · Menu.js 18 · Surprise.js 12 · Map.js 10 · others ≤8. The *chrome* subset (navigation/category identity/section headers, not content):
  - Intent/experience chips ("Start with one of these"): ✨💎👨‍👩‍👧💕🎟🚗💵🎲
  - Section headers: "🎟️ Happening near you", "🎟️ Events nearby", 📍 venue prefixes
  - Event category badges (`eventSegmentMeta`/`eventCategory` icon field): 🎵🏈🎭👪🎬🎪🛒🌳🍔🍷🎨🏃 etc.
  - Community sheet tiles: `CAT_ICONS` emoji (🍽️🍸🎡🏖️🏨🛍️) + 📍 fallback (Menu.js) and a 40px `CAT_ICONS[cat]` empty-state glyph (home.js ~5420)
  - Intro/onboarding mood grid: 🌹🍸🍽️💎🌧️👫 (large glowing modal — see below)
  - **Content emoji that stay** (per spec): weather glyphs, place-identity map pins (`iconForPlace`), list-icon picker (`EMOJIS` — user-chosen content), Critter mascot.
- **Arcade motion inventory** (violates "no bouncing/pulsing/game-like"): `wfbob` (loader + 3 more sites, infinite bounce), `wfpulse`, `wfdot`, `wfDiceSpin` (infinite while rolling), `wcJuggle`/`wcBob`/`wcGlow` (World-Cup card juggling soccer ball), `wfBurst`+`wfTwinkle`+`wfSweep`+`wfGlow` (giveaway card: firework rings, twinkling stars, light sweep), `wfroll`. No `prefers-reduced-motion` handling anywhere.
- **Glows**: `GlowPin` (double halo rings + radial glow + drop shadow), header "Find my vibe" button (orange halo), intro modal (orange glow bloom around the dialog), dice FAB (purple glow shadow).
- **Image components**: `FallbackImg` (emoji-icon fallback, no skeleton), `EventArt` (branded gradient tile fallback — the good pattern), `EventHeroBg` (venue-photo fallback chain). `next.config` remote images allowed from any hostname? (verify in Phase 3).
- **Dialogs**: intro, auth, account, recovery (sheets, all with `useDialogFocus` since v5.48), giveaway pop, dialogs e2e-tested in `modals.spec.js`. One-interruption coordinator exists (`dialogOpenRef` + deep-link suppression, e2e-covered).
- **States**: `Loader` (bobbing critter + line of text — no skeletons anywhere), events/moments empty states own their content rules (events prompt), several "half page empty + one sentence" loading layouts.

## Desktop dead zones + competing CTAs (home-1440.png)

- App column is ~1040px anchored center-left; **~200px black void left, ~200px right**, and the lower half of the viewport is empty below the intent chips ("Privacy · Terms" floats mid-void). No max-width grid system.
- **Events rail clips mid-card** at the right edge of its column (overflow with no affordance).
- **Map slot renders Google's raw "Oops! Something went wrong" error box** when Maps fails — no designed fallback (spec: working map or intentional preview, never a broken placeholder).
- Competing primary CTAs in the first viewport (1440): search submit (orange), "Find my vibe" glowing header button, 8 intent chips, "Get tickets →" hero CTA, "Full map ↗", "See all ↗" ×2 — ~13 tappable accents before scrolling.
- **Copy bug**: literal `—` renders in "Wayfind is reading what's around you — these always work." (home.js ~6120 — escaped em dash inside a plain string).

## First impression (intro-390/1440.png)

Large modal with orange glow bloom, emoji mood grid (🌹🍸🍽️💎🌧️👫), gradient
CTA ("Let's Wayfind it"), small low-contrast skip line ("Just let me look
around"). Blocks the entire first paint on both mobile and desktop.

## Mobile (home-390.png)

Structurally decent (hero + rail + chips) but: emoji header sections, red
badge glyphs, all-caps orange pills, tickets CTA + card link + venue link
all competing inside one hero, small 10-12px metadata text throughout.

## Zoom/width matrix (baseline)

No horizontal document scroll at any width including 320px and 400%-zoom
equivalent (good — the audit's overflow work held). Chips scroll in-rail by
design. Verified again after every later phase.

## What later phases diff against

`design-baseline/*.png` — home & events at 320/390/768/1024/1440, zoom200/
zoom400, guide at 390/1440, intro at 390/1440.
