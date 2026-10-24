# Place pages pilot — evidence (2026-10-24)

## Claim check: "1275 thin place pages"

Live `https://www.gowayfind.com/sitemap.xml` (fetched 2026-10-24, browser UA)
lists **1,274** `/places/<id>` URLs of 2,878 total — the claim is accurate
(off by one). 464 are backed by publish-ready Atlas cards
(`data/atlas/editorial-cards.json`); the other ~810 resolve via GUIDES picks
or verified `wf_editorial` rows.

## What a visitor actually gets (8 sampled live pages)

All HTTP 200, indexable, **zero `<h2>` elements** (section labels are styled
`<div>`s). Total visible words include ~150 words of site chrome/footer.

| Page (type) | Words | Sections present | What the visitor learns |
|---|---|---|---|
| Art Ovation Hotel (hotel) | 389 | desc, hours, nearby | Art theme + rooftop; no who-for, no fee/parking cautions |
| Agave Bandido (restaurant) | 371 | desc, local tip, hours, nearby | Birria + speakeasy; tip present via editorial |
| Asolo Repertory Theatre (attraction) | 382 | desc, hours, nearby | State Theatre history; no ticketing/parking guidance |
| Beer Can Island (beach) | 409 | desc, best time, local tip, hours, nearby | Wild spit, walk-in; strongest of the eight |
| Bee Ridge Park (attraction) | 374 | desc, hours, nearby | Facilities list; no who-for (families/leagues) |
| 1592 Wood Fired (nightlife) | 437 | desc, best time, local tip, hours, nearby | Wood-fire take; no reservation/first-come patio note |
| Alvin's Island (shopping) | 354 | desc, hours ("Call to confirm"), nearby (1) | Budget beach shop; thinnest hours on the sample |
| Disney Springs (guide-only) | 333 | guide blurb, nearby (1) | One holiday blurb; no address, no hours |

Verdict: "thin" is fair. Each page is one researched paragraph plus hours
and nearby names. The gap is not word count — it is that practical,
decision-grade copy the repo already verifies never reaches the page.

## Available but unused vs genuinely missing

Already held, verified, unused by `mergePlacePage` (Atlas card fields,
464 cards): `bestFor` 455/464, `watchOut` 453/464, `vibeCheck` 464/464,
`insiderMove` 432/464, `hours` 415/464 (hours already rendered).

Rendered after this pilot (cohort only): `bestFor` as "Who it's for",
`watchOut` as "Good to know".

Not rendered, on evidence: `insiderMove` contains internal research
instructions on multiple cards ("Do not treat …", "stay off the rail",
"this pass") — not visitor-safe raw. `currentUsefulDetail` carries
"refresh before display" workflow notes. Both need an editorial cleaning
pass before they can ship; neither is invented or paraphrased here.

Genuinely missing (no current source): per-day structured hours, phone,
accessibility, live price levels. The Google Places Details cache enriches
some pages opportunistically, but it is not a durable source and the paid
details API is budget-closed — this pilot adds no API spend of any kind.
Zero Google calls: the pilot fields ride the existing in-memory Atlas card.

## Pilot cohort (10, all Florida, all with complete verified cards)

Asolo Repertory Theatre, Ca' d'Zan, Beer Can Island, Caspersen Beach Park,
Agave Bandido, Coquina Beach Cafe, Art Ovation Hotel, 1592 Wood Fired
Kitchen & Cocktails, Alvin's Island, Bee Ridge Park — ids in
`lib/placePilot.js`. Gate is in `mergePlacePage`, so off-cohort pages
(including the other 454 Atlas pages) render byte-for-byte as before.
Canonical contract untouched: `/places/<id>` stays canonical;
`/p/<id>` still defers via `durablePlaceUrl()`.

## Unlock for a wider rollout

1. Editorial pass that rewrites `insiderMove` into visitor-safe tips
   (strip research instructions) — unlocks a real "Local tip" for 432 places.
2. Decide the `vibeCheck` treatment (it overlaps the description on many
   cards) before rendering it anywhere.
3. Re-verify card facts dated 2026-07-18 before scaling past the cohort.
