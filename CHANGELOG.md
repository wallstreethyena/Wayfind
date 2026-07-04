# Wayfind Changelog

Versioning starts at 1.0. Each shipped build gets the next number (1.1, 1.2, ...).
The running app shows the version in the footer ("Wayfind v1.0") so you can confirm
which build is live on Vercel. This file is the record so nothing gets lost.

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
