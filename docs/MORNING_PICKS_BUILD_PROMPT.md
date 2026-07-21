# Morning Picks (§3) — build prompt (paste into the terminal)

Build the **Wayfind Morning Picks** section — one premium coffee/café card shown only before
11:00 local, placed after the events sections. The selection + gate module is built, verified, and
on disk. Build the UI + wiring on top.

## Already built (reuse)
- `lib/morningPicks.js` → `getMorningPick(places, ctx)` returns `{ show, place, headline, cta }`
  when it's morning and a café is nearby, else `{ show: false, reason }`. Also `isMorning(now, tz)`,
  `isCafe(place)`, `storyHeadline(place)`.
- Selection is honest: real Google **rating** + proximity + open-now. Story headline is chosen
  deterministically from a set that tells a story — never "Best Coffee" / "Top Cafe".
- `scripts/test-morning-picks.mjs` → deterministic lock-test (12 assertions) pinning the pre-11am
  gate and the café pick. Wire into `prebuild`.

## The time gate (important)
- Gate is **location-local**: pass `ctx.tz` = the searched/current location's IANA timezone. Get it
  from the weather API (`timezone=auto` returns a `timezone` field) or a lat/lng→tz lookup. If none
  is available it falls back to the site timezone (`America/New_York`). This keeps it correct when
  the user searches a different-timezone city, not just Florida.
- `ctx.now = new Date()`, `ctx.center` = user's current/searched center, `ctx.maxRadiusMi` (default 15).

## Build this
1. **Source:** reuse the existing Places search / curated layer for the user's center (the same one
   the app already calls). Pass its results as `places` to `getMorningPick`.
2. **Gate + placement:** render the section only when `show === true`, positioned after the events
   sections (Live Picks + Sports). When `show === false`, render nothing.
3. **Card:** one large premium card for `place` — use the existing photo pipeline for imagery
   (warm, inviting). Show the `headline`, the café name, rating, distance, open-now, and the `cta`.

## Make the intelligence visible (required)
- Badge: **"Curated by Wayfind AI · based on the time of day & what's near you"** (or "Handpicked for your morning").
- Reasoning line names the real signals: *"It's morning where you are — here's a top-rated café
  close by, open now."*
- Render only present fields (rating, distance, open-now). Never invent crowd/popularity.

## Guardrails (non-negotiable)
- Build in **app/v2** behind **NEXT_PUBLIC_DISCOVERY_V2**. Do NOT edit `app/home.js`. Never touch a Viator lane file.
- Branch `feat/v2-morning-picks` off fresh `origin/main`. `git status` shows only Morning Picks
  files (`lib/morningPicks.js`, `scripts/test-morning-picks.mjs`, the `app/v2` UI).
- Add `&& node scripts/test-morning-picks.mjs` to the `prebuild` script.
- Full `npm run prebuild` green before commit. Red → report-only.
- Preview-deploy; verify the section SHOWS before 11:00 local and is HIDDEN after (temporarily pass
  a fixed `now` to confirm both states), for a current location AND a searched different-timezone
  city. Confirm the headline is a story line, not "Best Coffee".
- STOP at the owner gate. No merge.

Deliver: what you built, the card before-11 vs the hidden state after-11, behavior for a
different-timezone search, and confirmation prebuild is green.
