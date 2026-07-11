## v5.58 - premium redesign, Phases 4-6 (calm onboarding, a11y polish, crawlable homepage)
- Onboarding de-arcaded (Intro.js): the pulsing halo + layered orange glow
  bloom are gone -> a quiet elevated dialog with a single subtle scale-in;
  the emoji mood grid is now line-icon tiles; the CTA is solid accent with
  dark text; the greeting wave emoji is gone. Skip is a real 44px button.
- Focus: global :focus-visible ring, and tabindex="-1" dialog containers
  no longer show a ring around the whole panel (interactive children keep
  theirs). Dialog semantics + one-interruption coordinator verified, not
  re-forked (prior G4/audit work); a11y/screens/modals e2e all pass.
- Search submit de-glowed (gradient+shadow -> solid accent, dark glyph) and
  relabeled aria-label "Search"; header icon buttons 36/34 -> 40 toward the
  44px target; intro controls 40/44/48.
- Phase 6: the shared footer now carries crawlable category-landing links
  (/restaurants/sarasota, /things-to-do/orlando, /beaches/sarasota,
  /nightlife/tampa — all verified 200), closing the one gap in the
  server-rendered homepage's no-JS crawlable contract (single descriptive
  H1, explanatory copy, 9 guides, 7 cities, map CTA, canonical, OG, JSON-LD
  all already present). No indexed URL changed. check-seo still passes.
- Full wrap-up (before/afters, emoji->icon inventory, image-test results,
  width/zoom matrix, owner-review flags incl. the orange/champagne accent
  pairing) in REDESIGN.md.

## v5.57 - premium redesign, Phase 3 (images that always work)
- The image fallback chain (skeleton -> image -> branded artwork) as PURE
  logic in lib/imageState.js, unit-tested exhaustively by
  scripts/test-image-fallback.mjs (prebuild): every (src, errored, loaded)
  combination maps to one of three states, and a dead/absent URL can never
  resolve to "image" -- so a card is never a blank rectangle or a
  broken-image glyph. FallbackImg (home.js) now shows a shimmer skeleton
  while loading and BrandedImageFallback (kit.js) on failure.
- Real image-pipeline bug fixed: event card images come from s1.ticketm.net
  and Viator's CDNs, which were absent from the CSP img-src allowlist —
  they load today only because the CSP is Report-Only and would break the
  moment it flips to enforcing. Added the live host (Ticketmaster, proven)
  and the Viator partner image CDNs to next.config img-src; check-design
  guards the Ticketmaster host so it can't regress.
- Verified: a fixture event with a dead image URL renders the branded tile,
  no broken <img> (design-after-p3/events-deadimg-390.png).

## v5.56 - premium redesign, Phase 2 (homepage restructure, no dead zones, map fallback)
- Desktop grid widened 1040 -> 1280 (spec's ~1280 target) and the home
  two-column layout to 1240 (left feed 780, sticky sidebar 400). Root
  cause of the ~400px side dead zones: the two-column row was a flex ITEM
  in a flex parent, so it shrank to content width (840px) and floated
  left-of-center instead of filling 1240 — fixed with width:100%.
- Map slot no longer shows Google's raw "Oops! Something went wrong" gray
  box on a load/auth failure (MapView.js): catches both the loader
  rejection (missing key/network) AND gm_authFailure (invalid key) and
  renders an intentional branded preview — the Wayfind pin on the map
  tone, honest copy, with the "Full map" action still on top. Never a
  half-loaded placeholder.
- Fixed CSS-grid track overflow on every card grid (discovery tiles,
  sidebar events, events screen): "1fr 1fr" lets tracks grow past the
  container to fit min-content, which clipped the sidebar event cards at
  the viewport edge on desktop -> "repeat(2, minmax(0, 1fr))".
- Verified: width matrix 320/390/768/1024/1440 + zoom200/400 all clean, no
  horizontal document scroll; mobile unchanged; before/after in
  design-after-p2/.

## v5.55 - premium redesign, Phases 0-1 (baseline + design system)
- REDESIGN_BASELINE.md: full shared-layer inventory + screenshot matrix
  (320/390/768/1024/1440 + zoom equivalents, dark-only). Findings: no
  token scale (only colors), emoji-as-chrome everywhere, ~13 competing
  CTAs and ~400px of dead side-margin on desktop 1440, arcade motion
  (bob/pulse/spin/fireworks) with zero prefers-reduced-motion, Google
  Maps raw error box as the map "fallback", and a literal em-dash copy
  bug rendering in the discovery grid.
- Phase 1 tokens in components/kit.js: TYPE (eyebrow/display/title/body>=16/
  meta>=14), SPACE, RADII, SHADOW, MOTION (150-220ms one curve, no loops),
  RATIO, FOCUS, TARGET (44px), CHAMPAGNE (reserved for giveaway/premium --
  the orange+champagne pairing is FLAGGED FOR OWNER REVIEW, not decided).
- One icon language: new Icon() line-icon set + NavIcon (moved from home.js
  to kit.js so nav, CategoryMenu, and the community sheet all draw from it).
  Emoji-as-chrome replaced on the discovery grid, "Find my vibe" button,
  event category badges + section headers + hero badges + EventArt tiles,
  community-sheet category grid, and the empty-state category glyph. Emoji
  kept only as content (weather, place pins, the user's list-icon picker,
  Critter mascot).
- GlowPin de-arcaded (halo rings + radial bloom + drop shadow removed --
  now a quiet mark). Global prefers-reduced-motion guard + consistent
  focus-visible ring added in layout.js. Fixed the em-dash JSX-text bug.
  New scripts/check-design.mjs (prebuild) locks tokens+icons imported,
  reduced-motion present, and no unicode-escape leaks into JSX text.

## v5.54 - events pipeline integrity, Phases 1-4 (default-deny: no destination, no card)
- lib/eventsPipeline.js: one normalized contract enforced at the API
  boundary -- validation (past/cancelled/malformed/unsafe-URL/fabricated
  search-URL excluded), cross-provider dedup on title+venue+start (was
  name+date only, which merged different venues and double-counted
  matinees), geo guard, then a DESTINATION CHECK: every returned event
  carries dest/destKind (internal /events/[city]/[slug] page preferred,
  validated external URL otherwise) or is excluded. The returned list IS
  the usable list; usableCount ships in the response.
- app/api/events/route.js: every provider now runs behind its own 6s
  deadline (one hung provider can no longer stall or erase the others),
  reports health (ok/timeout/latency/received) into an
  events_provider_health log line, passes Ticketmaster's
  dates.status.code through (cancelled/postponed events were previously
  never checked), and PredictHQ's fabricated google.com/search
  destinations are gone -- URL-less events are excluded, not faked. The
  response counts field is now post-validation per-source (was raw
  pre-dedup provider totals, 346 vs 222 in the Phase 0 probe).
- app/events/[city]/[slug]/page.js: internal event detail page,
  server-rendered from a fresh by-id provider lookup (lib/eventResolve.js:
  Ticketmaster by-id API, LibCal iCal UID scan, staples recompute) with
  Event JSON-LD, venue/Directions, source attribution, explicit
  cancelled/postponed state, and a branded 404 via notFound() for ids
  that no longer resolve -- never a silent redirect to /. Implements the
  /events/[city]/[event-slug] leg of the audit prompt's URL scheme.
- Phase 2 card semantics on every surface (Events grid, For You hero +
  rail, Community grid, Map preview, Detail venue-events): the title/
  image/body are ONE semantic <a> to the resolved destination; venue
  lookup, tickets, and dismiss are separate controls outside that link.
  The Events-screen card's natural tap target was previously wired to
  NOTHING; homepage/map cards routed through a fallible Google venue
  lookup. Destination-less events are also filtered at client state entry
  (belt-and-braces), and the Detail sheet's venue-events card no longer
  pads "at this venue" with unrelated nearby events when the venue match
  is empty.
- Phase 3 routing: /events (+ ?date=&cat= filter params) stays in the
  address bar while the Events view is open -- shareable, reload-safe,
  Back/Forward work, aria-current already on the nav. GoScreen forwards
  query params through the ?go= handoff.
- Counts equal cards: the date chips and "All" chip count the SAME
  collapsed, category-filtered list the grid renders (was pre-collapse).
- Ticketmaster affiliate param moved to lib/affiliates.js ticketOutUrl()
  (single source; the server detail page appends the identical value).
- Tests: scripts/test-events-contract.mjs (prebuild) covers every
  exclusion rule, dedup, provider-timeout isolation, count integrity on a
  mixed fixture, DST/timezone pass-through, and the by-id round trip;
  tests/e2e/events.spec.js (audit:regression) fixture-injects /api/events
  and locks in: destination-less event never renders/counts, count equals
  cards, one-semantic-link card with controls outside, keyboard Enter
  navigation, /events URL survival + refresh + Back/Forward + filtered
  share, detail-page 200 and invalid-id 404.

## v5.53 - events pipeline integrity, Phase 0 (diagnosis only, no product change)
- EVENTS_PIPELINE_DIAGNOSIS.md maps the full pipeline: 9 providers in one
  aggregator route (only Ticketmaster + Manatee LibCal + curated staples
  configured in prod today), 4 render surfaces (Events screen, For You
  hero/rail/community grid, Map events mode, Detail venue-events), plus a
  dead zero-caller /api/ticketmaster route and dead eventCounts state.
- Live measurement (Parrish + Orlando probes): today's DATA is clean --
  every displayed event has a real URL, future date, no cross-provider
  dupes (250/250 usable by those measures in both probes). The damage is
  in the interaction layer: the Events-screen card's natural tap target
  (title/image/body) is wired to NOTHING, and every other surface routes
  the primary tap through a fallible runtime Google venue lookup
  (openVenue -> "Could not find this venue" toast) instead of the
  validated URL the event already carries.
- Counts don't match cards: date-chip/"All" counts are computed on the
  pre-recurrence-collapse list while the grid renders the collapsed one;
  the API's counts field is raw pre-dedup provider totals (346 vs 222
  actually served in the Parrish probe).
- Five latent default-allow failures, each one env var away from live:
  no cancelled-status handling (TM dates.status.code never read),
  PredictHQ destinations fabricated as google.com/search URLs, empty-URL
  providers unguarded (renders href=""), no per-provider timeout, dedup
  key ignores venue.
- Routing confirmed broken for sharing: /events redirects to /?go=events
  and history.replaceState strips it -- address bar shows "/" while the
  Events view displays; refresh loses the view; no shareable event URLs;
  the audit prompt's /events/[city] URL scheme is not built (Phase 3 here
  will implement it, not fork one).

## v5.52 - booking-CTA integrity, Phases 1-5 (default-deny resolver + persisted offers + single render contract + self-healing cron + golden tests)
- Re-checked the Viator key before starting (`?probe=1`): still 401,
  unchanged since Phase 0. Rather than block indefinitely on owner action,
  built and unit-tested the whole architecture against fixtures -- the
  spec's own Phase 5 acceptance criteria are written as fixtures anyway
  (Riverwalk -> no button, a genuine venue-specific product -> button, a
  delisted product -> suppressed, a generic high-fan-out product -> never
  primary). The one thing still genuinely blocked is calibrating the
  confidence threshold against real Viator response data.
- lib/verifiedOffers.js: the hard invariant (isLiveEligible) and the one
  constructor (buildVerifiedOffer) that can produce a VerifiedOffer --
  commissionable && bookableNow && confidence >= 0.72 && entityMatch >=
  0.4. supabase/verified-offers.sql persists these (service-role write
  only, public read of status='live' rows only).
- lib/bookingResolver.js: scores every candidate on entity match (place
  name tokens minus region tokens -- a product that only repeats the city
  gets zero credit, the literal Bradenton Riverwalk fix), category match,
  specificity (1/fan-out, sourced from verified_offers' own history), and
  geo (not scored -- Viator's freetext response doesn't carry
  coordinates in the fields this codebase parses; neutral 0.5 rather than
  a guessed field name).
- app/components/BookingCTA.js: the one component every booking-CTA
  surface renders through (Detail sheet's primary button, commission
  disclosure, tours card list) -- extracted verbatim from the previous
  inline JSX, UI unchanged. /api/viator/tours and /api/viator/go now call
  the scored resolver instead of a city-substring filter.
  scripts/check-booking-cta.mjs (wired into prebuild, verified with a
  negative-control test) enforces nothing else may construct a booking
  href from raw Viator data or duplicate the confidence threshold.
  Supersedes the pre-existing, never-wired-in scripts/check-cta.mjs.
- app/api/cron/verify-offers/route.js: previously-live offers expire
  after 7 days and get re-checked; no-longer-valid ones are suppressed
  proactively instead of waiting for a visitor to revisit that exact
  place. CRON_SECRET-gated, fail-closed. This is a THIRD Vercel cron job
  -- confirm your plan's cron limits before this deploys.
- scripts/test-booking-resolver.mjs (wired into prebuild): golden tests
  for all four acceptance fixtures above, including a controlled fan-out
  A/B where the identical product/place pair flips from live to
  suppressed purely on fan-out count.
- Full writeup: BOOKING_INTEGRITY_DIAGNOSIS.md, "Phase 1-4 implementation"
  section. Still blocked on the owner: the Viator key, and (new) threshold
  recalibration against real traffic once it works.

## v5.51 - booking-CTA integrity, Phase 0 (diagnosis only, no render change)
- No product/UI logic changed. This is the diagnose-before-building phase
  of a default-deny rework for the "Tickets & tours" booking CTA (today's
  free-text-search + city-substring-match model can surface a generic
  regional tour as if it were venue-specific — the "Bradenton Riverwalk"
  failure mode).
- Full diagnosis in BOOKING_INTEGRITY_DIAGNOSIS.md: the exact code path
  (app/home.js's viaTours effect -> /api/viator/tours ->
  app/components/sheets/Detail.js's card list, plus the sibling
  /api/viator/go resolver), and the honest finding that there is currently
  no confidence threshold at all -- only a place-type/category gate and a
  boolean city-name substring match.
- Bigger finding, not anticipated by the brief: VIATOR_API_KEY in Vercel
  production is rejected by Viator's own API with 401 on every request
  (confirmed via the existing /api/viator/go?probe=1 diagnostic, 3x
  consistent). The booking-CTA feature is currently dark site-wide --
  every visitor sees a generic search link, never a specific product,
  correct or incorrect. This blocks measuring real match-quality numbers
  and must be fixed (owner: Viator partner console) before Phase 1 can be
  built against real data instead of guesses.
- Temporary structured logging added to both Viator routes
  (booking_integrity_diag lines in Vercel function logs: query, region
  tokens, raw/kept/rejected product titles, final decision) so real
  numbers are available the moment the key works, without another deploy.
- Also noted, connected but out of scope here: scripts/check-cta.mjs (a
  pre-existing, already-failing guardrail) only inspects the "shell"
  concat (home.js + kit + screens/sheets) and never looks at
  lib/affiliates.js, where the resolver call it's checking for actually
  lives now -- relevant to Phase 3's CI-enforcement requirement, not
  fixed in this commit.
- Per the brief's own instruction: stopping here to report before Phase 1
  (the persisted VerifiedOffer schema) gets built.

## v5.50 - PostHog now initializes on every route, not just the homepage
- Root cause of "zero events ever captured": PostHog's init lived inside
  app/home.js's PageInner, which is rendered ONLY by app/page.js ("/").
  22 of the app's 23 page.js routes — every guide, city/culture page,
  /florida hub, /privacy, /terms, /about, and the /events, /map, /coupons
  bridge pages — never mounted it, so they generated zero events by
  construction, independent of CSP or key validity.
- CSP was already correctly configured and was NOT the blocker: script-src
  had us-assets.i.posthog.com, connect-src had both us.i.posthog.com and
  us-assets.i.posthog.com, worker-src had blob: — verified directly
  against next.config.js before touching anything. No CSP changes in this
  commit.
- New app/components/PostHogProvider.js, mounted in the root layout
  (app/layout.js) so it wraps every route by construction. Init uses
  PostHog's current dated-defaults API: `defaults: "2026-05-30"` (handles
  SPA pageview capture on history change — no hand-rolled
  usePathname/useSearchParams $pageview component, that's the older
  pattern) and `person_profiles: "identified_only"` (Wayfind traffic is
  mostly anonymous; only real sign-ins should create a billed person
  profile). api_host is hardcoded to https://us.i.posthog.com since
  NEXT_PUBLIC_POSTHOG_HOST doesn't exist in Vercel and isn't read anymore.
  The old home.js-only init (capture_pageview/autocapture flags, the
  NEXT_PUBLIC_POSTHOG_HOST fallback) is removed — one init site, not two
  with different configs.
- The existing in-app `screen_view` custom event (home.js, fires when the
  SPA's internal `screen` state changes without a URL change) is untouched
  — it's a real gap `defaults`-based $pageview capture can't fill, not a
  competing pageview mechanism.
- No @vercel/analytics present (confirmed, nothing to flag). Reverse proxy
  (/ingest rewrite) deliberately NOT built yet — shipping the simple
  version first per explicit instruction, to change one variable at a time.
- Verified via a real `next build` + `next start` (production mode, not
  dev): the compiled root-layout chunk containing the init code is
  referenced identically across /, a /florida hub, a Sarasota
  things-to-do page, /privacy, a guide page, and /about.
- NOT yet verified: a real event landing in the PostHog dashboard from the
  actual deployed production site. posthog-js does not reliably send from
  localhost/dev, and a local production build isn't the live deployment —
  only the owner can confirm real capture, by deploying this and checking
  PostHog's Activity/Live Events view.

## v5.49 - sign-in is required before any favorite/save/like can persist
- Site-wide behavior change: a signed-out tap on any favorite/save/like/
  dislike/bookmark/list/trip control no longer writes anything — not to
  React state, not to localStorage, not to Supabase. It opens the sign-in
  sheet instead. Previously these actions succeeded locally for everyone
  and only the cloud (Supabase) mirror was sign-in-gated; local-only
  favoriting for anonymous visitors is now gone entirely.
- One new gate, `requireAuth()` in PageInner (app/home.js), is the single
  source of truth — every write path calls it first, before any state
  mutation: quickSaveFavorite, toggleLike, toggleDislike, toggleHookLike,
  saveHookList, onHookHeart, addShared, toggleSaveCoupon, createList,
  saveToList, deleteList, renameList, plus the itinerary/trip mutations
  (note/move/reorder/mark-visited/remove) and the "+ New list" trigger,
  both wired through `ctx.requireAuth` into the extracted Itinerary.js and
  Saved.js components. Reuses the existing `user`/`setAuthOpen` convention
  already used by the community-comment flow — no second auth mechanism.
- Race-condition fix included: session restore is async, so a new
  `authReady` flag (true once the initial `getSession()` check resolves,
  success or failure) means a returning signed-in user's very first tap
  can't be wrongly told to sign in before their session has loaded.
- Server-side layer: there is no Next.js API route for these writes (they
  go straight from the client to Supabase), so Postgres RLS is the real
  server boundary — and it was already correctly configured in both
  supabase/schema.sql and the older supabase-schema.sql (`auth.uid() =
  user_id` on every insert/update/delete for saved_places and likes, in
  both schema variants). No SQL changes were needed; this is now enforced
  by scripts/check-favorites-auth.mjs instead of just asserted.
- New scripts/check-favorites-auth.mjs (in prebuild): a static contract
  check asserting requireAuth() gates all 12 core write paths, the
  itinerary/list ctx wiring, and the RLS policies — fails the build if
  the gate is ever stripped from any of them. Verified against a live
  negative control (temporarily removed one gate, confirmed the check
  caught it) before shipping.
- New tests/e2e/favorites-auth.spec.js: the one favoriting surface
  reachable without live place/coupon data in this suite (custom-list
  creation via "+ New list") is exercised end-to-end signed-out — auth
  modal opens, create-list sheet never appears, no localStorage write,
  state survives a refresh unchanged. Full cross-surface coverage is the
  static check's job (see its own header comment for why).
- Custom lists (createList/saveToList/deleteList/renameList) and trips
  have no Supabase table at all — always local-only regardless of sign-in
  — so for those, the client-side gate is the sole protection; there is no
  server round-trip to add a check to.

## v5.48 - map, experience picks, and the welcome intro leave the monolith (G4, decomposition complete)
- The map shell (screen === "map"), the experience-badge picks screen
  (screen === "experience"), and the welcome intro overlay (introOpen)
  now live in app/components/screens/Map.js, Experience.js, and
  app/components/sheets/Intro.js, loading as their own chunks via
  next/dynamic({ ssr:false }). `screen` always initializes to the literal
  "suggested" (deep links flip it in a useEffect, never synchronously),
  and `introOpen` starts false, so this is the same safe pattern as every
  earlier phase.
- Two more exclusive helpers moved with their screens: `tasteBoost`
  (map's default ranking blend) and `IntroIcon` + its `INTRO_PATHS` icon
  data table (the intro overlay's only consumer).
- Every boundary was independently re-verified against the file (not just
  taken from the inventory agent's report) before any code moved, given
  the off-by-one lesson from G3 — zero syntax errors on the first
  check:jsx run this time.
- This closes the home.js decomposition (G0-G4): home.js started this
  project at 8,559 lines and one 1,133-line render function; it now sits
  at roughly 6,400 lines with 15 focused screen/sheet components extracted
  behind lazy, idle-prefetched dynamic imports and a single ctx prop
  carrying state/callbacks down from PageInner. All content guardrails
  (cards/copy/cta/ux/moment/auth/meals/lodging/radius/canon) keep passing
  unmodified throughout, because G0 pointed them at the concatenated shell
  instead of home.js alone.

## v5.47 - the detail sheet leaves the monolith (G3)
- The place-detail bottom sheet — Wayfind's core, most-used UI surface,
  ~630 lines — now lives in app/components/sheets/Detail.js and loads as
  its own chunk via next/dynamic({ ssr:false }). `detail` starts null, so
  this is the same safe pattern as every other extraction.
- Five helpers used exclusively by the detail sheet moved with it:
  galleryBtn, InfoChip, WorthTheDriveWidget, compass, insightSane.
  betterAlternatives/similarPlaces/relatedPicks stayed in home.js instead
  (they close over the module-scope EXPERIENCES table) and flow through
  ctx like everything else, avoiding an entanglement that would have
  forced EXPERIENCES itself into kit.js for no real benefit.
- This extraction got extra scrutiny beyond the ctx pattern: the free-identifier
  list was built three independent ways (an inventory agent, a manual
  line-by-line read that caught one gap the agent missed —
  `insightFullLoading` — and a script-based token diff against every
  declared/imported/ctx name) before touching home.js. Caught and fixed
  two off-by-one extraction bugs (InfoChip and insightSane were both
  missing their closing braces after the initial cut) via check:jsx
  before they ever reached a commit.
- Known gap, documented rather than papered over: test:e2e builds with
  placeholder Maps/Supabase keys, so no place data loads and `detail`
  never actually opens during automated tests — same limitation already
  noted in tests/e2e/deeplinks.spec.js for search results. The static
  verification above is what stands in for runtime coverage here.
- home.js: ~7,510 -> ~6,820 lines.

## v5.46 - four sheets leave the monolith (G2)
- hookDetail (the themed Best-of/Top-5/Skip list sheet), the account sheet,
  the app-tile menu sheet (6 sub-states: menu/community/explore/pick/
  experiences/weather), and the auth sheet (sign in/up + the separate
  password-recovery-link sheet) now live in app/components/sheets/* and
  load as their own chunks via next/dynamic({ ssr:false }). All four are
  user-triggered only (dice/avatar/hamburger/sign-in taps) so SSR never
  paints them.
- Same ctx pattern as G1: sheets are render-only, every hook (including
  the useDialogFocus calls for account/auth/recovery) stays in PageInner.
  sheetBg/sheet (the shared sheet style objects) moved into kit.js since
  every sheet needs them; sheetDragStart/Move/End stay PageInner-local
  (they close over a ref) and pass through ctx.
- All 4 sheet chunks join the existing G1 idle-prefetch list, so the first
  tap on any sheet trigger never waits on the network.
- home.js: ~7,950 -> ~7,510 lines. check-auth (the auth flow's own
  guardrail) still passes untouched, proving the extraction preserved the
  forgot-password link, recovery handler, and new-password sheet contract.

## v5.45 - six screens leave the monolith (G1)
- Surprise, Coupons, Saved (all three branches), Itinerary (both branches),
  Shared, and Events (+EventArt/EventCard, its only consumers) now live in
  app/components/screens/* and load as their own chunks via
  next/dynamic({ ssr:false }). Safe by construction: `screen` initializes
  to "suggested" and these render only on user action, so SSR never paints
  them and hydration cannot mismatch.
- Screens are render-only. Every hook stays in PageInner; state, callbacks,
  and the module-scope helpers the screens render with (PlaceCard,
  CategoryMenu, StateBadge, Loader, FallbackImg, AreaInsight, event
  helpers...) arrive through one `ctx` prop. Zero hook-order risk.
- All six chunks are prefetched at first idle (requestIdleCallback, 2.5s
  fallback), so the first tap on the dice, Favorites, or Events never
  waits on the network; until then each shows the standard Loader.
- New tests/e2e/screens.spec.js: drives every extracted screen through the
  real bottom nav in one page (a broken dynamic import can never ship),
  the empty-search -> Surprise route, and axe on the extracted surfaces.
- home.js: 8,559 -> ~7,950 lines. The content guardrails keep passing
  untouched because they grep the shell concat (that was G0's point).

## v5.44 - decomposition enablers: the home shell, a bundle budget, and the shared kit (G0)
- First step of the home.js decomposition (owner-roadmap item 6; lifts the
  Lighthouse ceiling). Zero behavior change by design - this phase only
  builds the rails the extractions (G1-G4) run on.
- scripts/lib/shellSrc.mjs: the 9 content guardrails (cards/copy/cta/ux/
  moment/auth/meals/lodging/radius) now grep the concatenated "home shell"
  (home.js + kit + future screens/sheets), so moving code between shell
  files never breaks a contract while deleting it still fails the build.
  check-version/canon/seo/gate stay pinned to home.js on purpose (BUILD_ID,
  CANON_ORIGIN, loader copy, data-fetch wiring must not migrate out).
- scripts/check-bundle.mjs (in audit:regression): gzipped JS budget for the
  "/" route from the real build manifest - route chunk 175KB, total 325KB,
  measured baseline 172.4/321.1KB. Ratchets DOWN each extraction phase.
  (Note: the earlier "241KB route chunk" figure came from the next build
  table; this gate measures gzip of the emitted assets directly.)
- app/components/kit.js: first tranche of shared stateless helpers out of
  home.js (C tokens, CAT_* maps, SHEET_EASE, EMOJIS, GlowPin, Grabber,
  KB_CLICK, useDialogFocus, directionsUrl, offerLabel, scoreLabel, stars,
  moonPhase, weatherFromCode, hourIcon) - eager import, so no bundle or
  behavior delta; screens/sheets extracted later import these directly.
- check:jsx and check-dupes now cover the new shell files (check-dupes via
  shellFiles(), so future screens/sheets are covered automatically).

## v5.43 - fail-closed crons + RLS hardening draft (static security review)
- /api/cron ran fully PUBLIC whenever CRON_SECRET was unset (the guard was
  inside `if (secret)`), leaking signup stats and letting anyone trigger
  the fan-out work; /api/cron/cwv had no guard at all (PageSpeed quota
  burn). Both now fail closed. OWNER ACTION: set CRON_SECRET in Vercel or
  Vercel's own cron pings will 401.
- supabase/DRAFT-rls-fixes.sql (OWNER REVIEW + dashboard apply): findings
  from the static review - (H1) the older root supabase-schema.sql makes
  saved_places/likes world-readable via the anon key while the newer
  supabase/schema.sql is owner-only; verification queries included to see
  which is live. (H2) events inserts never bind user_id to the caller, so
  giveaway entries (counted from action='share' rows) are forgeable and
  attributable to other users - draft policies bind anon inserts to NULL
  user_id and authed inserts to auth.uid(). (M2/M3/L2) size/content
  constraints for events, comments, shared_lists. The giveaway draw
  should long-term not trust a client-writable table at all.
- Guide picks 7-10 (Sarasota) and 7-12 (Orlando) are owner-approved as of
  2026-07-11; DRAFT markers replaced accordingly.

## v5.42 - the CSP flip is measurable, and HSTS covers subdomains
- New /api/csp-report endpoint: browsers POST report-only CSP violations
  (both legacy report-uri and Reporting-API shapes); each becomes one
  structured "csp-violation" line in the Vercel function logs. report-uri
  added to the CSP. Flip criterion now written down: 7 days of production
  traffic with zero same-origin violations -> rename the header to
  Content-Security-Policy.
- Strict-Transport-Security: max-age=63072000; includeSubDomains. The
  subdomain HTTPS audit (2026-07-11) cleared it: wildcard DNS routes every
  *.gowayfind.com name to Vercel with valid TLS (verified against random
  names), and mail is external iCloud MX. Same max-age Vercel already sent,
  now with subdomain coverage. No preload yet - that is a deliberate
  owner commitment.
- E2E_BASE_URL env: point the Playwright suite at a deployed site (no local
  server) for post-deploy live smoke verification.
- check-headers.mjs asserts the HSTS header and the report-uri.

## v5.41 - one command guards the whole audit: npm run audit:regression
- audit:regression = the placeholder-key production build (whose prebuild
  now runs 11 gates: version, jsx, dupes, env, tags, libs, gate, seo,
  guide-counts, affiliate-URL hygiene, legal), then the full Playwright
  suite (hydration/console incl. clock-skew and returning-visitor, deep
  links, prompt coordinator + dialog semantics, axe with zero
  critical-or-serious), then scripts/check-headers.mjs (boots the build,
  asserts the enforced header set + report-only CSP + no x-powered-by).
- This is the July 2026 audit's definition of done, executable locally
  before every deploy.

## v5.40 - privacy notice rebuilt (DRAFT FOR COUNSEL) + affiliate URL hygiene
- /privacy now has the full disclosure structure: retention by data class,
  legal bases, user rights (access/copy/deletion workflow via
  privacy@gowayfind.com), international transfers, location-data-and-
  analytics statement, consent & opt-out posture, children's policy,
  security practices, and WAYFIND LLC as named controller. Every fact that
  needs an owner or counsel decision is an explicit [OWNER/COUNSEL: ...]
  placeholder — nothing invented. The false "encrypted password" claim is
  replaced with the exact Supabase statement (salted hashes, Wayfind never
  receives plaintext). OWNER ACTION: create the privacy@gowayfind.com
  alias — the page now points there instead of the personal @me.com.
- Affiliate URL hygiene: withViatorTracking() builds outbound Viator URLs
  once via new URL() + URLSearchParams.set(), so pid/mcid/medium appear
  exactly once with consistent values even when the source URL (e.g. an
  API productUrl) already carries tracking — string concatenation used to
  double them. All four call sites (ticketsUrl, experienceSearchUrl,
  viatorDirectUrl, viatorServer product resolution) go through it.
- New scripts/test-affiliates.mjs unit gate (5 cases incl. the
  double-append bug and no-PID passthrough) and check-legal.mjs both now
  run in prebuild.

## v5.39 - performance: local mobile Lighthouse 31 -> 72-74, CLS 0.20 -> 0.004
- THE finding: Stay22's LinkSwap script cost ~3.0s of mobile main-thread —
  the entire TBT problem (2,880ms). It now loads on first user interaction
  only (pointer/key/scroll; a visitor who never interacts can never click a
  booking link). TBT: 2,880ms -> 10-30ms.
- CLS 0.249 -> 0.004: the approximate-location banner became a fixed,
  auto-dismissing toast (it inserted into the feed 2.5s after paint and
  pushed everything); the boot loader reserves the feed's space (62vh); the
  events strip renders atomically with the resolved feed instead of
  inserting above the loader.
- MapView is dynamically imported — the Maps rendering bundle leaves the
  first paint entirely (map screen shows a loading placeholder for a beat).
- The intro card's infinite box-shadow/border keyframe animation (paint
  on every frame) is gone; entrance animation + static glow + the existing
  opacity-animated halo remain (compositor-only).
- public/ images (icons, weather art, wordmark — all query-versioned) get
  Cache-Control: 30 days + stale-while-revalidate. Hashed /_next/static
  was already immutable.
- The featured event hero (the LCP image) fetches at high priority;
  everything else stays lazy.
- Field Core Web Vitals now flow to PostHog (web-vitals lib, dynamic
  import): LCP/CLS/INP/TTFB/FCP tagged by route, device, location-permission
  outcome, signed-in state, and build — complementing the lab-only
  /api/cron/cwv PageSpeed job. Nothing duplicated.
- Honest gap: score 72-74 vs the >=75 target. The remaining LCP (~10s lab)
  is structural — 241KB of route JS from the app/home.js monolith plus a
  data-dependent hero. Decomposing home.js is owner-roadmap work.

## v5.38 - accessibility sweep: landmarks, contrast, keyboard, axe gate
- Every route gets a <main id="wf-main"> landmark and a keyboard-visible
  "Skip to main content" link (layout.js); the homepage gets a descriptive
  server-rendered H1 (visually hidden — the conditional proof block stays
  an h2 under it); /privacy's heading is a real <h1> and its links are
  underlined (link-in-text-block fix).
- Contrast: white-on-#FF8A3D CTAs (2.34:1) — the event hero's date chip and
  "Get tickets" — now use dark ink on the bright accent (>7:1); the footer's
  #64748B text/links (3.97:1) are #94A3B8 (~7:1) and the #475569 affiliate
  line is #8B98A9.
- Keyboard: all nine role="button" divs got tabIndex + Enter/Space
  activation (shared KB_CLICK); the horizontal events strip is a named,
  focusable region (scrollable-region-focusable fix); search input has a
  persistent accessible name with the placeholder demoted to hint.
- Map pins now pass title (Maps' supported accessible-name API) — every
  pin was an unnamed role="button" to screen readers; zoom is the only
  Google control (defaultUI already disabled) and the drawer list remains
  the keyboard path. Lightbox photos describe their place.
- New axe e2e gate: /, /privacy, and a guide page must have ZERO critical
  or serious violations; plus a keyboard-journey test (skip link → search →
  landmarks). Full suite 24/24.

## v5.37 - one interruption per session + real dialog semantics
- Prompt coordinator: at most ONE interruptive surface per session
  (sessionStorage wf_interrupted). The intro claims it or nothing does; the
  giveaway popup only fires after the visitor has actually received value
  (results rendered or a place opened — wf_value_seen), never alongside
  onboarding, and queues politely (20s retries) while any dialog is open.
  Existing giveaway frequency rules (entered/3-day snooze/once daily) kept.
- Deep links now ALL own their visit: ?q, ?go, ?place, ?list, and ?exp each
  suppress the intro (previously only ?q did — arriving at /?go=map got a
  greeting stacked on the map).
- Install nudge is rate-limited to once every 3 days (was: every visit from
  the 2nd on, until dismissed). It and the location notice remain
  non-blocking inline banners.
- Dialog semantics: intro, giveaway, giveaway rules, auth, account, and
  recovery all have role="dialog", aria-modal, an accessible label, initial
  focus, a trapped Tab loop, Escape-to-close, and focus restoration
  (shared useDialogFocus hook). Every other sheet (lightbox, cuisine,
  experiences, dice, hook detail, lists, radius, menu, weather) closes on
  Escape via a z-ordered chain.
- New e2e gates: first visit shows the intro and NOTHING else for 33s+
  (the audit's stacking bug, replayed); ?go visits get no greeting; Escape
  closes and restores focus; Tab can't leave the dialog; auth modal has
  full semantics.

## v5.36 - numbered guide titles deliver their count, enforced at build
- DRAFT FOR OWNER REVIEW: 4 new Sarasota picks (Myakka River State Park,
  Sarasota Jungle Gardens, the Legacy Trail, the Celery Fields) and 6 new
  Orlando picks (Kennedy Space Center, Blue Spring in manatee season,
  Wekiwa Springs, Leu Gardens, Mount Dora, East End Market) bring
  "10 Best Things to Do in Sarasota" and "12 Things to Do in Orlando That
  Aren't Theme Parks" up to their promised counts. Same structure and
  voice as the existing entries; every place is real, established, and
  operating. Review before treating as published editorial.
- check-guides.mjs now fails the build when any guide title starting with
  a number doesn't deliver exactly that many picks (year-leading titles
  like "2026 Guide" can't be misread — counts are 1–2 digits). Verified:
  breaking a count breaks the build.
- check-guides.mjs is now actually part of prebuild — it existed but
  nothing ran it.

## v5.35 - deep links finish the job, and the loader mismatch is dead
- THE live hydration bug, found and fixed: the v5.32 contextual loader
  computed "Friday evening" from new Date() during render. The ISR shell
  can be an hour stale, so server and client disagreed → React 418/423 and
  a full client re-render on real visits. The moment phrase now arrives
  from post-mount state; both sides render the generic line first. Caught
  by the clock-skew e2e test once the app rendered fully under test.
- /?go=favorites now lands on Saved (alias added — bridge pages sent
  go=saved, but the natural URL form 404'd to the generic feed).
- app/p/[id]/page.js share metadata: stale wayfind-xi.vercel.app replaced
  with the shared SITE_URL constant. check-canon.mjs now scans ALL of app/
  and lib/ for the stale domain — it lived in p/[id] for months because
  the gate only read home.js and layout.js.
- New deep-link e2e suite: every bridge page (/events /map /coupons
  /favorites /itinerary) must show its promised screen, /?q= must fire a
  real Places search with the query and consume the param, two guide CTAs
  must hand off to a search for the promised place, and /p/<id> must
  resolve the place through the app (not just echo metadata).
- test:e2e builds with a placeholder Maps key so the UI renders under
  test; remote calls 403 and the tests assert outbound requests, not data.

## v5.34 - security headers: A-grade set enforced, CSP in report-only
- next.config.js now sends X-Content-Type-Options: nosniff, X-Frame-Options:
  SAMEORIGIN, Referrer-Policy: strict-origin-when-cross-origin, and a
  Permissions-Policy locking camera/microphone/payment (geolocation stays
  self — core feature) on every route; X-Powered-By is gone.
- Content-Security-Policy ships as Report-Only first. Allowlist built from
  the code's real browser-side origins: Maps/Places JS + tiles + Roboto
  fonts, Places photos (googleusercontent/ggpht), PostHog + asset host,
  Supabase (https + wss), open-meteo weather, Stay22 LinkSwap. Includes
  frame-ancestors 'self'. TODO(csp-enforce) marks the flip to enforcing
  after a clean report-only period in production.
- Deliberately NO HSTS includeSubDomains — subdomain HTTPS audit is an
  owner task first. The PROTECTED vercel.app→gowayfind.com redirect is
  untouched (check-canon still green).

## v5.33 - hydration is deterministic: storage-backed state loads after mount
- Root cause of the live React errors 418/423/425 (July 2026 audit, Phase 1):
  thirteen useState initializers in app/home.js read localStorage (and
  window.location.search) during render. The server rendered the empty
  fallback, a returning visitor's first client render produced real data,
  and React discarded the whole SSR tree. All of them (liked, disliked,
  likedItems, dislikedItems, sharedItems, savedCoupons, hookLikes,
  placeComments, signals, myVotes, signupDone, debugOn) now start at the
  same deterministic fallback on both sides and hydrate from storage in one
  post-mount effect. No persistence path clobbers stored data (verified:
  every setItem site is an event handler or read-modify-write merge).
- New e2e gate (Playwright + npm run test:e2e): loads the production build
  and fails on ANY hydration warning or console error. Covers fresh visitor,
  returning visitor with populated localStorage, ?debug=1 URL params, a
  +6h clock-skew run that simulates a stale ISR shell, and /privacy.
  Environment-only noise (keyless Maps/PostHog/Supabase, degraded /api
  routes) is filtered by origin, never by our own page's errors.

## v4.06 - fix crashing Share button on Top 10 list cards
- PlaceCard share button called addShared() and referenced giveawayMark from
  a scope where neither existed, throwing ReferenceError on every tap: no
  copy, no toast, no giveaway credit. This is why sharing did nothing.
- Share now uses module-level shareLink with a real "Link copied" toast, and
  giveaway credit + shared-list add are passed in via a new onShareCard prop
  from the parent scope where those functions live. Fixes giveaway entry.

## v4.05 - collapsed pill label fix
- CATEGORIES entries carry the emoji inside label with no icon field; the
  collapsed map pill concatenated the missing field as "undefined". Label
  renders alone now.

## v4.04 - version and diagnostics on the public footer
- The build version now shows at the bottom of home next to Privacy/Terms,
  visible signed out. Five taps on it opens the auth diagnostic (session
  state, URL params, event log) with the build id in the readout.
- Account-sheet version line reuses the same shared diagnostic.
- Lesson encoded: deploy verification must never require being signed in.

## v4.03 - honest duplicate-signup message
- Signup against an existing email no longer shows the fake "check your
  email" message. Supabase returns a user with empty identities in that
  case; the app now detects it, says the email already has an account,
  and flips the form to sign-in.

## v4.02 - collapsible map menu
- Chevron under the map menu collapses it to a slim pill showing the active
  category; tapping the pill expands it back. Session-local (always starts
  expanded for discoverability). map_menu telemetry tracks usage.

## v4.01 - dice hero card opens the roll
- The dice hero card routed to the old Surprise flow, so the rolling-die
  experience never fired from it. It now opens the Pick for me sheet: big
  die, purple spin, saved roll history. dice_card telemetry added.

## v4.00 - refresh signout fix + on-device auth diagnostics
- Root mechanism: a burned one-time auth code left in the URL (from the
  email confirmation opening in Safari) replays on every refresh; the failed
  exchange tears down the valid stored session. Boot now strips auth params
  from the URL after they are consumed, killing the class permanently.
- Auth event ring buffer (last 12, timestamped, on-device) + 5 taps on the
  version line shows live session state, URL params, and the log.

## v3.99 - Viator env unification + privacy page
- Legacy AFFIL.viatorPid now reads NEXT_PUBLIC_VIATOR_PID: one Vercel paste
  lights the Tickets button AND the Find tours & experiences row, tracked.
- /privacy page: honest data practices + FTC affiliate disclosure + rank
  independence statement. Linked from the auth modal and account sheet.
  Affiliate network reviewers check for this; it was a decline risk.

## v3.98 - email typo autofix at sign-in
- Unambiguous email typos (.con/.cmo/.ocm/.comm, gmial/gamil/gnail,
  hotmial, iclod/icoud, yahooo) auto-correct on submit with a "fixed a
  typo, tap again" toast. Five-second-test polish: tourists fat-finger
  on phone keyboards; the app absorbs it instead of erroring.

## v3.97 - signup counts in the daily digest
- Digest now leads with signups: confirmed of total (+new in 24h), via a
  service-role-only user_stats SQL function (auth.users is not reachable
  through the REST API otherwise). Fail-soft: without the function or key
  the digest still sends and says what is missing.

## v3.96 - dual-session signout fix (auth flow)
- Root theory: signup confirmation links open in Safari and sign in THERE,
  seeding a second live session beside the PWA; refresh-token rotation then
  makes the two sessions invalidate each other = random signouts.
- Standalone-aware signup copy: installed-app users are told the email link
  opens Safari and to return and sign in with password here.
- Removed unreachable sendMagicLink (no UI caller; same stranding hazard).

## v3.95 - premium GlowPin app icon
- New launcher icon from the GlowPin artwork: pin body measured and centered
  at 62% fill, black full-bleed (iOS rounds corners), subtle saturation and
  contrast lift. Overwrites icon-192/icon-512 in place (zero wiring changes)
  plus a proper multi-size app/favicon.ico that Next auto-serves.

## v3.94 - owner-only curation signal
- communityBoost is now owner-only: places liked by the owner account get
  +4 globally; community likes carry zero rank weight by design. The
  place_signals view shrinks to just owner-liked place_ids.

## v3.93 - curator likes rank globally + telemetry identity
- place_signals view (counts + curator flag, no user data) feeds a
  communityBoost at four rank sites: curator-liked +4 (below FEATURED tiers),
  community likes up to +2. Dark until the view is created in Supabase.
- Your like still demotes in your own map Top 10 for variety while boosting
  for everyone else.
- posthog.identify on sign-in so founder testing can be filtered from real
  user metrics before launch.

## v3.92 - player art returns + Disney family fallback for fireworks notes
- WC card: illustrated player cutout back (speck-cleaned, single component,
  feathered edges); ball rests on his head between bounces, geometry computed
  from the cutout pixels; bounce tightened to a header rhythm (-26px).
- wayfindNotes family fallback: any name containing disney/universal that
  lacks its own entry inherits the resort-level schedule note, so every
  variant, water park, hotel, and Disney Springs answers the fireworks
  question instead of showing nothing.
- Animal Kingdom explicit note: the one Disney park with no fireworks.

## v3.91 - resort umbrella pages route to park fireworks
- Walt Disney World Resort and Universal Orlando Resort pages (the entities
  tourists actually land on) now carry Insider Notes naming each park
  nighttime show and linking the official calendar for today's times.

## v3.90 - SeaWorld notes fix + player art removed
- Fixed duplicate "seaworld orlando" key in WAYFIND_NOTES: the later key was
  silently overriding the Ignite fireworks entry. Merged into one array, so
  the fireworks link AND the six insider tips all render.
- World Cup card reverted to the gold stick-figure juggler per founder call;
  wf-player.png removed from the bundle. One-line change to bring it back.

## v3.89 - map menu unified with home + player art on WC card
- Map now shows the same CategoryMenu as home (home untouched), always
  visible, neutral until a tile is tapped; a Search tile in the row drops the
  search field down. Floating loupe removed; top card spans full width.
- FIFA/Events toggle stacked vertically; Top 10 label chip removed (pins
  still load silently); pin legend moved to the bottom-right corner; compass
  nudged to 292 to close the gap.
- World Cup card: illustrated player cutout (white background removed via
  border flood fill, feathered edges) replaces the stick figure; ball keeps
  the keepy-uppy loop.

## v3.88 - CRITICAL: fix boot crash + diagnostic error boundary
- Fixed app-wide crash on load: the v3.80 mapPool effect referenced keyMissing
  in its dependency array ~625 lines before the const was declared. React
  evaluates deps in source order on first render, so every boot threw a
  temporal-dead-zone ReferenceError into the error boundary. The env check is
  now inlined and the dep removed (env is a build-time constant).
- Error boundary upgraded: crash screen now shows the build id and the actual
  error message under the Reload button, and reports app_error (message +
  top of stack + build) to PostHog. Runtime failures are no longer invisible.

## v3.87 - Parc Soleil owner photos + specific fireworks rooms
- New WAYFIND_PHOTOS layer: owner-shot photos prepend to the Google gallery
  for matched venues, with honest attribution (lightbox says Photo: Wayfind,
  never falsely credits Google). Seeded with three Parc Soleil shots (garden
  walk, tennis/pickleball court, basketball court), compressed to ~200-440KB.
- Fireworks tip upgraded with owner rooms: Tower 100 rooms 11423/11424/11425
  face Disney directly; Tower 200 NW high floors also carry the line.

## v3.86 - affiliate ticketing layer (dark launch)
- lib/affiliates.js: Viator/GetYourGuide deep links keyed off env partner IDs
  (NEXT_PUBLIC_VIATOR_PID / NEXT_PUBLIC_GYG_PID). Returns null without an ID,
  so nothing renders until approval lands: paste ID in Vercel, redeploy, live.
- Detail action dock: "Tickets & tours" button beside Directions on ticketable
  attraction types only (attractions, theme/water parks, aquariums, zoos,
  museums; never restaurants or green parks), with built-in FTC commission
  disclosure and tickets_out telemetry.

## v3.85 - auth diagnostics + PWA session hardening
- Every auth state change (SIGNED_IN/OUT, TOKEN_REFRESHED) now lands in PostHog
  as auth_event, making the ~30-minute signout cadence measurable data.
- Foreground re-sync: when the home-screen app wakes from iOS suspension, the
  session is checked immediately so expired tokens refresh instead of drifting
  to a signout.
- Google-in-PWA remains hidden by design (v3.65): iOS strands the OAuth session
  in Safari. First-party email accounts are the path; delivery fix is Supabase
  SMTP config (Resend), not code.

## v3.84 - like = minus for you, plus for others (phase 1)
- Liked places take a -8 demotion in the personalized map Top 10: discovery
  leads for the user who already experienced them, while the taste profile
  still boosts the TYPE (more like this, minus this exact one). Demote, never
  hide: favorites resurface when nothing better is nearby, and explicit
  category browsing is untouched.
- Plus-for-others half queued: likes are private by RLS design, so community
  like-counts need a counts-only SQL view + rank hook; ships with the
  tracking-verified batch alongside the comments-based member signal.

## v3.83 - Discovery Cove curated note
- Discovery Cove joins the gems rail with a hand-written note (all-inclusive
  capped swim day, the opposite of a rides park), fixing its type-driven
  high-energy miscopy at the source. Dice FAB queued next.

## v3.82 - card variety, white ranked box, dice effect, park fireworks, boost rebalance
- Ranked-box text is now white on every themed list (single shared renderer =
  global rule); orange stays as the tint and border only.
- pickReason rotates three sentence skeletons seeded by place + rank, and the
  theme-park bank doubled to four verdicts: adjacent cards no longer mirror.
- SeaWorld featured boost 14 -> 6: the old thumb-on-scale that ranked SeaWorld
  properties above Disney and Universal in Top experiences.
- Purple dice special effect: while a roll animates, a spinning purple die
  floats in the lower corner.
- Fireworks/nighttime-show notes with official schedule links added for Magic
  Kingdom, Epcot, Hollywood Studios, SeaWorld, Universal Studios, and Epic
  Universe: show names stated, times deferred to todays official schedule so
  nothing goes stale.

## v3.81 - FIFA map chip + Top 10 copy fixes
- FIFA chip beside Events on the map (only during the tournament, auto-removes
  after the July 19 final): shows watch-party-fit venues only, ranked by the
  same worldcup fit + curated boosts the hero card uses, from already-loaded
  pools (zero new searches). Pin previews now work in FIFA mode.
- The #1 "Ranked" box no longer repeats open-now/distance from the body line:
  it carries judgment + review depth only. Intra-card duplication gone.
- Theme parks (amusement/theme_park types) get their own verdict pairs instead
  of indoor-entertainment copy: no more "rainy-day activity" on outdoor parks.
- Top 10 Experiences header no longer claims a fixed composition (two parks,
  one theater); now honest and dynamic-safe.

## v3.80 - map compass + neutral all-category pool
- Compass button on the map (below Events): tap requests iOS Motion permission,
  needle counter-rotates so N stays true as the phone turns; tap off. Heading
  writes straight to the element (no re-renders, no battery tax). Denied or
  unsupported devices get a clear toast. Auto-stops when leaving the map.
- Neutral map now fetches an all-category pool on cold open (6 searches, 3-day
  cache, per approved trade-off) so the Top 10 mixes every category instead of
  leaning on whatever Home loaded. Fires only with a location, only in neutral
  mode, merges progressively.

## v3.79 - map: neutral Top 10 default, collapsed menu, Events toggle, taste profile
- Map now opens neutral: no category selected, submenu collapsed. Slim category
  chips (none active) expand into the full shared menu on tap. Home unchanged.
- Neutral pins show a personalized Top 10 across everything loaded, ranked by
  Wayfind Score + featured/gem boost + the new on-device taste profile.
- Taste profile v1: every place interaction routed through logEvent bumps that
  place type in localStorage (per user, per device); tasteBoost is capped at +3
  so taste tailors, never hijacks. Applied only to the map Top 10 for now.
- Places/Events pair replaced by a single Events toggle (tap on, tap off).
  "Top 10 near you" pill labels the neutral mode.
- Parc Soleil owner tip added: Tower 200 northwest-facing for the direct Disney
  fireworks line; ask for a high floor.

## v3.78 - ranking trust fix, share removed from cards, Eggs Up Grill featured
- Fixed the v3.74 regression Gabe caught: the flat +6 gem boost let Helena (a
  nightlife gem whose own note says the kitchen is not the star) outrank Kekes
  in Breakfast. Gem boost is now a +2 nudge with per-gem override; Helena is 0.
  Two fixtures lock it (68 total).
- Share button removed from feed cards and map-pin cards per decision; sharing
  remains on the place detail page (deterministic copy-first) and hero cards.
- Eggs Up Grill added to WAYFIND_FEATURED (+8): rides near the top of breakfast
  wherever Google returns it.

## v3.77 - WC card: juggling player replaces the rolling ball
- Right side of the World Cup hero now shows a gold pictogram-style player
  (Olympic-pictogram aesthetic, matches the theme) doing keepy-uppies: ball
  kicks up fast, falls with gravity easing, body dips on foot contact, loops.
  Rolling-ball animation removed. Link row gains wrap + right padding so text
  never underlaps the figure on small screens. Pitch stripes and gold pulse kept.

## v3.76 - session-fresh community posts
- Comment Save now refreshes the auth session at post time and writes with the
  fresh identity, eliminating the stale-token/RLS failure class. If the session
  is truly gone, it opens the sign-in modal with a clear message ("Session
  expired - sign in and tap Save again") instead of failing cryptically. The
  local device copy still saves first, so nothing is ever lost.
- Verified lib/supabase.js already sets persistSession + autoRefreshToken;
  remaining re-login causes are environmental (private tabs, Safari vs PWA
  storage split, multi-device refresh-token rotation, dashboard session limits).

## v3.75 - deterministic share (copy-first, sheet as bonus)
- shareLink no longer depends on navigator.share behaving: every tap copies the
  link inside the gesture (visible "Copied" confirmation, cannot silently fail)
  while the native sheet fires in parallel when iOS shows it. Credit fires once;
  a copied link is a legitimate share regardless of the sheet. Rescue/watchdog
  removed as obsolete; share_path telemetry kept (copied, native_called/ok/
  cancel/reject/throw).

## v3.74 - three verified gems: Se7en Bites, Hen & Hog, Deli Desires
- Se7en Bites (Milk District): MICHELIN Guide chip (verified on guide.michelin.com),
  Triple D tournament champion note. Invisible before: Thu-Sun only, closes 3pm,
  radius edge.
- The Hen & Hog (Winter Park): chef-driven Southern comfort, the mac and cheese
  note. Invisible: ~170 reviews + distance.
- Deli Desires (Mills 50): hidden takeout-window Jewish deli, Michelin-trained
  chef, NYT 36 Hours nod in the note (chip withheld: primary source not fetched).
- gemFor gains a contains rule (8+ chars) so "The Hen & Hog" and "Hen & Hog"
  both resolve. 3 new fixtures (65 total).

## v3.73 - unique finds, verified awards, daily digest cron
- New Unique finds rail (mid-feed): 14 curated gems Google prominence buries
  (Twenty Pho Hour, Domu, Bayridge Sushi, Ceiba, Museum of Illusions, Mathers,
  Yalaha Bakery and more), each with a hand-written note and area. Zero passive
  cost: static render; tapping a gem runs ONE cached findPlace and opens detail.
- Awards seeded verified-only (Twenty Pho Hour MICHELIN Guide 2026, Domu Bib
  Gourmand 2025) as gold chips on gem cards; expansion via the quarterly refresh.
- Curated gems now get a featuredBoost (+6) wherever Google returns them.
- Sports & Social WC note gains the smoke cannons + Pointe Orlando freebies.
- /api/cron dispatcher + vercel.json (daily 7am ET): health canaries (homepage,
  OG, weather), 24h Supabase counts, Nov 1 draw + quarterly awards reminders,
  digest emailed via Resend to gabrielpereira@me.com when RESEND_API_KEY is set;
  degrades to JSON logs without keys. CRON_SECRET guards the endpoint.
- 5 gems fixtures (61 total).

## v3.72 - every place share gets its unique card + hook
- Feed-card and map-pin shares pointed at the homepage URL, so recipients saw the
  generic site card instead of the per-place card built in v3.60. All place
  shares now use the per-place link.
- New hook line: the place AI decision blurb travels with the share (hk param,
  capped 110 chars), renders as a quote on the OG card under the name, and leads
  the link-preview description, so the recipient sees what it is and why to go.
  Name font steps down when a hook is present so both fit the right column.

## v3.71 - WC card identity + placement, copy de-repetition, park fix
- World Cup card animation is now soccer-specific: faint pitch stripes and a
  small ball rolling along the card bottom; the July4-style rings and sweep are
  gone. Gold pulse kept, motion stays restrained.
- Placement follows the fixed knockout calendar (dates locked even though teams
  are not): match days (Jul 4-7, 9-11, 14-15, 18-19) render the card on top;
  off days (Jul 8, 12-13, 16-17) move it mid-feed after the first three results.
  Three fixtures lock the calendar (56 total).
- placeKind bug: venues typed plain "park" matched no nature check (the list only
  had underscore variants) and fell through to the waterfront NAME match, giving
  parks restaurant copy ("relaxed meal..."). Plain park type now maps to nature.
- pickReason de-repetition: verdicts, review-strength phrases, and the weather
  prefix now come from variant banks seeded by place + rank, so same-kind cards
  on one list read differently. "close by" replaced with the actual distance.
  whyFirst no longer shares "big review strength" wording with the body line.

## v3.70 - share diagnostics + rescue
- Every share attempt now reports its branch to PostHog as a share_path event:
  native_called, native_ok, native_cancel, native_pending (sheet never settled),
  copy_reject/throw/nonative/rescue. A silent failure is now diagnosable.
- If the native sheet hangs without appearing, a small note offers "tap share
  again to copy" and the next tap within 15s copies directly. Deliberately NO
  auto-fallback timer: an open sheet and a hung sheet look identical from code,
  and auto-copying would re-create the cancel-counts-as-entry bug.
- Feed-card copy fallback now also shows the "Link copied" toast (label flip
  alone was easy to miss).

## v3.69 - World Cup card copy: curated + differentiated
- New lib/wc.js powers the World Cup list. Hand-curated copy and badges for the
  confirmed venues (Sports & Social, Toms Watch Bar, Stadium Club/Caribe Royale,
  American Social, The Wharf at Sunset Walk, Yard House, Divina Carne, Eskina,
  Adega Gaucha), each answering "why watch here instead of elsewhere."
- Everything else gets a signal-driven generator (sports bar / pub / bar /
  Brazilian / Latin / steakhouse / food-first / cafe archetypes) with guaranteed
  in-list uniqueness: no two cards share body copy until a bank is exhausted.
- Evidence rules enforced by 8 new gate fixtures (53 total): the generator never
  claims "watch party" (curated evidence only), banned generic phrases are dead,
  brazil venues get Brazil framing, badges are selective (one max: Best for
  Brazil fans, Big screen energy, Sports bar vibe, Upscale watch dinner,
  Family-friendly, Best food-first pick, Closest strong option).
- Fixed a name-normalization bug the new fixtures caught pre-ship: "&" now maps
  to "and" so curated names like Sports & Social match.
- Rest of the app (feed, other lists) unchanged; WC list only.

## v3.68 - share integrity + community sign-in flow
- Giveaway/share credit no longer fires on tap. shareLink gained an onShared
  callback that fires only when the native sheet completes or the link is
  actually copied; cancelling counts nothing. All 10 share buttons (app, lists,
  hooks, holiday + World Cup cards, place cards, detail, map pins) moved their
  logEvent/giveawayMark/addShared into it. Tap-and-cancel can no longer farm
  sweepstakes entries.
- Community takes: Save while signed out now opens the sign-in modal (text kept,
  private copy still saved) instead of silently saving device-only.
- Post failures now show the real error reason in the toast instead of a generic
  message, so RLS/auth/network causes are visible on-device.

## v3.67 - honest naming + decision copy
- Renamed the localfav experience: page title Local Favorites -> Top Rated Near You,
  badge Local favorite -> Crowd favorite, subtitle now "Highly rated nearby spots
  with strong review volume, ranked by fit." Stops overstating what the data proves.
- Rewrote pickReason and whyFirst into decision copy: best-for verdict + a real
  "skip it if" per kind, and a judgment lead on the #1 line ("the safest
  crowd-pleaser here ... Not the move if you want ...") instead of a number dump.
- Removed filler phrases: one to keep on the list, dependable table, worth a closer
  look, more reviews behind it, rated a notch above.

## v3.66 - World Cup watch-party hero card
- New hero card on the home page, live June 11 through the July 19 final (auto
  clears after). Gold/green championship theme, restrained ring motion mirroring
  the July 4th card render so it cannot break. "See the watch parties" opens a
  ranked list that favors sports bars / watch-party venues (soccer-bar fit
  scoring) with any featured spots boosted; runs on-demand, cached 3 days.
  Links out to the FIFA schedule/tickets and to watchWC for per-game lookups.
- Note: list ranking now also honors featuredBoost, so curated venues rank up.

## v3.65 - fix sweepstakes sign-in in the home-screen (PWA) app
- Google sign-in uses an OAuth redirect that iOS runs in Safari, so in the
  home-screen/standalone app the session never returns and sign-in appears to do
  nothing. In standalone the modal now hides the Google button and leads with
  email/password (no redirect, works in the PWA), with a note that Google needs
  Safari. Non-standalone (Safari) is unchanged.

## v3.64 - two-search feed + debounce
- Feed now runs at most TWO Google searches per screen (broad + one context
  subfilter: meal-by-time for food, first subfilter otherwise), merged. ~67% fewer
  searches than the old 6-search fan-out, with the variety back. Specific subfilter
  taps stay a single search.
- Added a 300ms debounce so rapid category/filter switching no longer fires (and
  bills) searches you immediately abandon - a real driver of the spike during
  testing. Only the final selection searches.

## v3.63 - major cost cut: kill the search fan-out
- The feed fired 6+ Google Text Searches per screen load (one broad + one per
  subcategory), the dominant cost driver. Now it does ONE search per load.
  searchPlaces already returns up to 20 places, so the feed stays full; each
  subfilter still runs its own single search when tapped. ~80% fewer searches
  per load. Combined with the 3-day search cache and hooks cache, this is the
  real reduction.
- Trade-off: the "All" view shows ~20 top places per category instead of ~40
  blended across subcategories. Sub-filters unchanged.

## v3.62 - fix share button doing nothing
- shareLink was async and, when the native share sheet failed, returned before
  the copy fallback, so a failed share did nothing. Rewrote it: fire the native
  sheet synchronously (iOS requires this inside the tap), and on any failure or
  when unavailable, fall back to clipboard (with legacy execCommand fallback) so
  the button always responds. AbortError (user cancels the sheet) is respected.

## v3.61 - hooks cross-session cache
- The AI hooks (Claude) re-billed on every place-set change with no persistence.
  Added a localStorage cache keyed on place set + time-of-day, 3h TTL, so returning
  users and repeat locations reuse hooks instead of re-generating. Keeps context
  fresh (refreshes across morning/afternoon/evening/night), cuts repeat AI spend.

## v3.60 - dynamic share cards use the pin/road art
- Place, list, and weather share cards (/api/og) now use the pin+road artwork as
  a full-bleed background with text on the right, refined type. Background is
  embedded (no runtime fetch). Robust fallback on any render error is intact.
  System font used; exact logo typeface deferred until the edge render is
  confirmed (font embedding failing would break all cards to fallback).
- Logo: image 1 exported as RGB (no transparency), so kept the transparent logo
  already in v3.59, which is the same mark. Real-alpha export can swap it.

## v3.59 - native share card + updated logo
- Replaced the share/OG card with the native landscape artwork (1200x630, no
  compositing). Replaced wordmark.png with the updated logo, background made
  transparent so it sits clean on any surface. Cache-busters: OG v11, wordmark v2.

## v3.58 - search cache extended to 3 days
- QCACHE_TTL_MS 4h -> 3 days. Cuts repeat Google search billing across the main
  feed, the suggested feed (its searches ride the same cache), and named
  searches. Cache size kept at 80 to avoid phone-storage overflow. Within
  Google terms (30-day cache allowance); open-now still computed live.

## v3.57 - share card lockup rebuilt from brand assets
- Wordmark lockup redone using the real brand assets: wayfind from wordmark.png
  (carries the orange i-dot), LET set in Poppins beside it on one line, IT below,
  iconic pin.png beside IT, road under. Pin and tagline unchanged. OG v10.

## v3.56 - share card: sharp landscape, fixed crops
- Rebuilt the landscape card so it stops clipping. Pin cropped at the glow fade
  (no cut rings), radiating, on the left. Tagline and LET wayfind (orange i-dot
  intact) on the right. IT on the road across the bottom. OG cache-buster v9.

## v3.55 - share card: whole uncut poster
- Reverted the recomposition. The card is now the full poster placed uncut on a
  1200x630 black canvas, so no clipped glow rings, no dropped LET/IT, correct
  i-dot. Cost is black side bars (portrait source in a landscape slot). OG
  cache-buster v8. Full-width requires a natively landscape render.

## v3.54 - share card cleanup
- Rebuilt the 1200x630 share card: pin cropped above the LET line (removes the
  stray letter-tops artifact) and the road restored beneath the wordmark.
  Clean band-based crops on pure black, no bleed. OG cache-buster bumped to v7.

## v3.53 - new social share card
- Replaced the site share/OG card with a landscape 1200x630 recomposition of the
  new "Not sure what to do? Let wayfind it" poster: pin left, tagline and
  wordmark right, on black, using the original rendered elements (no font
  substitution, nothing cropped). Bumped the OG cache-buster to v6 so platforms
  refetch. Portrait original kept for vertical placements.
- Note: per-place/list shares still use the dynamic /api/og card; unchanged.

## v3.52 - category-aware AI copy + flatter comment section
- Fixed the food-framed copy on non-food places (e.g. a fireworks viewing area
  told to "skip this for food"). The insight prompt hardcoded food nouns and a
  food skip example regardless of category; the kind flag only changed one minor
  field. Voice, skip example, and the signature reference now follow the
  category, so attractions read as attractions.
- Flattened the Community Takes section from three nested bordered boxes to one
  clean card by removing the outer wrapper card and the inner "Add yours" box.

## v3.51 - loader hang, Featured pill, decision-framed card copy
- Home "Reading the moment" could hang: openSuggested() nulled the feed on every
  Home tap, forcing the spinner even with cached data, and the blend is slow on a
  cache miss. Switched to stale-while-revalidate: the last feed stays visible
  while it refreshes; spinner only on a true first load.
- Featured pill: icon was the same star as Local favorite. Changed Featured to a
  distinct medal icon in both the card badge and the FeaturedTag.
- Featured tap did nothing because no "featured" experience existed, so the
  handler no-opped. Added a Featured experience so the tap opens a real list of
  the highlighted spots near you.
- AI card copy: sharpened the /api/blurbs prompt to your voice - each line is now
  framed as a decision ("Best move if you want ...") rather than a description.
  Detail page already carries the full brief incl. "Skip it if ..." from
  /api/insight, so the decision lives on the card and completes on detail.
- Still open: card_impression. It needs a per-card viewport observer in PlaceCard
  firing to PostHog. Not rushing it into this batch; it is the next focused edit.

## v3.50 - PostHog analytics + decision-funnel events
- Installed PostHog (posthog-js dep + init in the app), gated on
  NEXT_PUBLIC_POSTHOG_KEY so it no-ops until you set the key. Autocapture and
  session replay on. Set NEXT_PUBLIC_POSTHOG_KEY (and optionally
  NEXT_PUBLIC_POSTHOG_HOST) in Vercel to turn it on.
- Routed every existing logEvent through PostHog too, so all current events
  (search, detail_open, share, save, directions, etc.) flow to both Supabase
  and PostHog. Supabase events kept as-is.
- Added the missing decision-funnel events: screen_view (on every screen change,
  which also covers events/favorites/itinerary tab opens and page-drop-off),
  map_pin_selected, result_count_shown, filter_changed.
- Not added this build: card_impression. It needs viewport observation per card,
  and it touches the same card render as the AI Decision Cards, so it is bundled
  into that next build rather than editing the cards twice.
- Correction on record: the earlier "giveaway user_id is null" claim was wrong.
  In-app shares use the component logEvent, which sets user_id when signed in, so
  the draw works once the events table exists.

## v3.49 - honest comment save (reviews persistence)
- The comment save claimed "posted" instantly, before the server write
  resolved, and the Supabase upsert had no error branch, so a failed write
  silently pretended to succeed. That is why a review looked saved but was gone
  on return. Now it says "Saving..." then confirms only on success; on failure
  it says it saved on-device only and logs the real Supabase error to the
  console, so the actual cause is visible.
- This surfaces the failure honestly but does NOT itself make reviews persist.
  The real fix is provisioning the comments table: run comments.sql AND
  schema.sql in the Supabase SQL editor. Until the table exists, server writes
  fail and reviews only live on the device that wrote them.

## v3.48 - "Why ranked #1" on Top 10 pages
- The featured (#1) card on every Top 10 / holiday list now shows an explicit,
  honest "Ranked #1" callout computed against the whole list: rating lead,
  review-count lead, open-now, and distance. Only facts already in the place
  data, no invented claims. First concrete piece of the trust/ranking work.
- Not yet built, pending your call: the full card copy engine (why go / best
  for / skip if / timing / confidence) and intent-specific labels. Flagged that
  the reasoning-copy quality hinges on a template-vs-AI decision, and that some
  requested labels (Official show, Parking nearby, Crowd warning) are not in
  Google data and would be fabricated -- those need an editorial layer, not a
  generator.

## v3.47 - itinerary menu cleanup + map search on the map
- Itinerary showed two menus: the old category pills and the newer tile menu.
  Hid the old pills on the itinerary (and its trip detail), leaving only the new
  CategoryMenu.
- Map search: moved the magnifier out of the header and onto the map as a
  floating top-right button, and narrowed the map menu to give it a corner to
  sit in. Reclaims the header row so the map is taller. Placement is an
  estimate; confirm after deploy and I will nudge if it overlaps the menu.
- Not done: restyling the itinerary trip detail (image 2) to the Top 10 card
  style (image 3). Trips are user-ordered lists with manage actions (visited,
  move, remove, notes) that the Top 10 list does not have, so it is a real
  redesign, not a swap. Scoped for next, pending one decision below.

## v3.46 - weather moved server-side + resilient chip
- Root fix attempt for missing weather. The browser called Open-Meteo directly;
  a network filter or content blocker can silently block that one call while
  Google and the rest still work, which fits the symptom. Added /api/weather so
  the server fetches it and the browser only talks to your own domain, removing
  that failure mode. Matches how events and AI already route.
- Header weather chip was gated strictly on apparent_temperature (feels-like)
  and showed only that. It now shows whenever any temperature is present and
  falls back to the real temp if feels-like is absent, so a partial response no
  longer hides the chip.
- Added a fallback that derives current conditions from the first hourly reading
  if the response lacks a current block.
- Honest limit: I cannot reach Open-Meteo from my environment to confirm this
  resolves your specific case. If weather is still blank on v3.46, the cause is
  outside the app (Open-Meteo down, or blocked upstream), and the definitive
  check is loading the site on a desktop browser, DevTools > Network, filter
  open-meteo or /api/weather, and seeing whether it returns 200 or fails.

## v3.45 - hide Your Next Move, compact nav, map cleanup
- Hid the "Your Next Move" hero card behind a flag (one line to restore) so the
  Top 10 near you leads. Not deleted.
- Bottom nav made shorter (less padding, smaller icons/labels) to reclaim
  height, and every tab tap now scrolls to the top of the page, so Home lands
  at the top instead of wherever you last were.
- Map: menu overlay got a solid background (it was unreadable over the map
  after the v3.44 transparency change), and the Places/Events toggle and the
  legend were moved below the now-open sub-menu so it stops covering them.
  Offsets are estimates; confirm after deploy and I will nudge.
- Map now centers on your location at a moderate zoom instead of fitting all 85
  pins, which is what made it feel uncentered and overwhelming. Trade-off:
  distant pins sit off-screen until you zoom out. Zoom level needs your eyes.
- Not done this build: the Top 10 Events page. Events are not places and cannot
  reuse the Top 10 card layout, so that is a real build coming next, not a
  rushed patch.

## v3.44 - menu bubble removed
- CategoryMenu (home mood menu) no longer sits in a rounded, blurred floating
  card. Container is now transparent with square edges and flush padding, so it
  reads as part of the header instead of a bubble. Tile size left as-is: with 6
  tiles pinned to one line with no scroll, there is no room to enlarge them on a
  phone without forcing a scroll or a second row, which you said to avoid.

# Wayfind Changelog

Versioning starts at 1.0. Each shipped build gets the next number (1.1, 1.2, ...).
The running app shows the version in the footer ("Wayfind v1.0") so you can confirm
which build is live on Vercel. This file is the record so nothing gets lost.

## v3.43 - sweepstakes live now, holiday card 4-week lead
- Sweepstakes is live now instead of a teaser. Moved the start from July 4 to
  July 3 and aligned all three places that state the window so they stay
  consistent: the card's live gate, the Official Rules text, and the draw query
  (giveaway-draw.sql now counts from 2026-07-03). URGENT caveat unchanged: the
  draw still cannot pick a winner while share events log user_id = null, so the
  user_id fix must land before any real promotion of this live promo.
- Holiday card lead widened from 3 weeks to 4 weeks (28 days). A card now
  appears 28 days before each holiday and clears at midnight ending the holiday
  day (so it stays up through the holiday itself). Open question flagged: it
  currently triggers for all 11 federal holidays; if you want only "major" ones,
  tell me which and I'll filter.

## v3.42 - stuck-home bug, one-line menu, food subfilters, sweepstakes teaser
- Fixed the blank/stuck home screen that needed a refresh. The feed-load effect
  bails early when searchMode is on, but searchMode was not in its dependency
  list, so exiting search never re-fired the load and the feed stayed empty
  until a hard remount. Added searchMode to the deps; the effect is guarded and
  idempotent so it only ever re-fetches at most once more. Root cause, not a
  band-aid.
- CategoryMenu (the home mood menu) now fits on one line: the six tiles share
  the width and let two-word labels wrap under the icon instead of horizontal
  scroll, and the "›" scroll fade is gone. Selecting a category now auto-drops
  the sub-menu (it used to close it and require a "Filters:" tap); the "Filters:"
  label and toggle are removed. It just drops down, as asked.
- Food sub-menu: removed Brunch (it was redundant, breakfast already covers it),
  added Desserts.
- Sweepstakes card is now visible before it opens. It was gated behind
  giveawayLive(), which is false until July 4, which is why nothing showed.
  Added a 21-day pre-launch window; the card now appears in an "Opens July 4"
  teaser state and flips to live entry on the 4th automatically.

## v3.41 - code audit + missing Supabase schema
- Audit (static review; no live smoke test possible from here). Clean: tsc 0
  errors across all of app/, deploy gate passes, no TODO/dead-code markers.
- Found and provisioned FIVE Supabase tables the app reads/writes that no SQL
  ever created: events, likes, offers, saved_places, shared_lists. Only
  comments existed. Result was silent failure of cloud saves, likes, shared
  links, offers, and the giveaway's event log. New supabase/schema.sql creates
  all five with exact column shapes and RLS, idempotent, run once in Supabase.
- Found a second giveaway bug the table alone does not fix: every share logs
  the event with user_id = null, and giveawayMark only writes localStorage, so
  no share is tied to an account in the DB. The Nov 1 draw filters on user_id
  is not null, so the entrant pool is always empty. Needs a code fix (set
  user_id on share events); flagged, not yet changed.
- App code is byte-identical to v3.40; this build adds the DB schema file and
  the version bump. Required env for a working deploy, for the record:
  NEXT_PUBLIC_GOOGLE_MAPS_KEY (all place data), ANTHROPIC_API_KEY (AI copy),
  and the two NEXT_PUBLIC_SUPABASE_* keys (accounts/comments/saves). Minor: the
  SEATGEEK_CLIENT_SECRET and SIGNUP_WEBHOOK_URL env vars are read in code but
  missing from .env.local.example; signup/vote API routes log full entries
  (emails) to server logs.

## v3.40 - name-overlap fix, July 4 fit-ranking, varied card glow
- Fixed the save/share buttons covering long place names in list rows. The name
  and buttons shared the same space with nothing reserved; the name now keeps a
  right gutter so it wraps clean instead of running under the icons. No
  truncation, so full names like "V Pizza & Tap Room - Lake Buena Vista" stay
  whole. Same gutter applied to the featured card's top meta row.
- Holiday cards now rank by base quality + a bounded holiday-fit score +
  editorial pins, instead of raw wfScore. For July 4 the fit score rewards open
  water / lakefront / elevated open-sky spots (from name, Google types, and
  labels) and penalizes indoor/retail, and Lake Eola Park is pinned for the
  downtown Orlando show. Framework is in holidays.js (fitFor + pinFor); other
  holidays fall through to base ranking until their signals are added.
  Limitation on record: Google data can't confirm which park hosts a show, so
  fit ranks plausibility and pins carry the ground truth. Per-card taglines are
  still generic conditions copy, not fireworks-specific (separate change).
- Home-feed hero cards no longer share one identical bottom-right accent glow.
  Each card's glow corner is now chosen deterministically from its id, so a card
  is stable across renders but the feed reads as varied and intentional.

## v3.39 - K-Bob (Korean spot near Parc Soleil) insider tips
- Added K-Bob as owner-curated with an insider tip: corn dogs (get the full
  cheese, not the half-and-half "Original"), get the chicken sauced (Korean
  butter is what carries it), the vanilla tea with tapioca and brown sugar, and
  kid logistics (high chairs, toys, backpacks, kiosk ordering; tenders are the
  kid pick). No hard prices, per the durable-tip rule.
- Name is short, so tip is keyed across likely spellings (kbob, k-bob, k bob,
  kbop, k-bop) to attach regardless of Google's exact rendering. Featured boost
  added as exact-match keys (kbob, kbop): fires only if the full Google name is
  the bare "K-Bob"; a suffix like "K-Bob Chicken" will not trigger the boost
  until the exact name is confirmed and pinned. Name-matched, no coord gate, but
  "K-Bob" is distinctive so cross-location leak is not a real risk here.

## v3.38 - Disney Springs features + featured-boost key fix
- Added three Disney Springs spots as owner-curated: Cityworks (busy-table
  wait tip), AMC Disney Springs (dine-in / reserved-recliner tip, points to
  the AMC app for showtimes, cross-refs Everglazed), and Everglazed Donuts &
  Cold Brew. Each gets a featured ranking boost and a "Curated by Wayfind"
  insider tip. AMC keyed under two name variants ("amc disney springs" and
  "amc dine-in disney springs") to hedge Google's naming.
- BUG FIX: WAYFIND_FEATURED keys were written with spaces ("hilton orlando",
  "t-rex cafe", "seaworld orlando"), but featuredBoost normalizes names by
  stripping spaces/punctuation, so none of those keys ever matched, i.e. those
  three were getting no boost. Rekeyed to normalized form (trexcafe,
  hiltonorlando, seaworldorlando). Their boost now actually applies, which will
  nudge their ranking up where they appear.
- Deliberately did NOT hardcode "Supergirl now playing" on AMC. First-run films
  rotate every few weeks; a named movie in a static note rots fast and there's
  no live showtime feed wired in. The note points to the AMC app instead.
- KNOWN LIMITATION: Cityworks and AMC are chains. The name matchers have no
  coordinate gate, so these tips/boosts also apply to those brands' other-city
  locations. Low impact during the Orlando/Sarasota launch (users only see
  places near them), but the clean fix is a coordinate-gated note like Hilton
  Orlando uses, which needs the exact Google names. Verify on-device that each
  attaches; if AMC's tip does not show, send the exact place-header name.

## v3.37 - Top 10 categories lifted into their own explainer card
- The time-aware Top 10 category row (Food / Nightlife / Events from 2pm, Food
  / Experiences / Shopping before) was crammed as overlay text inside the 163px
  hero photo card, fighting the image for space, which is why it read weak.
  Pulled it out into a dedicated card under the hero pick: three tappable rows,
  each with an icon chip, title, and one-line descriptor, styled to match the
  curated Top 10 sheets they open. Behavior unchanged: each row still opens that
  category's ranked Top 10 (Events jumps to the tab).
- Added the explanation: a lead line telling people to pick by where they want
  to go, each opening the ranked Top 10 for that category, no ads or paid
  placement.
- Holiday gradient kept (carries the card's patriotic identity); the stacked
  fireworks motion left as-is pending a call on dialing it back.
- OPEN, not guessed: the general "best move / Top 10 near you" hero pick was
  left in place. If "no need for the c top 10" meant remove that and lead with
  the category card, it is a one-line change. And the "icon that goes to the
  right" note was cut off mid-sentence, so nothing was done there yet.

## v3.36 - provenance record maintained (doc-only, no app change)
- Appended a dated maintenance entry to PROVENANCE.md confirming the record is
  current as of the app state, now v3.36. Appended rather than editing the
  original v3.33 line on purpose: the record's evidentiary value rests on it
  being a contemporaneous, append-only log, so rewriting past entries would
  weaken it. The app is byte-identical to v3.35; only the footer/VERSION bump
  distinguishes the deploy, which lets you confirm the push actually landed on
  Vercel even though nothing visible changed.

## v3.35 - one comment room + working edit/delete + fireworks encore
- Community takes and the composer are now ONE card: an inset "Add yours"
  panel on top (visibly a write zone: darker background, its own border),
  everyone's posts flowing directly below it, yours where you just typed.
  Empty state invites the first tip.
- Edit fixed: the old handler filled a textarea in a different card below the
  fold, so nothing appeared to happen; the composer now sits above and Edit
  focuses it with the post loaded. Delete added with a two-tap confirm; it
  clears the server row, the local copy, and the composer. REQUIRES one SQL
  line (appended to supabase/comments.sql): the delete RLS policy; without it
  server deletes silently fail while local clears.
- Holiday card encore, additive: five twinkling sparks in gold, white, and
  red plus a slow diagonal light sweep, layered over the existing rings and
  glow.

## v3.34 - landing fix, hero-integrated Top 10s, holiday upgrades, row actions
- Landing bug fixed: ?place= share links opened the place but never cleaned
  the URL, so a shared link stuck in history reopened that place on every
  launch. The param is now stripped after consumption, same as ?exp=.
- Curated Top 10s moved INSIDE the hero card as a flat text row (no pill
  bubbles), time-aware: before 2pm Food / Experiences / Shopping; from 2pm
  until early morning Food / Nightlife / Events (Events jumps to the tab).
  The 2pm threshold is one constant if the founder meant a later hour. New
  Top 10 Nightlife composite: 5 bars and lounges, 3 live music, 2 late-night
  eats.
- Holiday cards now show 3 WEEKS before each holiday (fixtures updated;
  overlapping windows resolve to the nearest upcoming holiday by list order),
  and the card gained a house-style share button top-right, themed unfurl and
  giveaway credit included.
- Every list row (Top 10s, holiday, badge lists) now carries Save + Share
  icons top-right in the house circle style; shares credit the giveaway.

## v3.33 - provenance record (doc-only)
- PROVENANCE.md added: dated, factual record of creation timeline, sole
  authorship on personal resources, and the ownership chain into Wayfind LLC
  upon formation, expressly reserving the Work as a prior invention relative
  to any subsequent employment. Supporting evidence by design; the
  load-bearing items are the pre-start LLC + IP assignment, the copyright
  registration, and the prior-inventions schedule at onboarding.

## v3.32 - legal hygiene (notice layer)
- Proprietary LICENSE added (all rights reserved) and a copyright line in the
  footer. Copyright exists automatically on creation; these establish notice.
  The load-bearing moves live outside the repo: private GitHub visibility,
  the LLC + IP assignment, trademark knockout search, and ToS/Privacy/DMCA
  docs now that accounts, UGC, and a giveaway are live.

## v3.31 - the Annual Giveaway (Nov 1 draw) + chair-timing addendum
- Gold giveaway card on home, live Jul 4 through Oct 31 by date gate: win a
  3-night Hilton Orlando stay by sharing any 3 places or lists while signed
  in. Progress pill (X of 3 shared / entered), sign-in gated so it feeds the
  account loop, and a full Official Rules sheet behind "How it works":
  no-purchase, window, random draw ~Nov 1, ARV $600-900 with winner-pays-tax,
  18+ US, void-where-prohibited, and NOT-affiliated-with-Hilton/Apple
  disclaimers. Have counsel skim before the fall push; if ARV crosses $600
  the winner gets a 1099.
- Entry engine: every share surface now logs AND marks (the card-row share
  button was not logging at all; fixed). App-shares excluded. Server events
  are the source of truth; the on-device progress meter can undercount for
  multi-device users, disclosed in the rules. supabase/giveaway-draw.sql is
  the one-query Nov 1 draw (entrant pool + random winner).
- Phase 2 flagged for pre-October: referral-coded share links counting opens
  on distinct devices, the fraud-resistant "3 different people" version.
- Parc Soleil note gains the pattern: chairs book ~3 days out (matching
  3-night owner stays), so reserve the day before check-in.

## v3.30 - linked Insider notes + the Parc Soleil chair hack (verified)
- Insider notes can now carry a tappable link pill (owner-vouched links only;
  community Tips remain plain text by design, auto-linking stranger URLs is an
  attack surface). Link taps log as note_link.
- First linked gem: Hilton Grand Vacations Parc Soleil. The welcome-letter
  chair instructions are often broken; the working system is the resort's own
  Recreation Team ORGANIZER page on Eventbrite, verified live today. We
  publish the organizer page, not a ticket URL, because ticket IDs rotate and
  the organizer page is the permanent front door where each drop appears; the
  note explains the morning-of drop behavior so an empty page reads correctly.
  Framed as a guest-service tip for people staying there, deliberately not as
  a way around owner gating.
- Research verdict on record: no Eventbrite siblings found; these are
  property-level staff systems, unindexed between drops. Scaling path: gems
  get added one map entry at a time as discovered, community Tips will
  collect them organically from guests, and the monetizable version of this
  feature is ResortPass (cabanas/day passes at hundreds of hotels, real
  affiliate program) — founder application recommended.

## v3.29 - the FINAL menu (founder-declared) + map decluttering
- Menu freeze acknowledged and enforced by architecture: CategoryMenu is one
  component rendering home, map, and itinerary, so this final version and any
  future tweak propagate site-wide by construction. A do-not-fork banner now
  tops the component.
- The final form: glass panel (translucent with backdrop blur) so the map
  stays visible beneath it; tighter padding; subfilters COLLAPSED by default
  behind a "Filters: <current> ▼" toggle that shows the active pick,
  expands on tap, and re-collapses on selection; a right-edge fade plus
  chevron announces that the tile row slides.
- Map decluttered: the duplicate bottom subfilter strip is gone (the menu owns
  filtering), the sign-in/account button no longer renders on the map, and
  the search bar collapses to a magnifier that slides the field down on tap
  and tucks away again on blur. Collapsing the filters also ends the menu's
  collision with the rank legend.

## v3.28 - navigation audit fixes + curated composite top 10s
- Navigation audit verdict: two real traps. The browse takeover had no visible
  exit (toggling the tile off was the only way back, undiscoverable), and
  tapping the already-active Home tab did nothing. Fixed both: a Back pill now
  tops every browse takeover, and tapping active Home resets to the default
  feed, the standard mobile convention.
- Curated composite lists, reachable from three chips under the hero: Top 10
  Food (3 breakfast, 3 lunch, 3 dinner, 1 quick bite, deduped, ranked inside
  each slot), Top 10 Experiences (2 theme parks, 1 movie theater, 7 top
  attractions whose detail pages carry the Viator tour links), Top 10
  Shopping. Each opens the standard experience screen with visible SECTION
  LABELS between slots and a plain-language lead explaining what the list is
  and how it was picked. Share and deep links work (cur- keys). The 3-events
  slot is deferred one build: event objects have a different shape than
  places and faking them as places would violate the trust rules; it needs a
  proper event-row renderer.
- Latent bug found and fixed: the experience screen titles read themeTitle
  and themeBody, so the holiday list has been opening with an EMPTY header
  since v3.22; holiday and composites now populate the correct fields.

## v3.27 - the map list locates instead of leaving
- Tapping a row in the map drawer no longer jumps to the detail page: the
  drawer collapses, the map pans and zooms to that pin, and the preview card
  pops with See details as the tap-through. A map list should find things on
  the map; details are one tap further.
- Preview card shows an honest drive estimate beside distance: straight-line
  miles x 1.3 route factor at 28 mph urban average plus 3 minutes to get
  rolling, floored at 4, displayed with an approximate mark. Real Directions
  timing costs per call; this is the correct trade until traffic-aware ETAs
  earn their bill.
- Drawer thumbnails without photos now use the smart icon brain instead of a
  generic pin.
- MapView gained a focus prop with a fly-to effect; the map instance was
  already ref-held, so this was an addition, not surgery.

## v3.26 - one map menu, holiday fix, fireworks polish
- Holiday bug owned and fixed: openHoliday called searchNearbyPlaces through a
  G. namespace that never existed (imports are named), the ReferenceError fell
  into the catch, and the catch surfaced as "Could not load 4th of July
  picks." One-line fix; the picks now actually fetch.
- Map has ONE menu: the old Food/Night Out chip row above the map is deleted;
  the shared CategoryMenu overlay is the menu, now on a solid panel with a
  border so it stops ghosting over the map. Places/Events toggle and the rank
  legend moved below it (they briefly sit under an open subfilter row, which
  is acceptable while actively filtering).
- Home: "what are you in the mood for" heading removed; the menu leads with
  the tiles.
- Tiles enlarged into one horizontally scrolling row: 24px icons, 11px labels
  that never wrap, so Things to do stops breaking onto two lines.
- Search dropdown now uses the smart icon brain (Burger King reads as a
  burger); the hardcoded fork is gone.
- July 4th card got the premium treatment: three staggered firework burst
  rings, a glowing stripe, and a glowing emoji, all CSS, no cost.

## v3.25 - the score becomes ours (member signal plumbing)
- New pure Ranking.memberDelta: community takes now feed the Wayfind Score,
  silent below 3 distinct authors per place so one person can never move a
  number, capped at +/-0.75 so Google-scale evidence still anchors it;
  Warnings pull down, Tips/Best dish/Reviews push up. Three fixtures lock the
  threshold and caps (44 total).
- Wired non-blocking into all three list pipelines (category browse,
  experience pages, holiday lists) via one batched comments query per fetch;
  lists paint instantly and adjust silently if signal exists. Inert today by
  design: nothing visible changes until real takes accumulate.
- Detail page shows "N member takes" beside the score, with "in score" once
  the threshold is met, so collection is visible before it is influential.
- Methodology copy updated to disclose the new input. A score that quietly
  changed its inputs would break the trust layer; this one says so on screen.

## v3.24 - honest medals + one list language
- Ranking: the category browse defaulted to a pure distance sort while
  stamping ranked medals on the result, which is how a 3.8 outranked a 4.8.
  Default is now "best" (the conditions ranker: rating, review volume,
  distance, weather/time fit). Closest remains one tap away. Correction on
  record: the earlier "Google raw order" theory was wrong; the sort existed,
  the default pointed at the wrong one.
- Detail sheet floating Back moved top-left and slightly higher, clear of the
  photo carousel arrow.
- Explore (badge) pages now speak the Top-10 page's language: open typography
  header (eyebrow, big title, lead, methodology, "N curated picks" divider)
  replacing the boxed card, and the same share / open-in-Maps / heart trio
  top right, with share deep-linking back into the same list. Back now
  returns HOME instead of dumping people on the explore hub, which was the
  "different landing page" mystery.
- Remaining deliberate delta, decision pending: explore uses standard
  PlaceCards while the Top-10 page uses its own medal cards; the medal cards
  are the outlier and should eventually converge on PlaceCard.

## v3.23 - community takes (the differentiator groundwork)
- Takes are no longer private notes: signed-in saves now POST to a Supabase
  comments table (one per person per place, editable), and every detail page
  fetches and renders "Community takes" with author, type chip, and body.
  Signed-out saves stay device-local with an honest toast. REQUIRES a one-time
  2-minute setup: run supabase/comments.sql in the Supabase SQL editor; until
  then the feature degrades silently to local-only.
- New taxonomy, each type a distinct engine signal: Tip (logistics and how to
  do the place right), Best dish (feeds what-to-order identity), Warning (the
  negative signal the app was missing), Review (overall verdict; schema has a
  rating column so stars can land later without a migration). Legacy Insider
  tips migrate to Tip, Recommendations to Review.
- Strategy note on record: community signal BLENDS with the review-grounded
  AI, it does not replace it; user data starts modifying scores only once a
  place has real density. Collected from day one so the data exists.
- "See photos, tips & details" accordion removed; the full insight and videos
  now render on every detail open. Cost note: those loads used to be tap-gated
  and now fire per open; the per-place insight cache keeps it bounded.

## v3.22 - holiday system (calendar, themed hero, curated lists, themed unfurls)
- lib/holidays.js: all 11 federal holidays computed per year in pure date
  math, so recurrence is automatic forever. Window: 3 days before the holiday
  through the holiday itself. Seven fixtures lock the date logic (41 total).
- Themed hero card renders above the normal hero only inside the window;
  July 4th ships fully curated (fireworks viewing queries with a retail
  filter, because a naive fireworks search ranks fireworks STORES first).
  The other ten holidays get honest generic weekend picks until each is
  themed; no invented holiday claims.
- Tapping the card fetches on demand (rides the query cache, cost-bounded)
  and opens the standard experience screen via a places override, which means
  share, open-in-Maps route, and save-to-lists all work on holiday lists for
  free. Location follows the app center: current GPS or any searched city.
- Shared holiday lists unfurl as THEMED cards: the OG generator gained a
  holiday layer (July 4th: navy field, red stripe, fireworks tag) with full
  fallbacks so every existing card is pixel-identical. Deep links route
  hol- keys back into the holiday list on open.
- Deploying today lands inside the live July 4th window: instant proof, and
  the card should vanish on its own July 5th, which is the real trigger test.

## v3.21 - shared menu everywhere, smart icons, pill backs
- CategoryMenu extracted as one component; home, Map (as a floating overlay
  above the map), and Itinerary (as a launcher that jumps into browsing) now
  render the identical menu system. Mood title reduced to 20px inside it.
- Map note: the map already had its own small chip row; if the overlay
  duplicates it visually, say so and the old row goes next pass.
- Weather chip verdict: it was never removed; code intact since v3.15. If it
  is missing live after this deploy, the wheel will be too, and the cause is
  a failed weather fetch, not a missing feature.
- Smart per-place icons: photo-less cards now show a fitting icon (burger
  joints get a burger, cafes coffee, hotels a hotel, 24-rule table with
  honest category fallbacks) instead of a generic plate.
- "Customize me" default list removed from Favorites and resurrection-proofed
  on load (an empty stored copy is deleted; one with saved places survives so
  nothing of yours is destroyed).
- Back buttons are now bordered pills with accent text everywhere, not just
  bigger: visible and unmistakable as a global rule.
- Share icon beside the map button on hero pages: already shipped in v3.20.

## v3.20 - the traffic build: labeled Featured + shareable lists
- Featured placements are now LABELED: a gold "Featured" tag renders beside
  the badges anywhere a boosted place appears (feed cards and detail).
  Featured set: T-Rex Cafe, Hilton Orlando, SeaWorld Orlando. Caveat: the
  matcher is prefix-based, so "hilton orlando" may also catch sister Hiltons
  whose names start the same; tighten if seen live.
- SeaWorld Insider notes gained fireworks timing and the annual-pass math,
  phrased durable (no prices, no show names that rot).
- Shareable lists, end to end: every experience/Top-10 page has a share
  button; links land on a new /l/[key] route whose OG metadata renders the
  existing list-style card (title, count, city), so group-chat unfurls are
  branded; tapping deep-links into /?exp=<key>, which the app now reads once
  on load and opens THAT exact list, then cleans the URL. The tap no longer
  dumps people on home.
- Gates extended: the compile and duplicate checks now cover the new route.

## v3.19 - the leverage build (install nudge; share billboards verified)
- Add-to-home-screen nudge: slim dismissible banner on a visitor's SECOND
  visit, never shown when already installed. Android gets a real one-tap
  Install (beforeinstallprompt); iOS gets the Share -> Add to Home Screen
  instruction since Apple exposes no prompt. Impressions, installs, and
  dismissals log to analytics (a2hs_*), so install conversion is measurable.
  appleWebApp metadata added so the installed app runs full-screen on iOS.
- Finding, not a build: the share-link billboard was ALREADY fully built
  (dynamic OG cards on /p/[id] with name, rating, category, score). Every
  shared place unfurls branded in iMessage/WhatsApp today. Verify by texting
  yourself one link.
- Standing founder moves, no code: Viator affiliate application (commission
  on tour clicks already flowing), Google billing credit request, Vercel
  Analytics toggles. And label the featured boost or keep it to entries you
  personally vouch for; undisclosed placement is the one loophole that
  costs more than it pays.

## v3.18 - Places query cache (the Google-bill fix)
- Mental-model correction, stated plainly: nothing persisted before this.
  Results lived in React state, which dies on reload, so every app open
  re-billed the full Text Search volley. Only AI insights were cached.
- New session cache in lib/google.js wrapping all three search chokepoints
  (searchPlaces, searchNearbyPlaces, findPlace): localStorage, 4-hour TTL,
  ~2km location grid so GPS jitter cannot defeat it, 80-entry cap with
  oldest-first eviction, plus an in-flight map so simultaneous identical
  queries share one request instead of double-billing.
- Effect: repeat loads within 4 hours cost near zero Text Search; first loads
  unchanged. Trade-off: "Open now" on cached lists can go stale near an
  open/close boundary; TTL is one constant if that ever matters.
- ToS posture: hours-scale session caching, deliberately not days; place IDs
  are the only content Google permits storing indefinitely.
- Scope: this fixes cost from YOUR usage. If the billing SKU report shows
  key theft, the restriction + rotation fixes that, not this. Do both.
- Verify live: open the site, then reload; in devtools Network, the second
  load should show zero searchByText traffic. That is the cache working.

## v3.17 - interactivity, identity, and the take system (founder batch)
- Detail metadata is now interactive with affordances: distance is a directions
  link (accent + arrow), cuisine is a tappable link opening the ranked
  same-cuisine sheet (Brazilian -> other churrascarias), Open now carries a
  rotating caret, reviews count links to the Google listing when anchored.
- "Why Wayfind picked this" prompt upgraded: 5-8 sentences that open with what
  the place IS, make the case, name specifics, and close decisively; compact
  budget raised to 900 tokens. Cached insights upgrade as they refresh.
- "More details" header removed. "Your note" replaced by "Your take": pick a
  type (Insider tip, Best dish, Recommendation, Review), write, save; stored
  per-place on-device, legacy notes migrate as Insider tips, saves log to
  analytics with type.
- Mood menu: no orange border, square edges, flush to the block above, title
  set in logo-style lowercase at logo scale (exact typeface needs the font
  file; closest system weight until then). New GlowPin (white-dot pin with
  radar rings) replaces the mood pin and overlays the wordmark's i, anchored
  proportionally via LOGO_PIN constants (one-line nudge from a screenshot if
  the dot sits off).
- Experience pages: Back enlarged (globally, including the detail sheet's
  floating back 38->44), Save-to-lists is now a big heart icon, and a new
  map button opens the list in Google Maps as a multi-stop route (top picks
  as waypoints, capped at 9 by Google; a true "saved list" via URL does not
  exist, the route is the honest equivalent). Badge chips gain a caret; they
  were already links to their top-10 pages.
- Verify live: cuisine sheet stacking over an open detail, and the logo pin
  alignment.

## v3.16 - owner-curated Insider notes (editorial layer)
- New WAYFIND_NOTES layer beside the featured-boost system: name-keyed
  editorial tips rendering on the detail page as an "Insider notes" card with
  an explicit "Curated by Wayfind" label, so provenance is honest and this
  never impersonates review-derived data. This is the compliant version of
  the request to bake advice into place cards, and the honest slice of the
  reviewer's "Learning/Content" bucket.
- First entry: SeaWorld Orlando, four durable tips (Sharks Underwater Grill
  planning, All-Day Dining Deal trade-off, quick-service ranking, heat-timing
  strategy). Dollar figures deliberately omitted: hardcoded prices go stale
  and stale prices are lies. Maintenance rule: keep the set small and owner-
  verified; a wrong tip erodes trust exactly like wrong tags did.
- Adding places later is one map entry; long-term this field migrates to the
  scoped Supabase editorial layer keyed by placeId.

## v3.15 - header grouping + sign-in clarity + footer spacing
- Weather chip moved from the header's left group into the right group, sitting
  directly beside sign-in. The awkward mid-header gap was structural: with
  space-between, all leftover width landed between the two groups.
- Signed-out state is now a labeled pill (person icon + "Sign in"); signed-in
  keeps the compact initial circle, which explains itself.
- Footer dead band fixed: the 72px pre-footer spacer (old bottom-nav clearance)
  was stacking with the footer's own margins; reduced to 24.

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
