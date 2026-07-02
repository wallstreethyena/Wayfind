# Wayfind Changelog

Versioning starts at 1.0. Each shipped build gets the next number (1.1, 1.2, ...).
The running app shows the version in the footer ("Wayfind v1.0") so you can confirm
which build is live on Vercel. This file is the record so nothing gets lost.

## v3.14 - make the moat visible (Grok review reconciliation)
- Review triage: "beta tag" was already removed in v3.13 (reviewer graded an
  older deploy). "No differentiation" is wrong about the engine, right about
  the screen: the weather/time ranking exists but was invisible on hot days
  because heroReason had no hot-weather branch, so a 101-degree afternoon
  showed generic copy. Fixed: hot regime + indoor venue now reads "A cool
  escape from the heat right now." Fixtures added (hot day surfaces the line;
  hot day never says get outside).
- Hero photo sharpness: hero cards now use the 1000px photo instead of the
  480px thumbnail already being fetched. Free quality, zero new API calls.
- Rejected from the review, with reasons: AI-generated place photos (violates
  the no-fabrication trust rules this app is built on); itinerary drag-drop,
  social layer, AR (pre-validation bets; the review's own "show it to 20
  tourists" comes first and decides which of these earns investment);
  crowd-aware ranking (no honest crowd data source exists in the stack).
- Converged verdict: two independent reviews plus this advisor now all say
  the same next step is real users watching the screen. That is the roadmap.

## v3.13 (header label removed) - weather truly in the header
- The forecast wheel now renders directly under the header row, above the
  search bar, so tapping the chip drops it from the header and pushes the page
  down. This was a DOM relocation, not a styling trick.
- Orange border around the wheel removed; gradient and shadow kept; corners
  rounded only at the bottom so it reads as part of the header.
- "beta" removed from the header. Deploy verification now lives only in the
  footer ("Wayfind beta · v3.13"); check there after each deploy.
- Header chip now shows the condition word under the feels-like temp; wheel
  cells now show time / icon / feels-like / condition, completing the original
  spec (forecast word was missing from cells).
- Note: the chip shows the current feels-like; the "Now" cell shows this
  hour's value from the hourly series. They can differ by a degree or two;
  both are real readings, not a bug.

## v3.12 (header: beta) - founder batch + env advisor gate
- Submenu typography harmonized with the menu tiles: same font, colors, and
  weight system, one scrolling row. Size is 11px, not the tiles' 9.5px, the
  one deliberate deviation: text-only items at 9.5px fall below a comfortable
  tap target; 11px is the floor that keeps touch reliable.
- Weather is now visually part of the header: the feels-like chip carries a
  small rotating indicator showing it expands, and the forecast wheel hangs
  from the header (squared top, attached) instead of floating as a card.
- Beach day subfilters: Waterfront dining and Parks removed; Parking ("beach
  parking lots and garages") and Gift shops ("beach shops and souvenir gift
  stores") added; Marinas kept.
- Night out subfilters: Cocktails removed; Wine bars replaced by Speakeasy
  ("speakeasy bars and hidden lounges"). All new queries are real and
  well-indexed; nothing fake enters the menu.
- New fourth gate layer: scripts/check-env.mjs prints clear build-log warnings
  when Supabase or Google keys are missing/malformed. Non-fatal by design
  (hardened client degrades gracefully); it exists to turn silent config
  failures into one readable line.

## v3.11 (header: beta) - dead-code sweep + config re-coupled
- Removed, grep-proven dead: moodOpen/moodAll state, tagsFor (old colored-tag
  system, zero callers since the v2.0 trust layer), and the three sheet
  handlers orphaned by the v3.5 menu (openWorthDrive, openMustDos,
  openOpenNow). openRainy stays (events empty-state uses it). Dormant-feature
  ledger: Worth the drive / Must-dos / Open now are unreachable by design
  until the menu regains entries; openRainy is the 5-line template if revived.
- lib/categories.js is source of truth again: the six home tiles now render
  from CATEGORY_TILES (zero visual change), and new fixtures pin the tile set,
  so the regression lock guards the live UI instead of a shadow config.
- Prod console.log dev-gated; one unused variable removed after a scoped
  inertness check.

## v3.10 (header: beta) - submenu, final form
- Subfilters now render as ONE horizontally scrolling row that can never wrap
  to a second line; nothing was removed to force the fit, the row scrolls.
- Visual treatment mirrors the category tiles exactly: muted words at rest,
  accent text + dim fill + accent border when active, same weight system. No
  pill bubbles, no underlines. Slide-down animation on category tap retained,
  container height tightened for the single row.
- Icons on subfilters deliberately omitted (founder delegated the call):
  12px glyphs for Brunch/Quick bites read as clutter, and the earlier spec was
  "just the words, like the row above." Additive later if wanted.

## v3.9 (header: beta) - duplicate moonPhase fixed, gate gains semantic layer
- Root cause of the failed deploy: v3.7 added a second moonPhase for the
  weather wheel, unaware the codebase already had one (richer: name, emoji,
  illumination) powering the existing moon-image system. ES modules forbid
  duplicate top-level declarations, so Vercel's compiler rejected it, while
  the local gate (tsc, syntax-only under allowJs) passed it. Both statements
  in the prior changelog claiming "gate clean" were technically true and
  practically wrong; this entry corrects the record.
- Fix: the duplicate is deleted; hourIcon now uses the original moonPhase
  (icon from emoji, label from name). One lunar algorithm remains.
- New permanent gate layer: scripts/check-dupes.mjs scans all first-party
  files for duplicate top-level declarations and blocks the build. Wired into
  prebuild between the JSX parse and the fixtures, locally and on Vercel.
  Verified: it fails on the pre-fix file, passes after.
- Cleanup: removed an orphaned comment left from the deleted placeVibe fn.

## v3.8 (header: beta) - verification, hardening audit, speed pass
- Header now displays "beta" per founder request. The numeric build (v3.8)
  moved to the footer ("Wayfind beta · v3.8") so deploys stay verifiable at a
  glance without a version number in the header.
- Supabase crash audit CLOSED: the codebase has exactly one client, the
  hardened wrapper in lib/supabase.js (cleans values, normalizes http->https,
  validates shape, try/catches createClient, falls back to null); every auth
  and analytics call is null-guarded. Zero other createClient sites exist
  (verified by repo-wide grep). The dead deploys ran an older unhardened
  client on a fresh project before env vars existed; that failure class
  cannot recur on this code.
- Speed: feed thumbnails now lazy-load with async decode (offscreen images no
  longer block first paint); preconnect hints added for Google Places, Google
  Maps, and Open-Meteo so first API round-trips start earlier.
- Cleanup notes: moodOpen/moodAll state is inert (zero callers) and retained
  harmlessly after an over-strict removal guard tripped. Feed thumbnails
  already had lazy loading from an earlier pass; this build adds async decode.
- Full gate at build time: JSX compile clean, all modules parse, 30 fixtures.

## v3.7 - header weather + hourly forecast wheel, logo, flat submenu words
- Header now shows current condition icon + FEELS-LIKE temp (not actual temp)
  left of the sign-in. Tapping it opens a horizontally scrolling forecast
  strip: next 18 hours in 3-hour steps, feels-like per cell, snap-scrolling.
  Data is real (Open-Meteo hourly, newly requested; forecast_days=2 so late
  hours resolve). At night, clear/partly cells show the actual MOON PHASE
  (computed from date); precip keeps its own icon.
- Honest limit: iOS Safari ignores the web Vibration API, so there is no
  physical haptic "clack" on iPhone. The strip snap-scrolls and reads tactile
  but the phone will not buzz; that is a browser constraint, not a bug.
- Logo enlarged (30->34px).
- Submenu subfilters flattened: when a category expands, subfilters render as
  clean underlined words (active = accent + underline), not outlined bubble
  chips, matching the tile row above.
- Pin note: the header wordmark is a baked PNG, so its i-dot pixels cannot be
  restyled in code; the mood-card pin remains the accent teardrop. If you want
  the header pin changed, that is a logo-file swap, not a code change.

## v3.6 - trim Food subfilters
- Removed Coffee, Dessert, and Drinks from the Food subfilter row per request.
  Food is now: All, Breakfast, Brunch, Lunch, Dinner, Quick bites. Those
  removed queries still exist elsewhere (Coffee has its own signals; Drinks
  overlaps Night out), just not as Food chips. Reversible if wanted back.

## v3.5 (beta) - one-box exposed menu, expanded subcategories
- Single rounded panel. Six icon tiles (Food, Night out, Things to do, Beach
  day, Stays, Shopping) exposed at the top, always visible. "What are you in
  the mood for?" folded in as a soft one-line header inside the same box.
- Tapping a category slides its subfilters down INSIDE the box, above a divider,
  in the same visual language as the tiles; tapping the category again
  collapses. Inline in normal flow: no sticky, no negative-margin bleed, so the
  page stays square (the v3.2 sideways bug stays fixed).
- Subcategories expanded to real, queryable sets across all six:
  Food: All/Breakfast/Brunch/Lunch/Dinner/Quick bites/Coffee/Dessert/Drinks.
  Night out: All/Bars/Clubs/Cocktails/Wine bars/Karaoke/Sports bars/Live music.
  Things to do: All/Outdoors/Museums/Family/Tours/Landmarks/Arts.
  Beach day: All/Beaches/Waterfront dining/Parks/Marinas (new set).
  Stays: All/Luxury/Budget/Beach/Boutique.
  Shopping: All/Malls/Boutiques/Markets/Outlets.
  Every subfilter maps to a real Google Places query, none padded with tags
  that would return junk.

## v3.4 - Option B: premium mood card + icon tiles, slide-down chip subfilters
- Restored the "What are you in the mood for?" card and the six icon tiles
  (Food, Night out, Things to do, Beach day, Stays, Shopping) as two stacked
  rounded panels, matching the founder's reference screenshot.
- Rendered INLINE in normal flow: no sticky positioning, no negative-margin
  edge bleed. This is the correct fix for the v3.2 sideways-shift bug, which
  was caused by a -16px margin with no matching container padding.
- Card is the visual anchor (decorative); the six tiles are the controls.
  Tapping a category slides its subfilters down as rounded chip-bubble pills
  (styled like the Top-10 expandable cards); tapping the same category again
  collapses them. Animated max-height, no pop.
- Two separate boxes as in the reference, not merged. Category taps log
  intent_chip so analytics continue.

## v3.3 - revert to plain category chips, fix sideways layout
- Removed the sticky pinned menu that shifted the page off-axis. Root cause:
  the bar used a -16px bleed margin with no matching container padding, so it
  pushed the column sideways and caused horizontal scroll. Gone.
- Removed the "What are you in the mood for?" header line entirely.
- Removed the six icon/sticker tiles. Categories are now a plain horizontal
  row of text chips (Food, Night out, Things to do, Beach day, Stays,
  Shopping) that scrolls sideways; tap one to browse and reveal its subfilters,
  tap again to clear. Nothing sticky, nothing bleeding to the edges.

## v3.2 - the original menu, pinned (founder direction)
- The original "What are you in the mood for?" card and six-tile grid (Food,
  Night out, Things to do, Beach day, Stays, Shopping) are restored verbatim
  and now render ALWAYS EXPANDED, pinned sticky at the top of home like the
  bottom nav; the feed scrolls underneath a soft gradient fade.
- Tapping a category slides its submenu down (animated max-height, no pop);
  tapping it again clears. Selected sub pill gets the accent fill.
- Premium shell: gradient grid background, soft shadow, the card keeps its
  glow. Category taps now log intent_chip so the analytics stream continues.
- v3.0/v3.1 mood-menu variants superseded, never deployed. lib/categories.js
  and its regression fixtures remain in the repo for future surfaces.
- Assumption to verify live: the sticky bar bleeds edge-to-edge assuming the
  screen's 16px gutter; if your device shows misaligned edges, it is a one
  line margin fix, send a screenshot.

## v3.1 - full discovery restored, two-layer, regression-locked
- The categories removed from home in v2.6 (Nightlife, Beach, Stays, Shopping)
  are back, plus the full second layer the advisor specified: Breakfast,
  Brunch (new subfilter), Coffee, Dinner, Dessert, Drinks, Cheap eats,
  Nightlife, Clubs, Live music, Beach, Outdoors, Museums, Tours, Tourist
  must-dos, Shopping, Stays, Events, Family-friendly, Romantic.
- Two-layer model inside the one mood card: expanded it shows the eight
  intents, then an "All categories" toggle revealing the complete set. No chip
  row, no grid, no stacked systems; premium top, complete discovery.
- Nothing hardcoded: lib/categories.js is the single source of truth with
  declarative actions (browse, subfilter, experience, sheet, screen) run by
  one dispatcher, ready to be reused by Map/Events/other surfaces.
- Regression protection: fixtures now assert every core category id exists in
  the config with a valid action. A redesign that drops one fails the build.
- Analytics: every tap logs intent_chip with layer 1 or 2, so the data will
  show which layer carries discovery.

## v3.0 - the mood card is the menu (v2.6 overcorrection fixed)
- v2.6 consolidated by deletion; the intent was consolidation by promotion.
  The "What are you in the mood for?" card is back as the single premium
  decision controller and the horizontal chip row above it is gone.
- Collapsed, the card asks the question; with an intent active it shows the
  choice ("Food near Orlando · Breakfast") with the subfilter list as its
  subtitle. Tapping expands one panel with the eight intents: Tonight, Food,
  Things to do, With kids, Date night, Rainy day, Hidden gems, Worth the
  drive. Food and Things to do stay stateful, take over the feed, and reveal
  their subfilters inside the same panel; tapping the active intent clears it.
  Tonight, kids, date night and gems route to their surfaces; Rainy day and
  Worth the drive open their ranked sheets.
- One system: no chip row, no six-icon grid, no always-visible meal pills.
  Model is mood selector, intent, subfilters, results.
- Carries the v2.9 detail rebuild and everything prior. Deploy this; header
  reads v3.0.

## v2.9 - detail page rebuild (structure, not polish)
- The detail sheet is restructured to the required order: hero image with the
  name in the image area, address directly under it, ONE metadata row (score,
  rating and reviews, open status or event timing, distance, cuisine or
  category, cost for two), park-admission cue, one action dock (Directions or
  Get tickets as the single orange primary; Save, Like, Not for me, Share as
  quiet icons in the same row), then "Why Wayfind picked this" near the top,
  then What to order / Don't miss, a neutral "More details" card (the old
  expandable), tours, and only then Your note and the tag chips. More like
  this and comparisons stay lower. Debug audit unchanged.
- "Why Wayfind picked this" is now the soul of the page: a new grounded `why`
  field in /api/insight returns one flowing 4-6 sentence paragraph (why picked,
  what reviewers praise by name, what to order, when to go, who it is for,
  when to skip, caveats), evidence-only, empty when thin. Until a fresh
  insight carries `why` (cached ones will not), the section composes honestly
  from the existing grounded fields; the plain-rating fallback remains the
  floor. Never faked.
- Deleted as repeated or generic content: the separate Wayfind verdict block,
  the standalone Insider tip line, the whyPicked box, the cuisine/cost chip
  row (absorbed into the metadata row), the second thumbs row, and the
  placeVibe template card (the last template-copy generator on the page).
- Acceptance mapping: premium top matching the cards (hero+identity), name and
  address grouped, metadata grouped in one row, one action area, verdict and
  tip merged into Why Wayfind picked this, no chip stacks as primary content,
  note and More like this demoted. Verify live; JSX order is covered by the
  compile gate, feel is covered by your eyes.

## v2.8 - permanent two-layer deploy gate
- prebuild now runs check:jsx (real TypeScript/JSX parse of app/page.js, the
  share landing page, and MapView with allowJs, the same parser class Vercel
  uses) AND the 27 trust fixtures. Either failure kills the build before next
  build starts, locally and on Vercel. No manual validation step remains.
- typescript pinned as a devDependency so the gate runs identically on Vercel.
- App code identical to v2.7 (the menu consolidation + JSX structure fix).
  Deploy this instead of v2.7; the 14-point live checklist applies with the
  header reading v2.8.

## v2.7 - v2.6 build fix + validator hardening
- v2.6 never reached production: Vercel's compiler rejected it (the prebuild
  fixture gate passed, compile failed after, prod stayed safely on v2.5). Root
  cause: the consolidation splice removed the mood block's outer wrapper open,
  but that wrapper enclosed the weather card and browse results too, so its
  close 250 lines later became an orphan. Fixed by restoring the single
  wrapper open after the new unified control; structure re-pairs identically
  to the proven v2.5 layout.
- Local validator was silently broken: tsc refused .jsx without allowJs
  (TS6504) and the error filter hid the refusal, so "syntax clean" was a no-op
  and Vercel was the only real JSX parser. Validator now runs with allowJs and
  reads all compiler errors; it reproduced Vercel's exact failure, then
  confirmed the fix.
- lib/package.json declares "type": "module", removing the MODULE_TYPELESS
  warning from every build log (root next.config.js remains CJS, unaffected).
- Carries the full v2.6 menu consolidation unchanged; acceptance mapping in
  the v2.6 entry applies to this build.

## v2.6 - menu consolidation (the actual one)
- Home now has ONE decision system. The v2.1 chips row, the "What are you in
  the mood for?" card, the six-icon category grid, and the always-visible meal
  pills are all removed and replaced by a single primary intent row: Tonight,
  With kids, Date night, Rainy day, Food, Things to do, Hidden gems, Worth the
  drive. Contextual subfilters appear ONLY after Food (All/Breakfast/Lunch/
  Dinner/Coffee/Dessert/Drinks) or Things to do (All/Outdoors/Museums/Family/
  Tours) is selected; tapping the active pill again clears it.
- Acceptance test mapping: initial load shows search, one primary row, weather
  intelligence, Best move hero, feed. No meal pills before Food. No duplicate
  Food control anywhere on home. Selecting Food or Things to do visibly takes
  over the feed (hero and Top 10 modules yield to the intent's results) and
  clears back with one tap.
- Worth the drive is now honest and live: quality-ranked picks 8+ miles out
  from the loaded pool, no distance penalty, labeled as such.
- Staged, not faked: deep per-intent submenus (Toddler friendly, Animals,
  Shows, Date-night facets) wait until each has a real data mapping; inventing
  those filters would put unjustified controls on screen, against the trust
  layer. They will land inside the With kids and Date night screens.
- Night out / Beach / Stays / Shopping remain reachable on the Explore and Map
  screens; home is intents, not a category directory.

## v2.5 - photo compliance + cost guardrail
- Photo author attributions are now captured from Google (normalize keeps
  photoAttrs/photoAttr) and displayed on large-photo surfaces: a caption in the
  detail lightbox and a small badge on the event hero when a venue photo is
  used. Feed thumbnails documented as the remaining gap (docs/GOOGLE_POLICY.md).
- Budget guardrail on venue-photo lookups: max 12 per device per day, cached
  "none" past the cap, and every real lookup logs venue_photo_lookup (with hit
  flag) to the analytics table so cost is visible.
- docs/GOOGLE_POLICY.md records the storage posture: place IDs indefinitely,
  photo URL references (never bytes) for 7 days, no server-side Google content,
  all within Places API (New) temporary caching allowances. Verify wording
  against live policy pages before any audit response.

## v2.4 - event hero: real image, correct size
- The featured "Happening near you" hero now borrows the venue's own Google
  photo when the event has no usable image (one findPlace call per unique
  venue, cached 7 days on-device). Gradient is the last resort, not the look.
  This closes the long-deferred venue-photo item; repeated requests = cost
  approved.
- Hero height restored to 176 so a two-line title, venue line and CTA no longer
  collide with the TONIGHT pill.

## v2.3 - surface consistency (from the v1.8-screenshot review)
- Context: the review graded a stale v1.8 deploy; four of its seven issues were
  already fixed in v1.9-v2.2 (Picks-page tags, detail header dead space, Save as
  primary, event chip). Two were real in current code and are fixed here.
- cuisineLabel identity rule (lib/dining): real *_restaurant cuisines always
  win, and cafe/bakery/dessert labels apply only when that is plausibly the
  identity (name, leading types, or no restaurant/bar identity). Bocas can
  never read as "Café" on any surface; true cafes keep their label. This was
  the one genuine cross-surface identity gap the v2.0 gate did not cover.
- heroReason (lib/ranking): paid theme/water parks are never framed as
  "Great weather to get outside" or beach moves; the hero also carries a
  "May require park admission" pill when its pick is a paid park.
- Event details: when the event has a ticket URL, Get tickets is the primary
  CTA with Directions secondary; the venue-hours toggle now reads neutral
  "Venue hours" instead of "Venue closed"; the AI receives an event context so
  tips help someone attending (arrival, parking) and never warn that the venue
  is "currently closed."
- Map/list sort labels use Wayfind language: "ranked by fit" / "nearest first".
- Fixtures extended to 27 (cuisine identity + hero copy) and still gate every
  deploy via prebuild. Deferred with reason: map pin clustering (MapView needs
  runtime testing; a dedicated map pass).

## v2.2 - instrumentation, CI gate, empty states
- Analytics completed across the funnel (Supabase "events" table, fails soft,
  anonymous device id): intent_chip taps (incl. empty-state fallbacks),
  detail_open with resolved identity and blocked-tag count, directions, ticket
  taps, tour taps, dice, and search, joining the existing save, like, dislike,
  share, share_open, offer_impression, events_none and places_none events.
- CI deploy gate with zero infrastructure: "prebuild" runs
  scripts/test-tags.mjs before every next build, so Vercel deploys fail if any
  trust fixture regresses. Trust bugs now block shipping.
- Events empty state: when tonight has nothing, the section says so and offers
  Date night, Rainy day and Hidden gems instead of leaving dead air.
- docs/COVERAGE.md: the weekly Orlando coverage ritual with a decision rule, so
  adapters are only built for repeated meaningful misses.
- Already covered, no build needed: subtle trust cues (v2.0) and the composed
  "why this pick" (hero heroWhy + grounded whyPicked on detail).
- Sequencing confirmed: no Supabase inventory work until v2.1/v2.2 metrics show
  which intents carry the product.

## v2.1 - intent-first homepage
- Intent chips now sit at the top of the home feed: Tonight, With kids, Date
  night, Rainy day, Cheap eats, Hidden gems, Must-dos, Open now. Each opens an
  existing surface (events, family, romantic, value, gem experiences) or a
  ranked quick list built from already-loaded data. Zero new fetching.
- Decision before lists: the "Best move right now" hero and experiences now
  render ABOVE the two ranked list cards instead of below them.
- Renames: "Your next move" is now "Best move right now"; "Top 10 food near
  Orlando" is "Best places to eat right now"; "Top 10 things to do near
  Orlando" is "Best things to do today". Repeated city dropped (header has it).
- Weather is now intelligence, not a widget: smaller, with a "Good for indoor
  dining and covered patios" style line derived from the real numbers.
- Bottom spacer so the last card never hides under the nav.
- Residual for v2.2 (logged, not forgotten): the mood card still renders above
  the hero, and lifting the hero above weather needs block-boundary refactoring
  in the 6k-line home render that I will not do blind. Worth the drive and
  Food + experience chips wait on farther-radius fetch and the destinations
  feature respectively.

## v2.0 - global trust layer
- New lib/tags.js: one primary identity per place (dining, theme park,
  attraction, museum, park, hotel, shopping, event) resolved from Google types
  with restaurant-beats-tourist_attraction precedence, plus a category
  compatibility allowlist. Badges must now pass BOTH the v1.9 evidence gates
  and the compatibility gate.
- Regression tests: scripts/test-tags.mjs runs the acceptance fixture list
  (Diagon, Bocas, cafe, bakery, park, theme park, T-Rex, SeaWorld, Disney
  Springs, event labels, missing price). 20/20 passing at build time; run
  "node scripts/test-tags.mjs" after any tag/identity change.
- Trust audit mode: add ?debug=1 to the URL (or set localStorage wf_debug=1)
  and every place detail shows identity, Google types, candidate badges, shown,
  blocked with deterministic reasons, park-admission flag, and which AI fields
  returned vs hidden.
- "May require park admission." cue on true theme/water/amusement parks only.
- Venue-appropriate section labels: What to order (dining), Don't miss
  (attractions/theme parks/museums), What to see (parks), Know before you go
  (events). The AI must-try prompt now matches the venue kind.
- Freshness cues where the source is truly known: "Hours from Google." in the
  hours panel and "Event time from the venue listing." on event details.
- Verdict prompt now attributes taste/service claims to reviewers while
  staying decisive.
- Deferred with reasons: numeric confidence scores, multi-source arbitration,
  and a review-clustering pipeline. Single structured source today (Google
  Places + event APIs); the gates provide the trust, the floats would be
  ceremony. Revisit when a second data source lands.

## v1.9 - trust and hierarchy pass
- Fixed wrong tags at the definition level. "Nature & trails" matched theme
  parks via an "_park" substring; nature and outdoor now use exact Google type
  tokens. Cuisine badges (Steakhouse, Bakery & sweets, Coffee) now require the
  place's real cuisine identity or a name-evident match; noisy secondary type
  tokens on a full restaurant no longer mint them.
- One global CTA order on the detail sheet: Directions is always the primary
  orange action, Save is secondary with saved state, share third. No more
  swapping based on open status.
- Removed the dead header zone: the back button now floats over the hero photo
  instead of occupying its own empty bar.
- Core UI emojis replaced: like/dislike are SVG icons on cards and detail,
  medals are clean rank chips, sparkles and section-header emojis removed.
  Category tab icons and weather art left for the homepage pass.
- Share landing pages now state "Wayfind is an independent guide, not
  affiliated with the venues listed" (GetYourGuide-style compliance hygiene).

## v1.8 - credibility pass (P0 from product review)
- Event vs venue status separated. An event detail now leads with event timing
  (Tonight / Tomorrow / date / Ended) instead of "Venue closed"; venue hours are
  a small secondary tap. Filler evidence line replaced with the actual rating.
- Events with no image get a designed fallback hero, never a blank media area.
- Category gating: Breakfast and Coffee searches only surface places with real
  breakfast/cafe evidence in their Google types or name. Falls back to the full
  list only when an area is too sparse (under 5 gated results).
- Hidden gem is now earned, not decorative: rating 4.6+, 40 to 600 reviews,
  applied consistently in all three places the badge is computed.
- List average costs are labeled "Est. avg" since they mix real and estimated
  price tiers.
- Deferred deliberately: central typed engine rewrite, page-level exposure
  registry, per-card evidence insights (AI cost per card), and debug payloads.
  Sequenced next; not jammed into one untestable pass.

## v1.7 - intent-aware ranking + open status
- Fixed the core ranking bug: search results now run through the conditions
  engine, which demotes closed places and rewards open + meal-time relevance.
  Closed spots no longer rank above open ones for a "now" search like breakfast.
  (The open-now logic already existed in dayFit; the search feed just never used
  it.) The featured boost also now applies in search results.
- Added Se7en Bites and White Wolf Cafe as local favorites (bounded lift).
- Added a "Featured" chip on boosted places so promotion is transparent, not a
  silent algorithm change.
- Note: per-card grounded copy (Best for / Go when / Skip if on feed cards, not
  just the detail sheet) is a later pass; it carries an AI call per card.

## v1.6 - version in header, save state, featured boost
- Build version now shows in the header next to the location, so it is obvious
  which build is live on Vercel.
- The detail Save button now reflects saved state (filled heart, "Saved") so a
  favorited place reads as saved.
- Added an owner "featured" boost (WAYFIND_FEATURED): listed places get a
  ranking lift and surface higher in the feed and Top 10. Seeded with T-Rex Cafe.
  Bounded on purpose (a lift, not an absolute pin) to protect ranking trust.
- Reminder: like/dislike were added in v1.2, "known for coffee" removed in v1.4.
  If you still see them, you are on an old deploy.

## v1.5 - your own notes/reviews on any place
- Added a "Your note" field to every place detail. Write your own review or
  notes; it saves on your device and reappears whenever you open that place.
- This is the global mechanism for keeping your reviews. It does not change the
  AI recommendation and is not a public review (both separate if wanted).
- Saved on this device only for now (localStorage). Cross-device sync would need
  Supabase, which is a follow-up.

## v1.4 - detail sheet uses grounded intelligence (pass 1 of 2)
- The top of the place detail now uses the review-grounded /api/insight, not the
  decisionReason template. Shows: Wayfind verdict, Best for, Go when, Skip if.
- "Why Wayfind picked it" now shows the grounded whyPicked and hides entirely
  when reviews do not support it. The template body (source of "known for
  coffee") is removed from the detail experience.
- Extended /api/insight compact mode to return bestFor, goWhen, skipIf, whyPicked
  (grounded in reviews, empty when unclear, never fabricated).
- Safe fallback for API miss/loading: a plain "A highly reviewed nearby option
  with a strong rating." No "known for X" clause.
- Layout kept minimal this pass on purpose. Pass 2 is the visual redesign:
  hierarchy, border reduction, orange cleanup, comparison-card polish.

## v1.3 — detail sheet: save fix, back button, what to order
- Fixed the save bug. Save now saves in one tap and stays on the place with a
  toast, instead of closing the sheet and dumping you to home.
- Back button. The X is now a back arrow, and the phone/Safari back button (and
  swipe-back) closes the sheet instead of leaving the app.
- "What to order" up top. The review-grounded top dishes/drinks (mustTry) now
  load on open and show prominently, not only after expanding. Added a review-
  grounded "pairs well" line (needs deploy to populate).
- These read from the existing AI insight route, which is grounded in real
  reviews, so no invented dishes.

## v1.2 — detail sheet: clarity and feedback
- Added the missing like and dislike buttons to the place detail sheet. Save,
  directions and share were already there; the thumbs were not.
- Stopped wrong "known for" descriptors (e.g. "known for coffee" on T-Rex). The
  deeper fix, real decision reasoning read from reviews, is the AI pass.
- Detail hero is now a clean full-width photo/carousel, no partial side sliver.
- Renamed for confidence and value: "Could be a better fit" to "Worth comparing
  nearby" (calmer subtitle, no "beats this one" framing), "More tips, videos &
  details" to "See photos, tips & details", "Events near here" to "What's
  happening nearby".
- Toned down the orange in comparison cards (orange reserved for brand and
  primary actions).

## v1.1 — real "things to do" on home
- Fixed the repetitive home cards. The two cards were both drawing from the
  food-only home feed, so "Top 10 near you" and "Top 10 food" were nearly
  identical. Home now shows two distinct cards: Top 10 food and Top 10 things
  to do.
- Top 10 things to do pulls a real attractions set for the area (theme parks,
  aquariums, zoos, landmarks, districts), fetched once and cached ~24h per area
  to keep Google costs low. Big attractions like SeaWorld and Disney Springs
  surface here from the attractions search, not from the restaurant feed.
- Note: T-Rex Cafe and Amazonia are themed restaurants, so they correctly stay
  under Food. Cross-listing themed dining as an "experience" is the separate
  destinations feature.

## v1.0 — consolidated baseline
Everything built to date, rolled into one version.

- Itinerary trip planner. Saving a place auto-files it into a city trip. Reorder
  stops, add notes, mark visited, and open a Google Maps route for the trip.
- Conditions-aware ranking. Recommendations factor weather, day, and time of day.
  The "Your next move" hero is the single best move for right now, not a rotation.
- Cuisine as the card label. Instead of a generic "Food" tag, the card names the
  cuisine when Google has it, and tapping it opens a Top 10 of that cuisine nearby.
- Two ranked home cards: "Top 10 near you" and "Top 10 food near you." Both are
  collapsible and show the average cost for two.
- Experiences. The featured place is deduped across cards so none repeats. The
  stack is ordered by the experiences this user saves most. Each card shows the
  spot count and average cost and opens the full ranked list.
- Hero cards. Solid readable fill instead of a see-through gradient, tighter text
  layout so nothing overlaps, reduced height.
- "More like this" on a place. Surfaces nearby spots that share its experience,
  matched on category, experience tags, cuisine, price, and feel.
- Cost-for-two and cuisine come from real Google data. No invented prices.

## Pending (not in 1.0)
- Grounded AI copy: real insider tips and specific "better fit" reasons read from
  each place's actual reviews. Needs deploy and testing (no API access in build).
- Deep "More like this": read candidate reviews and search broadly to find the
  same experience anywhere. Real API cost per tap; needs your go and testing.
- Global demand ordering across all users (needs a shared Supabase table).
- Destinations/districts as their own type (see Disney Springs discussion).
