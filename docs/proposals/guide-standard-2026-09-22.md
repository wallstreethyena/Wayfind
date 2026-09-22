# The Wayfind guide standard (2026-09-22)

Owner: astra. Supersedes #1411 (sol/guides-experience-first-global) and #1413
(sol/fall-guide-house-cards-map) — both are cherry-picked onto this branch,
not re-done, plus what was missing to make the standard hold for every guide
going forward, not just the two it started on.

## What "the standard" means

Every guide Wayfind publishes — whether it is generated from the shared
`app/guides/[slug]/page.js` template or ships as its own bespoke route under
`app/guides/<slug>/` — follows the same rules:

1. **One place card.** A place is always shown as a `RailCard`
   (`app/components/RailCard.js`), horizontal-scrolling, score badge
   top-right, **no Directions button**. The Florida Fall Guide's own cards
   are the one documented look exception (see #1413) — every other guide's
   cards are the plain standard card. Never a hand-rolled `<div>` with a
   photo and a rating.
2. **One shared place-card stylesheet.** Any route that renders a `RailCard`
   (directly, through `GuidePlaceCard`, or through `GuideMapExplorer`) also
   imports and renders `WF_PLACE_CARD_CSS`
   (`app/components/css.js`) once, near the top of the page. Skipping this
   ships the card as unstyled HTML — see the "v8.14" comment in
   `app/guides/[slug]/page.js` for the incident that made this a rule.
3. **Experience-first copy.** Guides sell the place, the event, or the
   experience — not Wayfind, its methodology, or its provenance. No "Local
   guide" / "Found this on Wayfind" branding pitch, no visible sources or
   methodology block, no "How we rank" link, no bottom "Planning the rest of
   your trip?" upsell. That is enforced by `scripts/check-guides.mjs` (from
   #1411, cherry-picked here) and stays true for the bespoke routes too —
   they never had that copy to begin with.
4. **The disclosure, verbatim.** Any guide with outbound monetized links
   carries a sentence containing the literal substring `"may earn a
   commission"` — the string every FTC-disclosure guard in this repo
   (`check-guides.mjs`, `check-food-tour-rail.mjs`, `check-cuisine-shortlist.mjs`,
   and now `check-guide-standard.mjs`) actually greps for. Rewording it away
   (as #1411 did with "a commission may be earned...") passes a human read
   and fails the guard for a reason: a machine check needs the same words
   every time, not a paraphrase a person has to re-verify. Fixed in this
   branch — both the shared template and the Florida Fall Guide.
5. **Apple Maps, never a second map provider.** Any guide map is
   `CreatorAppleMap` (`app/components/CreatorAppleMap.js`, backed by
   `lib/creatorAppleMap.js`), not a new one.
6. **No dashes in public copy**, no new paid third-party APIs, and every
   affiliate link resolves through the existing commerce resolver
   (`lib/affiliates.js` / the guide's `bookingResolve` path in
   `GuideConversion.js`) — never a hand-built affiliate URL.

## The map + house-card rail + filters, generalized

The Florida Fall Guide (#1413) built a genuinely good pattern: an Apple Map
synced to a horizontal `RailCard` rail (viewing a card elevates its pin;
tapping a pin scrolls its card into view) with category-filter chips above
it. That pattern used to be bespoke to one guide
(`FallGuideExplorer.js`). This branch pulls it out into
**`app/components/GuideMapExplorer.js`** (styled by
`app/components/GuideMapExplorer.module.css`), a shared, config-driven
component:

```js
<GuideMapExplorer
  spots={spots}            // [{id, name, lat, lng, groups, city, when, detail, tip, href, image, category, primary_type}]
  filters={filters}        // optional [{id, label, family}] — omit to auto-derive from spots' own `groups`
  kicker="…" heading="…" description="…"
  proof={["…", "…", "…"]}  // the small trust badges above the map
  note="…"                 // the caption under the rail
  accent="#f97316"         // themeable via the --gme-accent CSS variable
/>
```

`GuideMapExplorer` no-ops (renders nothing) below 3 mappable spots, so it is
safe to wire in unconditionally.

### Wired into the shared template — zero bespoke code for a new guide

`app/guides/[slug]/page.js` now reads an optional `mapExplorer` field off a
guide's entry in `lib/guides.js`:

```js
// lib/guides.js
"some-new-guide": {
  // ...existing fields (title, picks, faq, ...)...
  mapExplorer: {
    spots: [ /* >=3 spots with lat/lng */ ],
    filters: [ /* optional */ ],
    kicker: "…", heading: "…", description: "…",
    proof: ["…"], note: "…", accent: "#hex",
  },
},
```

When `mapExplorer.spots.length >= 3`, the template renders the map + rail +
filters automatically, above the numbered picks. **A future guide with
several mappable places needs no new component, no new route, and no new
guard exemption — it is data.** This is the concrete answer to "make every
guide use one shared, good-looking standard so future guides are never
ugly": the ugliest failure mode (a new guide re-inventing its own map/rail
UI, badly) now has no path to exist.

### The Fall guide itself moved onto the shared component

`app/guides/florida-fall-festivals-2026/page.js` no longer has its own
`FallGuideExplorer.js` — it calls `GuideMapExplorer` directly with its own
`filters` (its category set has festival-specific icon families a generic
default should not guess at) and its own event-photo-id lookup (editorial
data, not something a shared component should invent). The map, the rail,
the card-to-pin sync, and the filter chips are now the exact same code the
shared template's opt-in uses — one implementation, not two that will drift.

### Pinto's Farm Miami: grandfathered, on purpose

`app/guides/pintos-farm-miami-2026/` renders no Wayfind place cards at all —
its `PintosFarmMap.js` is a farm-orientation diagram (one real location pin
plus static, non-place zone labels) and its gallery is Pinto's Farm's own
photos, credited under the owner-approved permission from #1417. There is
nothing here to port onto `RailCard`: porting would mean inventing place
identities (and scores) for a corn maze and a bounce pad that are not
separately Google Places. It is grandfathered explicitly in
`scripts/check-guide-standard.mjs`'s `EXEMPT_NO_PLACE_CARDS`, and that guard
**re-verifies the exemption on every run** — the day this route imports
`RailCard` or starts rendering `/api/photo?place=` cards, the guard fails
until the exemption is removed and the route is brought onto the standard.

## The guard: `scripts/check-guide-standard.mjs`

Registered in `scripts/guards.txt` (runs on `npm run prebuild`) and in
`scripts/lib/guard-registry.json` (regenerated with
`node scripts/lib/build-guard-registry.mjs`, never hand-edited). It fails
the build when:

- a bespoke `app/guides/<dir>/page.js` (any directory other than `[slug]`)
  does not import the shared `GuideArticleHero`;
- a bespoke guide directory renders a place photo (`/api/photo?ref=` or
  `?place=`) without importing `RailCard`, `GuidePlaceCard`,
  `IconicPlaceCard`, or `GuideMapExplorer` — a hand-rolled place card;
- a bespoke guide directory that DOES render place cards through an approved
  component does not import/render `WF_PLACE_CARD_CSS`, or carries no
  `"may earn a commission"` disclosure anywhere in its own source;
- a documented exemption in `EXEMPT_NO_PLACE_CARDS` no longer holds (the
  directory now shows the exact behavior it was exempted from);
- the shared template itself regresses off any of these same rules, or its
  `GuideMapExplorer` wiring is removed.

`scripts/check-guides.mjs` (from #1411) keeps owning the shared template's
own SEO/schema/experience-first-copy contract; `check-guide-standard.mjs` is
the new, narrower guard for "does every guide route — bespoke or not — use
the shared components", which nothing previously checked.

## What a future guide author actually does

- **A normal editorial guide** (picks, blurbs, an FAQ): add an entry to
  `lib/guides.js`. You automatically get the shared template, `RailCard`
  place cards, `WF_PLACE_CARD_CSS`, the disclosure, and experience-first
  copy rules. Add `mapExplorer: {spots: [...]}` if you have 3+ places with
  coordinates worth mapping — you get the map/rail/filters for free.
- **A guide that genuinely cannot fit the template** (a farm orientation
  map, a ticketing table, something structurally unlike a picks list): it
  still must import `GuideArticleHero`, and if it renders any Wayfind place
  card, that card must be a `RailCard` (directly or via
  `GuideMapExplorer`), with `WF_PLACE_CARD_CSS` and the disclosure. If it
  renders zero Wayfind place cards, add a documented, re-verified entry to
  `EXEMPT_NO_PLACE_CARDS` in `scripts/check-guide-standard.mjs` explaining
  why — the same honesty pattern `lib/photoSurfaces.js`'s own EXEMPT list
  uses.

There is no third option. A new guide is never ugly by omission, because the
guard fails the build before it ships.
