# Shopping (§6) — build prompt (paste into the terminal)

Build the **Shopping** section — one beautiful hero card. The picker is built, verified, and on
disk. Build the UI + wiring on top.

## Already built (reuse)
- `lib/shopping.js` → `pickShoppingHero(places, ctx)` returns `{ show, place, headline, cta }` when
  a shopping-worthy place is nearby, else `{ show: false, reason }`. Also `isShopping(place)`,
  `shopHeadline(place)`.
- Honest pick: rating + reviewCount + distance + open-now + first-party likes/saves boost. Requires
  rating ≥ 4.0 and shopping place types (malls, boutiques, department/clothing/jewelry/book/home
  stores, markets, pop-ups by name). Non-shopping and rating-less places are excluded.
- Curiosity headline set (never the bare word "Shopping"): "Retail Therapy Starts Here", "Worth
  Browsing Today", "Wayfind's Shopping Finds", "Today's Best Browse Nearby".
- `scripts/test-shopping.mjs` → deterministic lock-test (10 assertions). Wire into `prebuild`.

## Build this
1. **Source:** reuse the existing Places / curated layer for the user's center (current OR searched).
2. **Engagement boost (optional):** reuse the `like`/`save`-by-`place_id` engagement map from §4/§5.
3. **Render:** one large premium hero card for `place` (existing photo pipeline) with the `headline`,
   name, rating, distance, open-now, and `cta`. Hide the section entirely when `show === false`.

## Make the intelligence visible (required)
- Badge: **"Curated by Wayfind AI · based on your location"** (or "Handpicked nearby").
- Reasoning line: *"A top-rated place to browse close to you, open now."*
- Render only present fields (rating, distance, open-now). Never invent crowd/popularity.

## Guardrails (non-negotiable)
- Build in **app/v2** behind **NEXT_PUBLIC_DISCOVERY_V2**. Do NOT edit `app/home.js`. Never touch a Viator lane file.
- Branch `feat/v2-shopping` off fresh `origin/main`. `git status` shows only Shopping files
  (`lib/shopping.js`, `scripts/test-shopping.mjs`, `app/v2` UI).
- Add `&& node scripts/test-shopping.mjs` to the `prebuild` script.
- Full `npm run prebuild` green before commit. Red → report-only.
- Preview-deploy; verify the hero renders for a shopping-rich location and is hidden where there's
  no shopping nearby, for a current AND a searched location. Confirm the headline is never "Shopping".
- STOP at the owner gate. No merge.

Deliver: what you built, the hero for a mall-rich area vs a hidden state, and confirmation prebuild is green.
