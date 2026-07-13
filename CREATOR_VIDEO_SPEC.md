# Creator-Video Discoverability Engine — build spec (grounded against the repo)

Paste-ready prompt for the coding agent. Every file reference below was verified
against the current tree. Build order is deliberate: the card first, the indexable
SEO surface second, scale third; durable place pages are a deferred foundation, not
a blocker.

---

```
GOAL: Turn real creator videos (TikTok, IG Reels, YouTube Shorts) tagged to places
into a discoverability + trust engine for Wayfind — combining UGC social proof,
video SEO, and shareability. Wayfind = Next.js 14, JS (not TS), inline-styles
convention, dark theme (#0D1117 bg, #F97316 orange, #94A3B8 slate).

GROUNDED CONTEXT (verified — do NOT re-derive, and do NOT contradict):
- The place detail view is a CLIENT SHEET in the SPA, reached via /?place=<id>. It
  is NOT a server-rendered page. The only per-place URL, app/p/[id]/page.js:32, is
  robots:{index:false} on purpose (share/app-state URL). => Any JSON-LD emitted on
  the place sheet or /p/[id] is INVISIBLE to Google. Schema must NOT go there.
- The place sheet ALREADY renders creator videos: Detail.js:496-514 ("Video reviews
  · Creators who covered this place on YouTube") maps a `videos` array into link-out
  <a target="_blank"> cards (thumb + title + channel). No embed, no schema. It is
  fed by the /api/youtube fetch in home.js:4036.
- app/api/youtube/route.js already pulls REAL, embeddable YouTube videos per place
  via the official YouTube Data API (videoEmbeddable=true is already set), returning
  {id,title,channel,thumb,url,published}. This is a ready, ToS-compliant source.
  NOTE: YOUTUBE_API_KEY may be unset in Vercel prod — if so this block renders empty
  today. An empty strip is a missing KEY, not a missing feature; do not "fix" it by
  removing the block.
- /trending and /featured are GREENFIELD (no route dir, zero references in app/lib).
- Individual places are NOT in app/sitemap.js and are not indexable anywhere today.

BUILD ORDER (ship as separate PRs, each: VERSION+BUILD_ID bump, CHANGELOG entry,
green `npm run prebuild`, `vN.NN: title` commit, iPhone-375px screenshot):
  Phase 1  — Evolve the place-sheet creator-video module (the card). Client only.
  Phase 2  — /trending/[city]: indexable pages + the video SEO schema. FIRST SEO win.
  Phase 3  — Scale, store, and the creator flywheel.
  Foundation (deferred, non-blocking) — durable indexable /places/[id] pages, which
             later unlock true PER-PLACE VideoObject + place metadata. Keep queued.

TIMING: Do NOT deploy during the active Google Places-429 incident (raise-the-quota
is owner-side, item C3). Build Phase 1 on a branch and PARK the PR; merge once the
core is healthy. Never deploy from a half-refactored tree — stage files explicitly.

SEED DATA (two creators, two cities — validates the multi-city /trending flow):
1. Spinning Coffee — Bradenton →
   https://www.tiktok.com/@cindy.selects/video/7661821646973586702 (creator @cindy.selects)
   TikTok: consume via official oEmbed. Never download / copy / re-host.
2. Mai-Kai Restaurant and Polynesian Show — 3599 N Federal Hwy, Fort Lauderdale, FL 33308 →
   https://www.facebook.com/share/r/1EPX6DN118/ (Facebook reel)
   Facebook has NO clean open embed/oEmbed without an FB app token, so treat it like the
   TikTok/IG manual path: click-to-load facade + followed link-out, NOT an API pull.
   The share link carries NO creator handle — supply the creator's name/handle during
   curation; do NOT fabricate one. Resolve Mai-Kai's Google Place ID and upsert it into
   wf_place_ids (city: Fort Lauderdale) so it hydrates like other seeded places (deferred
   in Phase 1 — blocked by the Places-429 / no local key; name+city match covers it).

CONTENT RULE (both seeds, esp. Mai-Kai): do NOT paste a creator's caption verbatim onto
Wayfind (copyright + duplicate content). Wayfind writes its OWN place description (e.g.
Mai-Kai: tiki landmark since 1956, Polynesian dinner show, reservations required, entrée
minimum). At most ONE short quoted line WITH attribution. The creator gets credit + the
backlink; Wayfind gets original, indexable copy.

── PHASE 1 — EVOLVE the place-sheet creator-video module (NOT a new card) ─────────
EVOLVE the existing block at Detail.js:496-514 — do NOT add a second, competing
"Featured on TikTok" card elsewhere (that would duplicate this one).
- Data model: a reusable module driven by a map keyed by the SAME id the app already
  uses for a place (params.id / the share URL id) — which may be a Google place_id,
  an "fsq:…" id, or a synthetic id. Do NOT assume a Google place_id. Store the id
  verbatim (prefix included). Each place → array of videos:
  { platform:'tiktok'|'instagram'|'youtube', url, creator?, caption?, thumbnail?,
    views?, postedAt? }. Support MULTIPLE videos and all three platforms from day 1.
- Two-tier layout, one section:
  * CURATED HERO (top): prominent full-width, fully-clickable card for the curated
    featured video (seed = the @cindy.selects TikTok on Spinning Coffee). Platform
    logo, headline "Featured on TikTok", subtext "Watch @creator's visit to {Place}",
    visible "Watch Video ↗" label + external-link glyph, strong border/elevation,
    generous padding, ≥44px tap target, subtle :active press. Must pass check:cards
    and check:design (no unicode-escape leaks; use the token colors).
  * SECONDARY STRIP (below): DEMOTE the existing auto-YouTube list into a compact
    "More video reviews" strip. Keep it sourced from /api/youtube (free reuse; it's
    already embeddable-flagged). TikTok/IG have no open API → manual curation only.
- Click: <a target="_blank" rel="noopener noreferrer"> (opens the native app when
  available, else a new tab). Attribute the creator (link the handle). NEVER re-host.
- NO JSON-LD here. This sheet is noindex; the card is for UX / social proof / the
  reshare loop only. (Schema lives in Phase 2.)

── PHASE 2 — /trending/[city]: indexable pages + video SEO (the real discoverability)
Build NEW indexable routes /trending/[city] (greenfield — you control them; make
them indexable from day one, unique H1 + description + canonical per city).
- Aggregate every video-tagged place in that city into a content-rich list.
- BUILD THE VIDEO PLAYERS IN: click-to-load facade (static thumbnail + play button →
  loads the official oEmbed/iframe on interaction). Because a real player renders
  here, you may legitimately emit VideoObject.
- Emit BOTH, server-rendered (like the guide pages' JSON-LD, NOT next/script
  beforeInteractive): ItemList (the canonical list/carousel shape) + one VideoObject
  per tagged video (name, description, thumbnailUrl, uploadDate, contentUrl/embedUrl,
  creator). GUARDRAIL: only emit VideoObject for a video that actually renders a
  player/facade on the page — schema/content mismatch gets you ignored or penalized.
  If a card has no player yet, ship ItemList-only for it and add VideoObject when the
  facade lands.
- CREATOR-BENEFIT (the durable win — REQUIRED, confirm in the PR description):
  * Each surfaced video is credited by the creator's name/handle, visibly.
  * The outbound link to the creator's video/profile MUST be a real FOLLOWED <a>.
    Do NOT copy the rel="noreferrer" pattern from Detail.js:504 onto these pages, and
    do NOT add rel="nofollow" — that would mute the backlink we are giving the creator.
  * VideoObject.contentUrl / embedUrl MUST point at the creator's ACTUAL video URL
    (real TikTok / YouTube / Facebook URL), never a Wayfind wrapper — honest schema,
    credit resolves to them.
- Internally link /trending/[city] from the city guides and the place cards.
- Add /trending/[city] to app/sitemap.js with a lastmod that bumps whenever the
  city's video set changes (freshness → recrawl). Confirm the new routes are
  indexable (robots/canonical) — do NOT copy the /p/[id] noindex.
- CSP: facades load third-party frames/scripts → update the CSP in app/layout.js
  (frame-src / script-src for the tiktok / instagram / youtube embed origins). This
  will interact with check-design — verify it stays green.
- Optional: a "Trending on TikTok near you" module on the home feed / city pages
  pulling all video-tagged places (a fresh, shareable return surface).

── PHASE 3 — Scale, store, and the creator flywheel ───────────────────────────────
- Store video↔place associations in Supabase, MIRRORING the shared-but-owned pattern
  just shipped for the cache (lib/serverCache.js + supabase/cache-hardening.sql):
  new table wf_place_videos, RLS enabled, anon READ only, service-role WRITE only.
  Ship the SQL as supabase/…-videos.sql for the owner to apply (non-destructive).
- Curation/moderation path to add/approve videos (quality gate: on-brand, a real
  visit). Manual curation first; the data model must be automation-ready. Note where
  a future TikTok/IG hashtag-or-location pull could plug in, but do NOT scrape
  platforms in violation of ToS. YouTube is already automated via /api/youtube.
- MONETIZATION (secondary to the flywheel): where the EXISTING scored resolver
  (lib/bookingResolver.js, threshold ≥0.72 in lib/verifiedOffers.js) already approves
  an offer for the place, surface the existing BookingCTA under the video ("Loved it
  on @creator's visit? Book it"), routed through lib/affiliates.js (Viator live,
  Stay22 hotelUrl verified earning, Ticketmaster ticketOutUrl pending). NEVER forced,
  NEVER fabricated; the video quality gate stays INDEPENDENT of whether it monetizes.
- CREATOR RESHARE LOOP (the PRIMARY ROI — free traffic + a backlink): for EACH featured
  creator (both seeds included), expose a one-click "reshare this feature" action so we
  can tag them for a reshare. Reciprocity: Wayfind's win is the reshare/backlink; the
  creator's win is the named credit + the FOLLOWED outbound link above. Wire BOTH sides.
- Analytics: fire PostHog on video-card view + click (place, platform, creator) so we
  can see which videos drive engagement.
- Refresh cadence: allow swapping in newer/higher-view videos; bump lastmod on swap.

── FOUNDATION (deferred, non-blocking) — durable indexable place pages ────────────
Later, build server-rendered indexable /places/[id] pages (this is the queued
"durable place routes" audit item). ONLY THEN does per-place VideoObject + strong
per-place metadata (title/description/canonical/LocalBusiness JSON-LD, OG/Twitter)
become worthwhile. Watch the thin-content risk (thousands of near-empty place docs
Google may decline to index) — gate on real content per page. Do NOT let this block
Phases 1-3.

── CROSS-CUTTING (do not skip) ────────────────────────────────────────────────────
- PERFORMANCE: facades only; never block LCP/TBT with a heavy embed on load. Protect
  Core Web Vitals (a ranking factor).
- A11Y: card is a real link/button with aria-label; external-link announced; captions
  where available.
- COMPLIANCE: official embed/oEmbed only, attribute + link the creator, never re-host,
  respect each platform's embed terms.

DELIVERABLE: phased PRs as above, each with a CHANGELOG entry, green prebuild, and an
iPhone-375px screenshot proving the card/page is prominent and tappable. Start Phase 1
by evolving Detail.js:496-514, seeded with Spinning Coffee — Bradenton.
```
