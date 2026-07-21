# Sports rail (§2) — build prompt (paste into the terminal)

Build the **Sports rail** — compact league cards under the Live Picks hero. The ranking module is
built, verified, and on disk. Build the UI + wiring on top; do NOT rebuild the module.

## Already built (reuse)
- `lib/sportsRail.js` → `rankSports(events, ctx, cfg)` returns `{ cards, byLeague }`.
  `cards` = compact sports cards sorted by honest signals; `byLeague` = grouped (MLB, NFL, …).
  Also `isSports(ev)` and `leagueOf(ev)`.
- Sort is **proximity + date + on-sale + first-party demand boost — NOT date alone** (the vision's
  "sort by popularity, not date"; since TM has no popularity number, proximity + on-sale + your
  first-party demand is the honest stand-in). Cancelled excluded.
- `scripts/test-sports-rail.mjs` → deterministic lock-test (10 assertions). Wire into `prebuild`.

## The honest data reality
- League precision (MLB vs NCAA baseball, NFL vs College football, NBA vs NCAA, MLS vs other
  soccer) lives in Ticketmaster's `classifications[0].subGenre` — which the current `/api/events`
  route does **not** capture (it maps only `segment` + `genre`). `leagueOf` uses `ev.subGenre` when
  present and falls back to sport + name heuristics.
- **Required one-line data fix:** in `app/api/events/route.js`, where the TM event is mapped, add
  `subGenre: cls && cls.subGenre ? cls.subGenre.name : ""` to the returned object. Additive, in the
  events lane (not home.js / not Viator). Without it, leagues degrade to the sport name — never fabricated.
- No ticket-demand / Trends / social numbers exist. Do not invent "hottest game" claims without a
  real signal; sort honestly and say so.

## Build this
1. **Source:** reuse `/api/events` (TM Sports segment is already fetched). Pass events to `rankSports`.
2. **Location + ctx:** `ctx.center` = user's current OR searched center; `ctx.todayStr = siteTodayStr()`;
   `ctx.demandMap` = the `/api/events/demand` map from §1 (optional; boost degrades to 0 without it).
3. **Render:** compact cards directly under the Live Picks feature/rail. Group by league using
   `byLeague` (MLB, NFL, MLS, College, NHL, NBA, Soccer, …) or show a single sorted `cards` row —
   whichever fits the layout — but order by score, never by date.

## Make the intelligence visible (required)
- Badge: **"Curated by Wayfind AI · what's near you & on sale"** (or "Updated live").
- Reasoning line names the real signals: *"Sorted by what's closest, on sale, and soonest — not
  just the next date on the calendar."*
- Show only present fields (league, teams/name, date, venue, distance, price). Never invent.

## Guardrails (non-negotiable)
- Build in **app/v2** behind **NEXT_PUBLIC_DISCOVERY_V2**. Do NOT edit `app/home.js`. Never touch a Viator lane file.
- Branch `feat/v2-sports` off fresh `origin/main`. `git status` shows only sports files
  (`lib/sportsRail.js`, `scripts/test-sports-rail.mjs`, the `app/v2` UI, and the one-line
  `app/api/events/route.js` subGenre addition).
- Add `&& node scripts/test-sports-rail.mjs` to the `prebuild` script.
- Full `npm run prebuild` green before commit. Red → report-only.
- Preview-deploy; verify the rail renders for a sports-heavy city (current + a searched location)
  and degrades gracefully where there are no sports events. Confirm the sort is not date-only
  (a closer later game can outrank a far sooner one).
- STOP at the owner gate. No merge.

Deliver: what you built, the rail for a sports-heavy city vs a small town, whether subGenre was
added (exact leagues) or fell back, and confirmation prebuild is green.
