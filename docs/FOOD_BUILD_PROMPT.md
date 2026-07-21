# Food collections (§5) — build prompt (paste into the terminal)

Build the **Food** section — named dinner collections, never a flat restaurant list. The assembler
is built, verified, and on disk. Build the UI + wiring on top.

## Already built (reuse)
- `lib/foodCollections.js` → `buildFoodCollections(places, ctx, opts)` returns 3–5 collections
  `[{ id, label, places[] }]`, ≥3 real food places each, **deduped**, filtered to food types.
- Curiosity labels (`COLLECTIONS`): "Date Night Done Right", "Locals Can't Stop Talking About
  These", "Places Worth The Drive", "Restaurants You'd Probably Miss", "Tonight's Best Dinner
  Picks". Never a raw category name (`RAW_CATEGORY_NAMES`). `isFood(place)` gate included.
- Honest selection: rating + reviewCount + **priceLevel** + distance + open-now, with first-party
  likes/saves boost (`ctx.engagementMap`). Non-food and rating-less places are dropped, never faked.
- `scripts/test-food-collections.mjs` → deterministic lock-test (10 assertions). Wire into `prebuild`.

## Honest data notes
- "Date Night Done Right" uses Google **priceLevel ≥ 3** when present (real upscale signal); if a
  place has no priceLevel it only qualifies at very high rating. Never invent a price tier.
- "Locals Can't Stop Talking About These" requires real high review counts; "Restaurants You'd
  Probably Miss" requires real low review counts. No fabricated buzz.
- Array order = dedupe priority (specific themes first; "Tonight's Best Dinner Picks" catch-all
  last). DISPLAY order is your UI choice — lead with "Tonight's Best Dinner Picks" if you want it first.

## Build this
1. **Source:** reuse the existing Places / curated layer for the user's center (current OR searched).
2. **Engagement boost (optional):** reuse the `like`/`save`-by-`place_id` engagement map from §4.
3. **Render:** large horizontal collection rows of premium restaurant cards (existing photo pipeline).

## Make the intelligence visible (required)
- Section badge: **"Curated by Wayfind AI · chosen from {N} spots near you"**.
- Per-collection reasoning: Date Night → *"Upscale, top-rated, made for the occasion."* Locals →
  *"Hundreds of nearby reviewers agree."* Worth The Drive → *"A little farther, worth the trip."*
- Show only present fields (rating, price, distance, open-now). Never invent.

## Guardrails (non-negotiable)
- Build in **app/v2** behind **NEXT_PUBLIC_DISCOVERY_V2**. Do NOT edit `app/home.js`. Never touch a Viator lane file.
- Branch `feat/v2-food` off fresh `origin/main`. `git status` shows only Food files
  (`lib/foodCollections.js`, `scripts/test-food-collections.mjs`, `app/v2` UI).
- Add `&& node scripts/test-food-collections.mjs` to the `prebuild` script.
- Full `npm run prebuild` green before commit. Red → report-only.
- Preview-deploy; verify collections render with distinct food places for a current AND searched
  location, non-food never appears, no label is a raw category name.
- STOP at the owner gate. No merge.

Deliver: what you built, collections for two locations, and confirmation prebuild is green.
