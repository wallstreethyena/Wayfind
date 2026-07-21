# Things To Do (§4) — build prompt (paste into the terminal)

Build the **Things To Do** section — 3–5 AI-curated collections of real places with curiosity
labels. The collection assembler is built, verified, and on disk. Build the UI + wiring on top.

## Already built (reuse)
- `lib/thingsToDo.js` → `buildCollections(places, ctx, opts)` returns 3–5 collections
  `[{ id, label, places[] }]`, each with ≥3 real places, **deduped** across collections.
- Curiosity labels only (`COLLECTIONS`): "Hidden Gems You'll Love", "Places Locals Actually
  Recommend", "Worth The Drive", "Perfect For Today", "Worth Leaving The House For". Never a raw
  category name (`RAW_CATEGORY_NAMES` lists the banned ones).
- Honest selection: Google **rating** + **reviewCount** + distance + open-now, with first-party
  **likes/saves** as a boost (`ctx.engagementMap`). Places with no rating are dropped, never faked.
- `scripts/test-things-to-do.mjs` → deterministic lock-test (8 assertions). Wire into `prebuild`.

## Honest data notes
- "Hidden Gems" = high rating + **low review count** (real); "Locals Recommend" = high rating +
  **many reviews** (real). Both REQUIRE `place.reviewCount` — a place without it simply can't enter
  those collections. Never invent a review count or a "hidden gem" flag.
- The `COLLECTIONS` array order is **dedupe priority** (specific themes claim places first, the
  generic "Worth Leaving The House For" mops up last). The on-screen DISPLAY order is your UI
  choice — render "Worth Leaving The House For" first if you want it prominent; it doesn't change
  which places land where.

## Build this
1. **Source:** reuse the existing Places / curated layer for the user's center (current OR
   searched). Pass results as `places`.
2. **Engagement boost (optional):** build `ctx.engagementMap = { "<place_id>": { likes, saves } }`
   from `public.events` (`action in ('like','save')` grouped by `place_id`), same-origin,
   service-role, cached — like the §1 demand route. Degrades to 0 without it.
3. **Render:** large horizontal cards, 3–5 collections. Each collection is a titled row (curiosity
   label) of premium place cards with the existing photo pipeline for imagery.

## Make the intelligence visible (required)
- Section badge: **"Curated by Wayfind AI · chosen from {N} places near you"**.
- Per-collection reasoning line naming the real signal, e.g. Hidden Gems → *"High ratings, still
  under the radar."* Locals → *"Loved by hundreds of reviewers nearby."* Worth The Drive →
  *"A little farther, worth every mile."*
- Render only present fields (rating, reviewCount, distance, open-now). Never invent.

## Guardrails (non-negotiable)
- Build in **app/v2** behind **NEXT_PUBLIC_DISCOVERY_V2**. Do NOT edit `app/home.js`. Never touch a Viator lane file.
- Branch `feat/v2-things-to-do` off fresh `origin/main`. `git status` shows only Things To Do files
  (`lib/thingsToDo.js`, `scripts/test-things-to-do.mjs`, optional engagement route, `app/v2` UI).
- Add `&& node scripts/test-things-to-do.mjs` to the `prebuild` script.
- Full `npm run prebuild` green before commit. Red → report-only.
- Preview-deploy; verify 3–5 collections render with distinct places for a current AND a searched
  location, and that a place is never in two collections. Confirm no label is a raw category name.
- STOP at the owner gate. No merge.

Deliver: what you built, the collections for two different locations, and confirmation prebuild is green.
