# Wayfind Homepage V2 — Master Build Brief ("the goal")

## North star
When someone opens Wayfind they should think within five seconds: *"This already figured out
what I should do today."* Wayfind sells **confidence and a curated plan**, not a directory of
places. Every section answers **"Why is Wayfind showing me this?"** — and proves it with real signals.

## How to execute this brief
This is the master brief for the whole homepage. **Do NOT build it in one pass.** Build **one
section per branch**, in the Build Order below, each to the standard the Beach Intelligence
slice already set: prove the data first → build behind the flag → make the intelligence visible
→ deterministic prebuild lock-test → preview → stop at the owner gate.

Kick off each run with:
> Follow `docs/HOMEPAGE_V2_MASTER_BRIEF.md`. Build the next unbuilt section in the Build Order,
> end-to-end per its acceptance criteria and the global guardrails. Stop at the owner gate.

## Global guardrails (apply to every section)
- Build in **app/v2** behind **NEXT_PUBLIC_DISCOVERY_V2**, extending the discovery-v2 kit.
  **Never edit `app/home.js`** (live + under the web-vitals lane).
- **Never touch a Viator lane file** listed in CLAUDE.md.
- **Location is always the user's** current OR searched center (`wf_center` → URL → geolocation).
  Nothing hardcoded.
- **Data honesty (non-negotiable):** every number comes from a real, verified source or is
  omitted. No invented popularity / social / crowd numbers. If a section's core signal has no
  source, build on the real signals you *have* and surface the gap — never fake it. Prove the
  data before writing UI.
- **One section = one branch** `feat/v2-<section>` off fresh `origin/main`; `git status` shows
  only that section's files.
- Each section ships a deterministic prebuild lock-test wired into `prebuild`. Full
  `npm run prebuild` green before commit; red → report-only.
- Preview-deploy; verify for a real location AND a searched location; hide/degrade gracefully
  when data is absent. **Stop at the owner gate. No merge.**

## Product doctrine
- **Curated, not listed** — every surface reads as "we searched thousands and picked these."
- **Curiosity labels, never categories** — "Worth Your Afternoon", "People Keep Talking About
  These", not "Restaurants" / "Shopping".
- **The homepage feels alive** — sections adapt to context, never a fixed wall.

## Intelligence doctrine (user-facing — REQUIRED on every section)
The user must *feel* Wayfind did the work for them:
- Show the qualifying signals **as the content**, not decoration (the "why").
- Carry a Wayfind-AI badge: "Curated by Wayfind AI", "Based on today's weather", "Based on
  what's trending nearby", "Chosen from thousands of nearby options", "Updated live".
- Reasoning copy names what was analyzed (e.g. Beach: "Wayfind checked today's water, surf, UV,
  tides, and safety alerts").

## Data-honesty ledger (have / need)
- **HAVE** — weather + UV + marine + tides + NWS alerts (Beach, built); Google Places (cafés,
  restaurants, shopping, things-to-do); Ticketmaster (events, leagues, some popularity +
  availability); your own first-party demand (views / opens / likes via Supabase events + PostHog).
- **NEED a source (do not fabricate)** — Google Trends, social engagement, live crowd levels,
  traffic. Rank on the real signals you have; flag these as gaps until sourced.

## Build order (each = one branch/PR)
0. **[DONE] Beach Intelligence** — reference implementation: `lib/marine.js`,
   `app/api/beach/conditions/route.js`, `scripts/test-marine.mjs`. Location-general, verified live.
1. **Live Picks** — hottest-event feature card + swipeable premium cards. Popularity from REAL
   signals only: Ticketmaster event/venue popularity + availability + distance + your first-party
   demand (event views/opens from Supabase events). Category priority Concerts → Festivals →
   Comedy → Broadway → Shows. Headlines per the vision. **Flag Trends/social as unsourced — do
   not fabricate.** Lock test: scoring deterministic + category priority honored.
2. **Sports rail** — compact cards under Live Picks, sorted by popularity (not date). Ticketmaster
   classifications for leagues. Lock test: popularity-sorted, leagues mapped.
3. **Morning Picks** — pre-11am (siteTime gate) premium coffee card; Places cafés + photography;
   story copy, never "Best Coffee". Lock test: renders only before 11:00 local, hidden otherwise.
4. **Things To Do** — 3–5 curated collections with curiosity labels; Places/editorial. Lock test:
   labels never use raw category names.
5. **Food collections** — dinner / date-night / worth-the-drive collections, not a flat list;
   Places/editorial. Lock test: collections, not a raw restaurant list.
6. **Shopping** — one hero card (malls / boutiques / local / luxury / pop-ups); Places.
7. **Personalization engine (LAST)** — dynamic section ordering by context (weather, time,
   location, season, holidays, saved places, first-party demand). Orders ONLY on real signals;
   never a fixed order; missing-signal sections drop out cleanly. Lock test: ordering deterministic
   given a context fixture.

## Definition of done (per section)
Renders for current + searched location; hides gracefully when data absent; intelligence visible
and honest; prebuild green incl. the new lock-test; `app/home.js` + Viator untouched; preview
verified; owner-gated.

## Never
No mega-PR. No invented data (popularity / social / crowd). No `app/home.js` edits. No shipping a
section whose core signal has no source — flag it instead.
