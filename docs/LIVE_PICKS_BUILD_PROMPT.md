# Live Picks (§1) — build prompt (paste into the terminal)

Build the **Wayfind Live Picks** homepage section for V2. The ranking engine is built, verified,
and on disk. You are building the data wiring + user-facing UI on top — do NOT rebuild the scorer.

## Already built (reuse)
- `lib/livePicks.js` → `rankLivePicks(events, ctx, cfg)` returns `{ hero, rail, all }`.
  `hero` = the single highest-scoring event (the large feature card); `rail` = the rest (the
  swipeable premium cards, same large card style). Also `categorize(ev)` and `scoreEvent(ev, ctx)`.
- Ranking uses ONLY real signals: **category priority** (Concerts > Festivals > Comedy > Broadway
  > Shows) + **proximity** + **on-sale availability** + **date proximity**, with **first-party
  demand** (`event_open`/`tickets_out`) as a light boost. Sports and cancelled events are excluded.
- `scripts/test-live-picks.mjs` → deterministic lock-test (10 assertions). Wire into `prebuild`.

## The honest data reality (do not violate)
- Ticketmaster returns **no** popularity / ticket-demand number. Google Trends, search volume,
  social engagement, and artist/venue popularity have **no wired source**. Do NOT fabricate them
  and do NOT render claims that imply them ("Selling Fast", "Everyone's Talking") unless a real
  signal backs the specific event.
- First-party demand is real but currently **sparse** (tens of `event_open`/`tickets_out` total),
  keyed by `meta.id = "tm_<id>"`. Use it as a boost + an honest "Popular on Wayfind" flag only
  when an event actually has counts. It strengthens automatically as traffic grows.

## Build this
1. **Events source:** reuse the existing `/api/events` feed (already normalized by
   `lib/eventsPipeline.js`). Pass its events straight into `rankLivePicks`.
2. **Location:** `ctx.center` = the user's current OR searched center (`wf_center` → URL →
   geolocation). `ctx.todayStr` = `siteTodayStr()`. Never hardcode.
3. **First-party demand (optional boost):** add a small same-origin, service-role,
   memory-cached route `/api/events/demand` that returns `{ "tm_<id>": { opens, ticketOuts } }`
   for recent events, from:
   ```sql
   select meta->>'id' as id,
          count(*) filter (where action='event_open')  as opens,
          count(*) filter (where action='tickets_out') as ticket_outs
   from public.events
   where meta->>'id' like 'tm_%' and created_at > now() - interval '30 days'
   group by 1;
   ```
   Pass the result as `ctx.demandMap`. Add `/api/events/demand` to the middleware matcher
   (anti-scrape; same-origin XHR). If you skip this in v1, the scorer degrades cleanly (boost = 0).
4. **Render:** the FIRST card is always the large feature card (`hero`). Swiping reveals the
   `rail` — the exact same large card style, not a different layout. Order is the scorer's order
   (category priority honored). Under Live Picks, leave a slot for the Sports rail (§2, next).

## Make the intelligence visible (required)
- Badge: **"Curated by Wayfind AI · chosen from {all.length} events near you"** (or "Updated live").
- Honest headline for the hero, e.g. **"Wayfind's #1 Live Pick Tonight"** or **"Tonight's Biggest
  Event Near You"** — driven by category + proximity + date, which are real. Only use a
  demand-flavored headline for an event that actually has first-party counts.
- Reasoning line names the real signals: *"Picked for what's on near you, on sale now, and what
  Wayfind users are opening."*
- If an event has first-party counts, a small **"Popular on Wayfind"** tag is allowed; otherwise omit it.
- Render only present fields (price, date, venue, distance). Never invent.

## Guardrails (non-negotiable)
- Build in **app/v2** behind **NEXT_PUBLIC_DISCOVERY_V2**, extending the discovery-v2 kit. Do NOT
  edit `app/home.js` (live + web-vitals lane). Never touch a Viator lane file.
- Branch `feat/v2-live-picks` off fresh `origin/main`. `git status` shows only Live Picks files
  (`lib/livePicks.js`, `scripts/test-live-picks.mjs`, the `/api/events/demand` route, `app/v2` UI).
- Add `&& node scripts/test-live-picks.mjs` to the `prebuild` script; add `/api/events/demand` to
  the middleware matcher if you build that route.
- Full `npm run prebuild` green before commit. Red → report-only.
- Preview-deploy; verify the hero + swipe rail render for BOTH a current location and a searched
  location (try a big-city search and a small-town search — small town may have few/no events,
  which must degrade gracefully, not error). Confirm category priority visually (a concert
  outranks a generic show).
- STOP at the owner gate. No merge.

Deliver: what you built, the hero + rail for a city vs a small-town search, and confirmation prebuild is green.
