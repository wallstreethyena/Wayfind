# Premium redesign — wrap-up (v5.55–v5.58)

Branch `design/premium-redesign-2026-07`. A visual + interaction-layer
redesign, NOT a feature rewrite — analytics, SEO, auth, location, maps,
affiliate tracking, and data providers are untouched. **Owner reviews the
design taste on the before/afters BEFORE deploying — this is taste, and you
own it.**

## Before / after screenshots
- Baseline: `design-baseline/` (Phase 0)
- After each phase: `design-after-p1/`, `-p2/`, `-p3/`, `-p4/`,
  `design-after-final/` — home + events at 320/390/768/1024/1440, zoom200/
  zoom400, guide 390/1440, intro 390/1440. Dark-only by design.

## What changed, by phase
- **Phase 0** — baseline inventory + screenshot matrix (`REDESIGN_BASELINE.md`).
- **Phase 1** — token system in `components/kit.js` (TYPE/SPACE/RADII/SHADOW/
  MOTION/RATIO/FOCUS/TARGET/CHAMPAGNE); one line-icon language (`Icon` +
  `NavIcon`) replacing emoji chrome; calm motion (de-glowed GlowPin, global
  `prefers-reduced-motion`, focus-visible ring); fixed the literal em-dash
  copy bug.
- **Phase 2** — desktop grid 1040→1280, home two-column filled to 1240 (the
  ~400px side dead zones were a flex-item-not-filling-parent bug); branded
  map fallback replacing Google's raw "Oops" box; CSS-grid track-overflow
  fix on every card grid.
- **Phase 3** — image fallback chain (skeleton → image → branded artwork),
  pure + unit-tested (`lib/imageState.js`, `test-image-fallback.mjs`); CSP
  img-src fixed to include the live event/booking image CDNs.
- **Phase 4** — calm onboarding: the glowing emoji-grid intro is now a quiet
  elevated dialog with line-icon mood tiles, a solid CTA, a 44px Skip, and
  no halo/bloom. Dialog semantics + one-interruption coordinator verified
  (built in prior G4/audit work, not re-forked).
- **Phase 5** — search submit de-glowed + relabeled "Search"; header icon
  buttons 36/34→40, intro controls →40/44/48; width/zoom matrix clean (no
  horizontal document scroll at 320/390/768/1024/1440 or zoom200/400); axe
  clean on home/events/privacy/guide/favorites (a11y + screens + modals
  specs pass).
- **Phase 6** — the server-rendered homepage returns 200 with the full
  crawlable contract WITHOUT JS: one descriptive H1, explanatory copy, 9
  guide links, 7 city links, a map CTA, canonical, OG, 2 JSON-LD blocks —
  and now direct **category-landing** links (`/restaurants/sarasota`,
  `/things-to-do/orlando`, `/beaches/sarasota`, `/nightlife/tampa`, all
  verified 200) in the shared footer. No indexed URL changed.

## Emoji-chrome → line-icon inventory
Replaced (chrome): discovery grid (✨💎👨‍👩‍👧💕🎟🚗💵🎲), "Find my vibe" (✨),
event category badges + section headers + hero badges + EventArt tiles
(🎵🏈🎭👪🎬🛒🌳🍔🍷🎨🏃), community-sheet category grid (🍽️🍸🎡🏖️🏨🛍️),
empty-state category glyph, intro mood tiles (🌹🍸🍽️💎🌧️👫), intro greeting
wave (👋). Kept (content): weather glyphs, place map pins (`iconForPlace`),
the user's list-icon picker (`EMOJIS`), the Critter mascot.

## Image-pipeline test results
`scripts/test-image-fallback.mjs`: the (src, errored, loaded) → state map is
exhaustive; a dead/absent URL can never resolve to "image". Verified
visually: a fixture event with a dead image URL renders the branded tile,
no broken `<img>` (`design-after-p3/events-deadimg-390.png`).

## Width / zoom matrix
No horizontal document scroll at 320 / 390 / 768 / 1024 / 1440 or at the
200%/400% zoom equivalents (verified by `scripts/design-shots.mjs`, which
asserts `scrollWidth <= clientWidth` per shot).

## OWNER-REVIEW FLAGS (decide before / at deploy)
1. **Accent pairing** — orange is the app-wide accent; champagne/gold
   (`CHAMPAGNE` token) is reserved for the giveaway/premium surfaces. The
   giveaway card's arcade fireworks (`wfBurst/wfTwinkle/wfSweep`) were left
   as-is (that surface is the share/save prompt's Phase 3 territory) —
   confirm the orange+champagne pairing and whether to calm the giveaway
   animation too.
2. **Design taste** — review the before/afters; this is your call.
3. **No URL 301s were needed** — nothing indexed changed.

## Known / deferred (not blockers)
- Header is dense at the 320px / 400%-zoom extreme (weather + vibe +
  account tight next to the wordmark) — no horizontal scroll or true
  overlap, but a 320px-specific header layout is a future pass; the working
  header was left intact.
- Loading states still use the branded critter loader with contextual copy
  (audit work), not full skeleton screens; the image skeleton (Phase 3) is
  in. Card-level skeletons are a possible future refinement.
