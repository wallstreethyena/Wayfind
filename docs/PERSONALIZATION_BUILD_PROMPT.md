# Personalization engine (§7) — build prompt (paste into the terminal)

Build the **Personalization engine** — the layer that orders the V2 homepage sections dynamically
so it "rebuilds itself" per context. The ordering engine is built, verified, and on disk. Wire it
as the section orchestrator for `app/v2`.

## Already built (reuse)
- `lib/personalization.js` → `orderSections(ctx)` returns a DETERMINISTIC ordered array of section
  ids to render (`SECTIONS` = live-picks, sports, morning-picks, beach, things-to-do, food, shopping).
- It orders on real signals ONLY — local time-of-day, weekend, season, weather — and DROPS any
  section marked unavailable, plus hard-drops beach in bad weather and morning-picks after 11am.
  Live Picks always leads. No fabricated popularity/social/crowd/traffic — those are excluded.
- `scripts/test-personalization.mjs` → deterministic lock-test (14 assertions): same context → same
  order, morning ≠ evening, rainy drops beach + lifts indoor, evening lifts food, weekend lifts
  beach, unavailable excluded. Wire into `prebuild`.

## Build this (orchestration)
1. **Assemble the context** for the user's current OR searched location:
   - `hour` = the location-local hour (same tz source as Morning Picks §3).
   - `isWeekend`, `season` (from the local date).
   - `weather` = `{ condition, isBad }` from the existing weather API.
   - `available` = `{ [sectionId]: boolean }` — set each from whether that section actually has
     content: beach from the §0 beach `show`, morning-picks from `isMorning`, live-picks/sports/
     food/things-to-do/shopping from whether their assembler returned ≥1 item. **This is the honesty
     hinge — a section is available only if its real data produced content.**
2. **Render** the sections in `orderSections(ctx)` order, top to bottom. Sections not returned are
   not rendered at all. The Hero (search + weather + location) stays fixed at the top, above this order.

## Make the intelligence visible (required)
- A subtle line at the top of the feed that names why it's arranged this way, e.g.
  *"Arranged for your morning"* / *"Rearranged for today's rain"* / *"Your weekend, planned"* —
  derived from the same context, never invented.
- Reinforces the whole-page promise: "Wayfind already figured out what you should do today."

## Guardrails (non-negotiable)
- Build in **app/v2** behind **NEXT_PUBLIC_DISCOVERY_V2**. Do NOT edit `app/home.js`. Never touch a Viator lane file.
- Branch `feat/v2-personalization` off fresh `origin/main`. `git status` shows only personalization
  files (`lib/personalization.js`, `scripts/test-personalization.mjs`, the `app/v2` orchestrator).
- Add `&& node scripts/test-personalization.mjs` to the `prebuild` script.
- Full `npm run prebuild` green before commit. Red → report-only.
- Preview-deploy; verify the order visibly changes across contexts (morning vs evening, clear vs
  rainy, weekday vs weekend) and that absent sections drop out — for a current AND a searched location.
- STOP at the owner gate. No merge.

Deliver: what you built, the section order for morning/evening/rainy/weekend, proof absent sections
drop, and confirmation prebuild is green.

---

This is the last section. With all seven built behind `NEXT_PUBLIC_DISCOVERY_V2` in `app/v2`, flip
the flag on a preview to see the full AI-curated homepage assemble itself.
